#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import signing


REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / 'registry.json'
BUILD_ROOT = REPO_ROOT / '.build'
PACKAGES_ROOT = REPO_ROOT / 'packages'
MANIFEST_FILENAME = 'm12labs-extension.json'
MANIFEST_VERSION = 3
REGISTRY_SCHEMA_VERSION = 2

# Mirrors ExtensionCapabilityVocabulary::CAPABILITY_KEYS. The panel rejects a
# manifest naming anything outside this set, so the packager must too.
CAPABILITY_KEYS = {
    'routes', 'pages', 'permissions', 'database', 'hooks',
    'queues', 'schedule', 'commands', 'secrets', 'settings',
}


def package_filename(extension_id: str) -> str:
    return f'{extension_id}.M12LabsExtension'


def sha256_for_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def dump_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=2)
        handle.write('\n')


def ensure_registry() -> dict:
    if not REGISTRY_PATH.exists():
        return {
            'schemaVersion': REGISTRY_SCHEMA_VERSION,
            'repository': {
                'name': 'M12Labs Official Repository',
                'homepage': 'https://github.com/macery12/M12Labs-Extensions',
            },
            # Release keys, each authorized by a root signature over its own
            # record. A panel admits a key only when that signature verifies
            # against the root fingerprint it pins, so this block is safe to
            # serve over plain HTTPS from an untrusted mirror.
            'keys': [],
            'packages': [],
        }

    return load_json(REGISTRY_PATH)


def resolve_extension_dir(raw_path: str) -> Path:
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = (REPO_ROOT / raw_path).resolve()

    if not candidate.exists():
        raise SystemExit(f'Extension source directory not found: {candidate}')

    return candidate


def derive_v3_capabilities(extension_id: str, files_dir: Path, descriptor: dict) -> dict:
    """Cross-check the descriptor's capability block against the files tree.

    Capabilities are DECLARED, never inferred: the panel's parser refuses to
    install a surface the manifest does not name, precisely so an administrator
    approves a fixed list rather than whatever happens to be on disk. This
    function therefore does not build the block — it verifies that what the
    author declared and what the package ships agree in both directions, and
    fails the build when they do not.

    The panel enforces the same pairing at install time
    (ExtensionCapabilityFileValidator). Duplicating it here is deliberate: a
    publisher should learn about a mismatch when packaging, not from an
    operator's failed install.

    Returns {'capabilities': {...}, 'summary': {...}} where the summary is the
    untrusted display hint carried by the registry.
    """
    capabilities = descriptor.get('capabilities')
    if not isinstance(capabilities, dict):
        raise SystemExit(
            'extension.json must declare a "capabilities" object (manifest v3). '
            'An empty object is valid for a package with no privileged surface.'
        )

    unknown = sorted(set(capabilities) - CAPABILITY_KEYS)
    if unknown:
        raise SystemExit(
            f'Unknown capability key(s): {", ".join(unknown)}. '
            f'The panel rejects a manifest naming anything outside {", ".join(sorted(CAPABILITY_KEYS))}.'
        )

    backend_root = files_dir / 'app' / 'Extensions' / 'Packages' / extension_id
    frontend_root = files_dir / 'frontend' / 'src' / 'extensions' / 'packages' / extension_id

    def ships(*parts: str) -> bool:
        return (backend_root.joinpath(*parts)).is_file()

    def ships_any_under(root: Path) -> bool:
        return root.is_dir() and any(p.is_file() for p in root.rglob('*'))

    routes = capabilities.get('routes') or {}
    database = capabilities.get('database') or {}

    pairs = [
        ('capabilities.routes.client', bool(routes.get('client')),
         ships('routes', 'client.php'), f'app/Extensions/Packages/{extension_id}/routes/client.php'),
        ('capabilities.routes.admin', bool(routes.get('admin')),
         ships('routes', 'admin.php'), f'app/Extensions/Packages/{extension_id}/routes/admin.php'),
        ('capabilities.schedule', bool(capabilities.get('schedule')),
         ships('schedule.php'), f'app/Extensions/Packages/{extension_id}/schedule.php'),
        ('capabilities.database.migrations', bool(database.get('migrations')),
         ships_any_under(backend_root / 'database' / 'migrations'),
         f'app/Extensions/Packages/{extension_id}/database/migrations/'),
        ('capabilities.commands', bool(capabilities.get('commands')),
         ships_any_under(backend_root / 'Console' / 'Commands'),
         f'app/Extensions/Packages/{extension_id}/Console/Commands/'),
        ('capabilities.queues', bool(capabilities.get('queues')),
         ships_any_under(backend_root / 'Jobs'),
         f'app/Extensions/Packages/{extension_id}/Jobs/'),
    ]

    for capability, declared, shipped, path in pairs:
        if declared and not shipped:
            raise SystemExit(f'extension.json declares "{capability}" but files/ ships no {path}.')
        if shipped and not declared:
            raise SystemExit(f'files/ ships {path} but extension.json does not declare "{capability}".')

    # Hooks: every declared handler must ship, and every shipped handler must be
    # declared. An undeclared hook class is inert on the panel, but it is still
    # code the administrator was never shown.
    declared_hooks = {str(hook.get('handler', '')) for hook in (capabilities.get('hooks') or [])}
    for handler in sorted(declared_hooks):
        if not ships('Hooks', f'{handler}.php'):
            raise SystemExit(
                f'extension.json declares the hook handler "{handler}" but files/ ships no '
                f'app/Extensions/Packages/{extension_id}/Hooks/{handler}.php.'
            )
    hooks_dir = backend_root / 'Hooks'
    if hooks_dir.is_dir():
        for shipped_hook in sorted(hooks_dir.glob('*.php')):
            if shipped_hook.stem not in declared_hooks:
                raise SystemExit(
                    f'files/ ships Hooks/{shipped_hook.name} but extension.json does not declare it '
                    'under capabilities.hooks.'
                )

    # Pages: declared slug <-> pages/<surface>/<slug>.tsx. Supporting components
    # in a subdirectory beside a page need no declaration.
    pages = capabilities.get('pages') or {}
    for surface in ('server', 'admin'):
        declared_slugs = {str(page.get('slug', '')) for page in (pages.get(surface) or [])}
        surface_dir = frontend_root / 'pages' / surface

        for slug in sorted(declared_slugs):
            if not (surface_dir / f'{slug}.tsx').is_file():
                raise SystemExit(
                    f'extension.json declares the {surface} page "{slug}" but files/ ships no '
                    f'frontend/src/extensions/packages/{extension_id}/pages/{surface}/{slug}.tsx.'
                )

        if surface_dir.is_dir():
            for shipped_page in sorted(surface_dir.glob('*.tsx')):
                if shipped_page.stem not in declared_slugs:
                    raise SystemExit(
                        f'files/ ships pages/{surface}/{shipped_page.name} but extension.json does not '
                        f'declare it under capabilities.pages.{surface}.'
                    )

    # The v2 layout inferred surfaces from these filenames. Shipping one
    # alongside a v3 manifest is rejected by the panel, so reject it here too.
    for legacy in ('meta.json', 'index.tsx', 'admin.tsx'):
        if (frontend_root / legacy).is_file():
            raise SystemExit(
                f'files/ ships frontend/src/extensions/packages/{extension_id}/{legacy}, which belongs to '
                'the retired v2 layout. Declare pages under capabilities.pages and ship them as '
                'pages/<surface>/<slug>.tsx.'
            )

    for retired in ('route', 'admin', 'settingsSchema'):
        if retired in (descriptor.get('extension') or {}):
            raise SystemExit(
                f'extension.{retired} is a manifest v2 key and is rejected by the panel. '
                'Routes are loader-derived, admin pages are declared under capabilities.pages.admin, '
                'and settings fields under capabilities.settings.fields.'
            )
    if 'backend' in descriptor:
        raise SystemExit(
            'Top-level "backend" is a manifest v2 key and is rejected by the panel. '
            'Declare migrations, schedule and commands under "capabilities".'
        )

    return {'capabilities': capabilities, 'summary': capability_summary(capabilities)}


def capability_summary(capabilities: dict) -> dict:
    """The display-only hint the registry carries for a package.

    Deliberately counts and booleans rather than the capability block itself.
    Registry metadata is untrusted until the signed artifact is verified, so
    this exists to populate a catalog card and nothing else — the panel gates on
    the manifest inside the archive, never on this.
    """
    routes = capabilities.get('routes') or {}
    pages = capabilities.get('pages') or {}
    database = capabilities.get('database') or {}
    permissions = capabilities.get('permissions') or {}
    settings = capabilities.get('settings') or {}

    return {
        'serverPages': len(pages.get('server') or []),
        'adminPages': len(pages.get('admin') or []),
        'clientRoutes': bool(routes.get('client')),
        'adminRoutes': bool(routes.get('admin')),
        'migrations': bool(database.get('migrations')),
        'schedule': bool(capabilities.get('schedule')),
        'commands': len(capabilities.get('commands') or []),
        'hooks': sorted({str(hook.get('event', '')) for hook in (capabilities.get('hooks') or [])}),
        'queues': len(capabilities.get('queues') or []),
        'permissions': len(permissions.get('admin') or []),
        'secrets': len(capabilities.get('secrets') or []),
        'settings': len(settings.get('fields') or []),
    }


def validate_message_fragments(extension_id: str, files_dir: Path) -> None:
    """Validate any Paraglide message fragments the extension ships.

    Extensions may localize their UI by shipping catalogs at
        files/frontend/src/extensions/packages/<id>/messages/<locale>.json
    which the panel merges into its compile input at build time (see the panel's
    frontend/scripts/merge-extension-messages.mjs). Enforce the same contract the
    merge step relies on, so a non-conforming fragment fails at package time rather
    than silently breaking the panel build:

      - a base `en.json` must exist (it is the fallback for every other locale)
      - each file is a valid JSON object carrying the inlang `$schema` marker
      - every key is prefixed `ext.<id>.` (collision-proof namespacing)
      - non-base locales introduce no key absent from `en.json` (parity)

    A fragmentless extension is fine — this is a no-op then.
    """
    messages_dir = files_dir / 'frontend' / 'src' / 'extensions' / 'packages' / extension_id / 'messages'
    if not messages_dir.is_dir():
        return

    locale_files = sorted(messages_dir.glob('*.json'))
    if not locale_files:
        return

    prefix = f'ext.{extension_id}.'

    def keys_of(path: Path) -> set[str]:
        try:
            doc = load_json(path)
        except json.JSONDecodeError as err:
            raise SystemExit(f'{path.name} is not valid JSON: {err}')
        if not isinstance(doc, dict):
            raise SystemExit(f'{path.name} must be a JSON object of message keys.')
        if doc.get('$schema') != 'https://inlang.com/schema/inlang-message-format':
            raise SystemExit(
                f'{path.name} must include "$schema": "https://inlang.com/schema/inlang-message-format".'
            )
        keys = {k for k in doc if k != '$schema'}
        for key in keys:
            if not key.startswith(prefix):
                raise SystemExit(
                    f'{path.name} key "{key}" must be prefixed "{prefix}" '
                    f'(all extension message keys are namespaced to the extension id).'
                )
        return keys

    en_path = messages_dir / 'en.json'
    if not en_path.is_file():
        raise SystemExit(
            'Extension ships a messages/ directory but no messages/en.json — '
            'en is the base locale every other locale falls back to.'
        )

    base_keys = keys_of(en_path)
    for path in locale_files:
        if path.name == 'en.json':
            continue
        extra = keys_of(path) - base_keys
        if extra:
            raise SystemExit(
                f'{path.name} defines key(s) absent from en.json: {", ".join(sorted(extra))}. '
                'Every localized key must exist in the base en catalog.'
            )


def stage_extension(extension_dir: Path, debug: bool = False, publish_to_packages: bool = True) -> dict:
    descriptor_path = extension_dir / 'extension.json'
    files_dir = extension_dir / 'files'

    if not descriptor_path.exists():
        raise SystemExit(f'Missing descriptor: {descriptor_path}')
    if not files_dir.exists():
        raise SystemExit(f'Missing files directory: {files_dir}')

    from extension_scanner import render_report, scan_target

    if render_report(scan_target(extension_dir)):
        raise SystemExit('Extension scanner blocked this package; no release was written.')

    descriptor = load_json(descriptor_path)
    package_meta = descriptor.get('package', {})
    extension_meta = descriptor.get('extension', {})

    extension_id = extension_meta.get('id')
    version = package_meta.get('version')

    if not extension_id or not version:
        raise SystemExit('extension.json must define extension.id and package.version')

    stage_root = BUILD_ROOT / extension_id / version
    archive_name = package_filename(extension_id)
    if publish_to_packages:
        archive_dir = PACKAGES_ROOT / extension_id / version
        archive_path = archive_dir / archive_name
        cleanup_paths = [
            archive_dir / 'package.M12LabsExtension',
            archive_dir / 'package.zip',
        ]
    else:
        archive_dir = stage_root
        archive_path = stage_root / archive_name
        cleanup_paths = []

    if stage_root.exists():
        shutil.rmtree(stage_root)

    stage_root.mkdir(parents=True, exist_ok=True)

    manifest_files = []
    copied_files = []
    for source in sorted(path for path in files_dir.rglob('*') if path.is_file()):
        relative_path = source.relative_to(files_dir).as_posix()
        destination = stage_root / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        checksum = sha256_for_file(source)
        manifest_files.append({'path': relative_path, 'sha256': checksum})
        copied_files.append(relative_path)

    features = derive_v3_capabilities(extension_id, files_dir, descriptor)
    validate_message_fragments(extension_id, files_dir)

    declared_version = descriptor.get('manifestVersion')
    if declared_version is not None and declared_version != MANIFEST_VERSION:
        raise SystemExit(
            f'extension.json declares manifestVersion {declared_version!r}. '
            f'This tooling produces manifest version {MANIFEST_VERSION} only.'
        )

    manifest = dict(descriptor)
    manifest['manifestVersion'] = MANIFEST_VERSION
    manifest['files'] = manifest_files

    # Sign before the archive is written. The signature covers the canonical
    # manifest, which carries a sha256 for every shipped file — and the panel
    # installs only files the manifest lists, verifying each — so signing the
    # manifest commits to the whole package without the archive hash, which
    # could not be signed anyway (the signature ships inside the archive, so
    # covering the archive's hash would change it).
    #
    # Note what is signed: the manifest AS SHIPPED, integrity block included,
    # minus only `integrity.signature`. That is what the panel canonicalizes,
    # so signing anything else produces a signature that verifies nowhere.
    signature = None
    release_key, key_id = signing.release_key_from_env()
    if release_key is not None:
        manifest['integrity'] = {'signatureAlgorithm': 'ed25519', 'keyId': key_id}
        canonical = signing.canonicalize(manifest)
        signature_value = signing.sign(
            release_key,
            signing.artifact_message(extension_id, version, canonical),
        )
        manifest['integrity']['signature'] = signature_value
        signature = {
            'keyId': key_id,
            'value': signature_value,
            'canonicalManifestSha256': hashlib.sha256(canonical.encode('utf-8')).hexdigest(),
        }

    dump_json(stage_root / MANIFEST_FILENAME, manifest)

    archive_dir.mkdir(parents=True, exist_ok=True)
    for cleanup_path in cleanup_paths:
        if cleanup_path != archive_path and cleanup_path.exists():
            cleanup_path.unlink()

    with ZipFile(archive_path, 'w', compression=ZIP_DEFLATED) as archive:
        for file_path in sorted(
            path for path in stage_root.rglob('*') if path.is_file() and path.resolve() != archive_path.resolve()
        ):
            archive.write(file_path, file_path.relative_to(stage_root).as_posix())

    archive_checksum = sha256_for_file(archive_path)
    published_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

    result = {
        'extension_id': extension_id,
        'version': version,
        'descriptor': descriptor,
        'manifest': manifest,
        'capabilities': features['capabilities'],
        'capabilitySummary': features['summary'],
        'stage_root': stage_root,
        'archive_path': archive_path,
        'archive_checksum': archive_checksum,
        'published_at': published_at,
        'copied_files': copied_files,
        'release_entry': {
            'version': version,
            'archive': f'packages/{extension_id}/{version}/{archive_name}',
            'sha256': archive_checksum,
            'publishedAt': published_at,
            'manifestVersion': MANIFEST_VERSION,
            'compatiblePanelVersions': descriptor.get('compatiblePanelVersions', []),
            'revoked': False,
            **({'signature': signature} if signature is not None else {}),
        },
    }

    if debug:
        print(f'[debug] staged extension: {extension_id}@{version}')
        print(f'[debug] descriptor: {descriptor_path.relative_to(REPO_ROOT)}')
        print(f'[debug] stage root: {stage_root.relative_to(REPO_ROOT)}')
        print(f'[debug] copied files: {len(copied_files)}')
        for relative_path in copied_files:
            print(f'[debug]   - {relative_path}')

    return result


def update_registry(build_result: dict, debug: bool = False) -> dict:
    descriptor = build_result['descriptor']
    extension_meta = descriptor.get('extension', {})
    extension_id = build_result['extension_id']
    version = build_result['version']

    registry = ensure_registry()
    packages = registry.setdefault('packages', [])

    package_entry = None
    for entry in packages:
        if entry.get('id') == extension_id:
            package_entry = entry
            break

    if package_entry is None:
        package_entry = {'id': extension_id, 'versions': []}
        packages.append(package_entry)

    # Registry schema 2 carries identity and display metadata ONLY.
    #
    # Everything a panel gates on — routes, pages, permissions, settings fields —
    # was removed when the registry stopped being trusted: it is unauthenticated
    # metadata a repository can rewrite at will, and the panel now reads all of
    # it from the signed manifest inside the archive instead. `capabilitySummary`
    # is what remains, and it exists to fill in a catalog card before anything is
    # downloaded. The panel labels it as advertised-by-the-repository and
    # verifies at install.
    package_entry.update(
        {
            'id': extension_id,
            'name': extension_meta.get('name', extension_id),
            'description': extension_meta.get('description', ''),
            'author': extension_meta.get('author', 'M12Labs'),
            'icon': extension_meta.get('icon', 'puzzle'),
            'capabilitySummary': build_result['capabilitySummary'],
        }
    )

    for retired in ('route', 'surfaces', 'admin', 'settingsSchema'):
        package_entry.pop(retired, None)

    versions = [entry for entry in package_entry.get('versions', []) if entry.get('version') != version]
    versions.append(build_result['release_entry'])
    versions.sort(key=lambda entry: entry.get('publishedAt', ''), reverse=True)
    package_entry['versions'] = versions

    packages.sort(key=lambda entry: entry.get('id', ''))
    registry['schemaVersion'] = REGISTRY_SCHEMA_VERSION
    dump_json(REGISTRY_PATH, registry)

    if debug:
        print(f'[debug] updated registry entry for {extension_id}@{version}')

    return registry


def inspect_package(package_path: str, debug: bool = False) -> int:
    path = Path(package_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path = path.resolve()

    if not path.exists():
        print(f'Package file not found: {path}')
        return 1

    with ZipFile(path, 'r') as archive:
        try:
            manifest = json.loads(archive.read(MANIFEST_FILENAME).decode('utf-8'))
        except KeyError:
            print(f'{path} does not contain {MANIFEST_FILENAME}')
            return 1

    extension_id = manifest.get('extension', {}).get('id', 'unknown')
    version = manifest.get('package', {}).get('version', 'unknown')
    name = manifest.get('extension', {}).get('name', extension_id)
    files = manifest.get('files', [])

    file_paths = [entry.get('path', '') for entry in files]
    backend_prefix = f'app/Extensions/Packages/{extension_id}/'
    frontend_prefix = f'frontend/src/extensions/packages/{extension_id}/'
    surfaces = []
    if f'{frontend_prefix}index.tsx' in file_paths:
        surfaces.append('server page')
    if f'{frontend_prefix}admin.tsx' in file_paths:
        surfaces.append('admin page')
    if f'{backend_prefix}routes/client.php' in file_paths:
        surfaces.append('client routes')
    if f'{backend_prefix}routes/admin.php' in file_paths:
        surfaces.append('admin routes')
    if any(p.startswith(f'{backend_prefix}database/migrations/') for p in file_paths):
        surfaces.append('migrations')
    if f'{backend_prefix}schedule.php' in file_paths:
        surfaces.append('scheduled tasks')

    print(f'Extension: {name}')
    print(f'Id:        {extension_id}')
    print(f'Version:   {version}')
    print(f'Manifest:  v{manifest.get("manifestVersion", 1)}')
    print(f'Archive:   {path}')
    print(f'Files:     {len(files)}')
    print(f'Surfaces:  {", ".join(surfaces) if surfaces else "none detected"}')

    if debug:
        print('[debug] manifest:')
        print(json.dumps(manifest, indent=2))

    return 0


def build_command(args: argparse.Namespace) -> int:
    build_result = stage_extension(
        resolve_extension_dir(args.extension_source_dir),
        debug=args.debug,
        publish_to_packages=False,
    )
    print(f'Built {build_result["extension_id"]}@{build_result["version"]}')
    print(f'Archive: {build_result["archive_path"].relative_to(REPO_ROOT)}')
    print(f'SHA256:  {build_result["archive_checksum"]}')
    return 0


def publish_command(args: argparse.Namespace) -> int:
    build_result = stage_extension(
        resolve_extension_dir(args.extension_source_dir),
        debug=args.debug,
        publish_to_packages=True,
    )
    update_registry(build_result, debug=args.debug)
    print(f'Published {build_result["extension_id"]}@{build_result["version"]}')
    print(f'Archive: {build_result["archive_path"].relative_to(REPO_ROOT)}')
    print(f'SHA256:  {build_result["archive_checksum"]}')
    return 0


def sync_command(args: argparse.Namespace) -> int:
    return publish_command(args)


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='M12Labs extension packaging tool')
    subparsers = parser.add_subparsers(dest='command', required=True)

    build_parser = subparsers.add_parser('build', help='Build a .M12LabsExtension artifact from an extension source directory')
    build_parser.add_argument('extension_source_dir')
    build_parser.add_argument('--debug', action='store_true', help='Show detailed debug output')
    build_parser.set_defaults(func=build_command)

    publish_parser = subparsers.add_parser('publish', help='Build a .M12LabsExtension artifact and update registry.json')
    publish_parser.add_argument('extension_source_dir')
    publish_parser.add_argument('--debug', action='store_true', help='Show detailed debug output')
    publish_parser.set_defaults(func=publish_command)

    sync_parser = subparsers.add_parser('sync', help='Rebuild the package artifact and sync registry metadata from the extension source directory')
    sync_parser.add_argument('extension_source_dir')
    sync_parser.add_argument('--debug', action='store_true', help='Show detailed debug output')
    sync_parser.set_defaults(func=sync_command)

    inspect_parser = subparsers.add_parser('inspect', help='Inspect a .M12LabsExtension artifact and print its metadata')
    inspect_parser.add_argument('package_file')
    inspect_parser.add_argument('--debug', action='store_true', help='Show full manifest contents')
    inspect_parser.set_defaults(func=lambda args: inspect_package(args.package_file, debug=args.debug))

    scan_parser = subparsers.add_parser(
        'scan',
        help='Scan a .M12LabsExtension archive or an extensions/<id> source dir for common security problems (manual-review aid)',
    )
    scan_parser.add_argument('target', help='Path to a .M12LabsExtension archive or an extension source directory')
    scan_parser.add_argument('--fail-on', choices=['warn', 'block'], default='block', help='Exit non-zero when findings of this severity or higher exist (default: block)')
    scan_parser.add_argument('--json', action='store_true', help='Emit findings as JSON (for CI or tooling)')
    scan_parser.set_defaults(func=scan_command)

    key_parser = subparsers.add_parser(
        'authorize-key',
        help='Sign a release key record with the offline root key and record it in registry.json',
    )
    key_parser.add_argument('key_id', help='Stable identifier for the release key, e.g. m12labs-release-2026a')
    key_parser.add_argument('--root-key', required=True, help='Path to the offline root private key (base64)')
    key_parser.add_argument('--public-key', help='Base64 public key being authorized (preferred: no private key needed)')
    key_parser.add_argument('--release-key', help='Path to the release private key, when only it is at hand')
    key_parser.add_argument('--label', help='Human-readable description shown to operators')
    key_parser.add_argument('--valid-from', default='', help='ISO 8601 instant the key becomes usable')
    key_parser.add_argument('--valid-until', default='', help='ISO 8601 instant the key stops being usable')
    key_parser.add_argument('--revoke', action='store_true', help='Mark the key revoked instead of active')
    key_parser.set_defaults(func=authorize_key_command)

    return parser


def scan_command(args: argparse.Namespace) -> int:
    from extension_scanner import scan_target, render_report

    findings = scan_target(Path(args.target))
    return render_report(findings, fail_on=args.fail_on, as_json=args.json)


def authorize_key_command(args) -> int:
    """Authorize (or revoke) a release key by signing its record with the root.

    This is the only operation that touches the offline root key, and it is run
    on the machine that holds it — never in CI. The output is a key record plus
    a root signature over it, written into registry.json; a panel admits the key
    only when that signature verifies against the root fingerprint it pins, so
    the registry itself needs no authentication.

    Revoking is the same operation with --revoke: the record is re-signed with
    its status flipped. Revocation is one-way on the panel side, so a registry
    that later stops advertising it cannot un-revoke the key.
    """
    root_key = signing.load_private_key(args.root_key)
    root_public = signing.public_key_b64(root_key)

    if args.public_key:
        release_public = args.public_key.strip()
    elif args.release_key:
        release_public = signing.public_key_b64(signing.load_private_key(args.release_key))
    else:
        raise SystemExit('Pass --public-key (preferred) or --release-key to identify the key being authorized.')

    record = {
        'keyId': args.key_id,
        'publicKey': release_public,
        'label': args.label,
        'validFrom': args.valid_from,
        'validUntil': args.valid_until,
        'revoked': bool(args.revoke),
    }
    record['rootSignature'] = signing.sign(root_key, signing.key_record_message(record))

    registry = ensure_registry()
    keys = [k for k in registry.get('keys', []) if k.get('keyId') != args.key_id]
    keys.append(record)
    keys.sort(key=lambda k: k.get('keyId', ''))
    registry['keys'] = keys
    registry['schemaVersion'] = REGISTRY_SCHEMA_VERSION
    dump_json(REGISTRY_PATH, registry)

    print(f'{"Revoked" if args.revoke else "Authorized"} release key {args.key_id} in registry.json')
    print(f'  public key:      {release_public}')
    print(f'  valid:           {args.valid_from or "(always)"} -> {args.valid_until or "(never expires)"}')
    print()
    print('Pin these on the panel (config/extensions.php reads them from the environment):')
    print(f'  EXTENSIONS_SIGNING_ROOT_KEY={root_public}')
    print(f'  EXTENSIONS_SIGNING_ROOT_FINGERPRINT={signing.fingerprint(root_public)}')

    return 0


def main(argv: list[str] | None = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == '__main__':
    raise SystemExit(main())