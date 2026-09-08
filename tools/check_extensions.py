#!/usr/bin/env python3
"""The shared local/CI release gate. Never publishes or rewrites the registry."""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from extension_scanner import load_target, render_report, scan_target
from m12labs_extension_tool import REPO_ROOT, load_json, sha256_for_file, stage_extension


def check_archive(root: Path, release: dict, extension_id: str, scan: bool) -> dict:
    relative = Path(release['archive'])
    if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'packages':
        raise ValueError('Registry archive must be a local packages/ path.')
    archive = root / relative
    if sha256_for_file(archive) != release['sha256']:
        raise ValueError(f'Archive checksum mismatch: {relative}')
    manifest, _, structural, _ = load_target(archive)
    if structural:
        raise ValueError(f'Archive inventory/checksum mismatch: {relative}')
    if manifest['extension']['id'] != extension_id or manifest['package']['id'] != extension_id or manifest['package']['version'] != release['version']:
        raise ValueError(f'Archive identity/version mismatch: {relative}')
    if scan and render_report(scan_target(archive)):
        raise ValueError(f'Archive blocked: {relative}')
    return manifest


def check_repository(root: Path, base: str | None = None) -> None:
    registry = load_json(root / 'registry.json')
    previous = set()
    changed_archives = set()
    if base:
        old = json.loads(subprocess.check_output(['git', 'show', f'{base}:registry.json'], cwd=root, text=True))
        previous = {(p['id'], v['version'], v['sha256']) for p in old['packages'] for v in p['versions']}
        changed_archives = set(subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD', '--', 'packages'], cwd=root, text=True).splitlines())
    packages = {p['id']: p for p in registry['packages']}
    if len(packages) != len(registry['packages']):
        raise ValueError('Duplicate registry package identity.')
    sources = sorted((root / 'extensions').glob('*/extension.json'))
    if not sources:
        raise ValueError('No extension sources found.')
    if set(packages) != {p.parent.name for p in sources}:
        raise ValueError('Registry and source package identities differ.')

    for descriptor_path in sources:
        source = descriptor_path.parent
        descriptor = load_json(descriptor_path)
        extension_id = source.name
        if descriptor['extension']['id'] != extension_id or descriptor['package']['id'] != extension_id:
            raise ValueError(f'Source identity mismatch: {extension_id}')
        if not descriptor.get('compatiblePanelVersions'):
            raise ValueError(f'Compatibility declaration missing: {extension_id}')
        if render_report(scan_target(source)):
            raise ValueError(f'Source blocked: {extension_id}')
        build = stage_extension(source, publish_to_packages=False)
        if render_report(scan_target(build['archive_path'])):
            raise ValueError(f'Built archive blocked: {extension_id}')
        releases = packages[extension_id]['versions']
        if not releases or len({v['version'] for v in releases}) != len(releases):
            raise ValueError(f'Missing or duplicate release versions: {extension_id}')
        if releases[0]['version'] != descriptor['package']['version']:
            raise ValueError(f'Latest registry release does not match source: {extension_id}')
        for index, release in enumerate(releases):
            changed = release['archive'] in changed_archives or (base is not None and (extension_id, release['version'], release['sha256']) not in previous)
            published = check_archive(root, release, extension_id, scan=index == 0 or changed)
            if index == 0 and published != build['manifest']:
                raise ValueError(f'Published manifest/files differ from source; publish a new version: {extension_id}')
            changed_archives.discard(release['archive'])
    for relative in changed_archives:
        if Path(relative).suffix in {'.M12LabsExtension', '.zip'}:
            raise ValueError(f'Changed archive is not registered: {relative}')
    print(f'Validated {len(sources)} current packages and all registry checksums.')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', help='Git base commit for checking every changed/new release, including historical versions.')
    args = parser.parse_args()
    check_repository(REPO_ROOT, args.base)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
