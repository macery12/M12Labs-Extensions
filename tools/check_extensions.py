#!/usr/bin/env python3
"""The shared local/CI release gate. Never publishes or rewrites the registry.

Three things are checked, in order of what an attacker would have to defeat:

  1. **Trust.** Every release key in registry.json carries a root signature over
     its own record, verified against the root public key pinned in signing.py —
     not against anything the registry says about itself.
  2. **Provenance.** Every v3 release is signed by one of those keys, and the
     signature verifies against the manifest actually inside the archive.
  3. **Correspondence.** Every published archive matches its registry checksum,
     its own file inventory, and — for the current release — the source tree it
     claims to be built from.

Legacy v2 packages are validated but never rebuilt: manifest v2 is no longer
produced by this tooling, so a rebuild would fail by design rather than find a
problem. Their published archives are still checksum-verified so a silent edit
to packages/ is caught.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import signing
from extension_scanner import load_target, render_report, scan_target
from m12labs_extension_tool import (
    MANIFEST_VERSION,
    REGISTRY_SCHEMA_VERSION,
    REPO_ROOT,
    load_json,
    sha256_for_file,
    stage_extension,
)


def check_keys(registry: dict) -> dict[str, dict]:
    """Verify every release key against the pinned root. Returns usable keys by id.

    A key whose root signature does not verify is not merely ignored — it is a
    registry claiming an authority it was never granted, so the gate fails.
    """
    keys: dict[str, dict] = {}

    for key in registry.get('keys', []):
        key_id = key.get('keyId', '')
        if not key_id:
            raise ValueError('Registry key record has no keyId.')
        if key_id in keys:
            raise ValueError(f'Duplicate registry key id: {key_id}')

        signature = key.get('rootSignature', '')
        if not signature:
            raise ValueError(f'Registry key {key_id} carries no root signature.')

        record = {k: v for k, v in key.items() if k != 'rootSignature'}
        if not signing.verify(signing.ROOT_PUBLIC_KEY, signing.key_record_message(record), signature):
            raise ValueError(
                f'Registry key {key_id} is not signed by the pinned root. Either the record was edited '
                'after signing, or it was authorized by a different root.'
            )

        keys[key_id] = key

    return keys


def check_release_signature(release: dict, manifest: dict, keys: dict[str, dict], extension_id: str) -> None:
    """Verify a release's signature against the manifest inside its archive."""
    relative = release['archive']
    declared = release.get('signature')
    embedded = (manifest.get('integrity') or {}).get('signature')

    if declared is None and embedded is None:
        # An unsigned release is publishable — a panel with no root pinned still
        # installs it — but it is worth being loud about, because on a panel that
        # does pin a root it can declare neither hooks nor queues.
        print(f'  ! {extension_id} {release["version"]} is unsigned')
        return

    if declared is None or embedded is None:
        raise ValueError(
            f'Signature is present in only one of the registry entry and the archive manifest: {relative}. '
            'Both must agree, or a panel and an operator would see different provenance.'
        )

    if declared['value'] != embedded:
        raise ValueError(f'Registry signature does not match the archive manifest signature: {relative}')

    key = keys.get(declared['keyId'])
    if key is None:
        raise ValueError(f'Release {relative} is signed by unauthorized key {declared["keyId"]}.')
    if key.get('revoked'):
        raise ValueError(f'Release {relative} is signed by revoked key {declared["keyId"]}.')

    canonical = signing.canonicalize(manifest)
    message = signing.artifact_message(extension_id, release['version'], canonical)

    if not signing.verify(key['publicKey'], message, embedded):
        raise ValueError(
            f'Signature does not verify for {relative}. The manifest was modified after signing, or it was '
            'signed for a different id or version.'
        )

    advertised = declared.get('canonicalManifestSha256')
    if advertised and advertised != hashlib.sha256(canonical.encode('utf-8')).hexdigest():
        raise ValueError(f'Registry canonicalManifestSha256 does not match the archive manifest: {relative}')


def check_archive(root: Path, release: dict, extension_id: str, scan: bool, keys: dict[str, dict]) -> dict:
    relative = Path(release['archive'])
    if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'packages':
        raise ValueError('Registry archive must be a local packages/ path.')
    archive = root / relative
    if sha256_for_file(archive) != release['sha256']:
        raise ValueError(f'Archive checksum mismatch: {relative}')
    manifest, _, structural, _ = load_target(archive)
    if structural:
        raise ValueError(f'Archive inventory/checksum mismatch: {relative}')
    if (
        manifest['extension']['id'] != extension_id
        or manifest['package']['id'] != extension_id
        or manifest['package']['version'] != release['version']
    ):
        raise ValueError(f'Archive identity/version mismatch: {relative}')

    declared_version = release.get('manifestVersion')
    if declared_version is not None and manifest.get('manifestVersion', 2) != declared_version:
        raise ValueError(
            f'Registry says manifestVersion {declared_version} but the archive says '
            f'{manifest.get("manifestVersion", 2)}: {relative}'
        )

    if manifest.get('manifestVersion') == MANIFEST_VERSION:
        check_release_signature(release, manifest, keys, extension_id)
        # The scanner's structural rules are v3-only; running them over a v2
        # archive reports the whole package as unsupported, which is true but
        # not what this gate is looking for.
        if scan and render_report(scan_target(archive)):
            raise ValueError(f'Archive blocked: {relative}')

    return manifest


def without_provenance(manifest: dict) -> dict:
    """A manifest with its whole integrity block removed.

    Used to compare a published manifest against a fresh build of its source.
    The gate must reach the same verdict whether or not the runner holds a
    release key, and a keyless rebuild reproduces no part of that block — not
    the signature, and not the algorithm and key id that accompany it.

    Nothing is lost by excluding it: check_release_signature() has already
    verified the signature against a root-authorized key, which is a stronger
    statement than byte-equality with a local rebuild. Every other byte of the
    manifest, the file list included, still has to match exactly.
    """
    copy = json.loads(json.dumps(manifest))
    copy.pop('integrity', None)
    return copy


def check_repository(root: Path, base: str | None = None) -> None:
    registry = load_json(root / 'registry.json')

    if registry.get('schemaVersion') != REGISTRY_SCHEMA_VERSION:
        raise ValueError(
            f'Registry declares schemaVersion {registry.get("schemaVersion")!r}; '
            f'this tooling writes and validates {REGISTRY_SCHEMA_VERSION}.'
        )

    for retired in ('route', 'surfaces', 'admin', 'settingsSchema'):
        for package in registry['packages']:
            if retired in package:
                raise ValueError(
                    f'Registry package {package["id"]} still carries "{retired}". Schema 2 removed the fields a '
                    'panel used to gate on, because a repository can rewrite them at will.'
                )

    keys = check_keys(registry)

    previous = set()
    changed_archives = set()
    if base:
        old = json.loads(subprocess.check_output(['git', 'show', f'{base}:registry.json'], cwd=root, text=True))
        previous = {(p['id'], v['version'], v['sha256']) for p in old['packages'] for v in p['versions']}
        changed_archives = set(subprocess.check_output(
            ['git', 'diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD', '--', 'packages'],
            cwd=root, text=True,
        ).splitlines())

    packages = {p['id']: p for p in registry['packages']}
    if len(packages) != len(registry['packages']):
        raise ValueError('Duplicate registry package identity.')
    sources = sorted((root / 'extensions').glob('*/extension.json'))
    if not sources:
        raise ValueError('No extension sources found.')
    if set(packages) != {p.parent.name for p in sources}:
        raise ValueError('Registry and source package identities differ.')

    current = legacy = 0

    for descriptor_path in sources:
        source = descriptor_path.parent
        descriptor = load_json(descriptor_path)
        extension_id = source.name
        if descriptor['extension']['id'] != extension_id or descriptor['package']['id'] != extension_id:
            raise ValueError(f'Source identity mismatch: {extension_id}')
        if not descriptor.get('compatiblePanelVersions'):
            raise ValueError(f'Compatibility declaration missing: {extension_id}')

        releases = packages[extension_id]['versions']
        if not releases or len({v['version'] for v in releases}) != len(releases):
            raise ValueError(f'Missing or duplicate release versions: {extension_id}')
        if releases[0]['version'] != descriptor['package']['version']:
            raise ValueError(f'Latest registry release does not match source: {extension_id}')

        # A source still on manifest v2 is frozen: this tooling only produces v3,
        # so rebuilding it would fail on the version rather than find anything.
        # Its published archives are still verified below.
        is_current = descriptor.get('manifestVersion') == MANIFEST_VERSION
        build = None

        if is_current:
            current += 1
            if render_report(scan_target(source)):
                raise ValueError(f'Source blocked: {extension_id}')
            build = stage_extension(source, publish_to_packages=False)
            if render_report(scan_target(build['archive_path'])):
                raise ValueError(f'Built archive blocked: {extension_id}')
        else:
            legacy += 1
            print(f'  - {extension_id} is manifest v{descriptor.get("manifestVersion", 1)}; frozen, archives verified only')

        for index, release in enumerate(releases):
            changed = release['archive'] in changed_archives or (
                base is not None and (extension_id, release['version'], release['sha256']) not in previous
            )
            published = check_archive(root, release, extension_id, scan=index == 0 or changed, keys=keys)
            if index == 0 and build is not None and without_provenance(published) != without_provenance(build['manifest']):
                raise ValueError(f'Published manifest/files differ from source; publish a new version: {extension_id}')
            changed_archives.discard(release['archive'])

    for relative in changed_archives:
        if Path(relative).suffix in {'.M12LabsExtension', '.zip'}:
            raise ValueError(f'Changed archive is not registered: {relative}')

    print(
        f'Validated {len(keys)} release key(s) against the pinned root, '
        f'{current} current package(s), {legacy} frozen legacy package(s), and all registry checksums.'
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', help='Git base commit for checking every changed/new release, including historical versions.')
    args = parser.parse_args()
    check_repository(REPO_ROOT, args.base)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
