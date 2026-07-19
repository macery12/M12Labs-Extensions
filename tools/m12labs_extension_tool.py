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


REPO_ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = REPO_ROOT / 'registry.json'
BUILD_ROOT = REPO_ROOT / '.build'
PACKAGES_ROOT = REPO_ROOT / 'packages'
MANIFEST_FILENAME = 'm12labs-extension.json'


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
            'schemaVersion': 1,
            'repository': {
                'name': 'M12Labs Official Repository',
                'homepage': 'https://github.com/macery12/M12Labs-Extensions',
            },
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


def derive_v2_features(extension_id: str, files_dir: Path, descriptor: dict) -> dict:
    """Detect manifest-v2 surfaces from the files tree and validate that the
    descriptor's declarations agree with what actually ships.

    Returns {'backend': {...}, 'manifest_version': int, 'surfaces': [...]}.
    Raises SystemExit on any declaration/files mismatch so a package can never
    be built with a manifest the panel installer would reject.
    """
    backend_root = files_dir / 'app' / 'Extensions' / 'Packages' / extension_id
    frontend_root = files_dir / 'frontend' / 'src' / 'extensions' / 'packages' / extension_id

    has_migrations = bool(list((backend_root / 'database' / 'migrations').glob('*.php'))) \
        if (backend_root / 'database' / 'migrations').is_dir() else False
    has_schedule = (backend_root / 'schedule.php').is_file()
    has_admin_routes = (backend_root / 'routes' / 'admin.php').is_file()
    has_admin_page = (frontend_root / 'admin.tsx').is_file()
    has_server_page = (frontend_root / 'index.tsx').is_file()

    extension_meta = descriptor.get('extension', {})
    declared_admin = extension_meta.get('admin')

    meta_json_path = frontend_root / 'meta.json'
    meta_admin = None
    if meta_json_path.is_file():
        meta_admin = load_json(meta_json_path).get('admin')

    if declared_admin is not None:
        if not has_admin_page:
            raise SystemExit('extension.json declares extension.admin but files/ ships no admin.tsx entry.')
        if meta_admin is None:
            raise SystemExit('extension.json declares extension.admin but the frontend meta.json has no matching "admin" block (the panel loader discovers admin pages through meta.json).')
        for key in ('route', 'label'):
            if declared_admin.get(key) != meta_admin.get(key):
                raise SystemExit(f'extension.admin.{key} in extension.json does not match the "admin" block in meta.json.')
    elif has_admin_page or meta_admin is not None:
        raise SystemExit('files/ ships an admin page (admin.tsx / meta.json admin block) but extension.json does not declare extension.admin.')

    declared_backend = descriptor.get('backend', {})
    for key, actual in (('migrations', has_migrations), ('schedule', has_schedule)):
        declared = bool(declared_backend.get(key, False))
        if declared_backend and key in declared_backend and declared != actual:
            raise SystemExit(f'extension.json declares backend.{key}={str(declared).lower()} but the files tree says otherwise.')

    backend = {}
    if has_migrations:
        backend['migrations'] = True
    if has_schedule:
        backend['schedule'] = True
    if declared_backend.get('commands'):
        backend['commands'] = declared_backend['commands']

    surfaces = []
    if has_server_page:
        surfaces.append('server')
    if declared_admin is not None:
        surfaces.append('admin')

    uses_v2 = bool(backend or declared_admin is not None or has_admin_routes)
    declared_version = descriptor.get('manifestVersion')
    manifest_version = declared_version or (2 if uses_v2 else 1)
    if uses_v2 and manifest_version < 2:
        raise SystemExit('This extension uses admin pages, migrations, or scheduled tasks and must declare "manifestVersion": 2.')

    return {'backend': backend, 'manifest_version': manifest_version, 'surfaces': surfaces}


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

    features = derive_v2_features(extension_id, files_dir, descriptor)
    validate_message_fragments(extension_id, files_dir)

    manifest = dict(descriptor)
    manifest['files'] = manifest_files
    if features['manifest_version'] >= 2:
        manifest['manifestVersion'] = features['manifest_version']
        if features['backend']:
            manifest['backend'] = features['backend']
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
        'surfaces': features['surfaces'],
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
            'compatiblePanelVersions': descriptor.get('compatiblePanelVersions', []),
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

    package_entry.update(
        {
            'id': extension_id,
            'name': extension_meta.get('name', extension_id),
            'description': extension_meta.get('description', ''),
            'author': extension_meta.get('author', 'M12Labs'),
            'icon': extension_meta.get('icon', 'puzzle'),
            'route': extension_meta.get('route', extension_id),
            'settingsSchema': extension_meta.get('settingsSchema', []),
            # v2 metadata; panels that predate it ignore unknown keys.
            'surfaces': build_result.get('surfaces', ['server']),
            'admin': extension_meta.get('admin'),
        }
    )

    versions = [entry for entry in package_entry.get('versions', []) if entry.get('version') != version]
    versions.append(build_result['release_entry'])
    versions.sort(key=lambda entry: entry.get('publishedAt', ''), reverse=True)
    package_entry['versions'] = versions

    packages.sort(key=lambda entry: entry.get('id', ''))
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

    return parser


def scan_command(args: argparse.Namespace) -> int:
    from extension_scanner import scan_target, render_report

    findings = scan_target(Path(args.target))
    return render_report(findings, fail_on=args.fail_on, as_json=args.json)


def main(argv: list[str] | None = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == '__main__':
    raise SystemExit(main())