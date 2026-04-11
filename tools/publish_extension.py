#!/usr/bin/env python3

from __future__ import annotations

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


def build_package(extension_dir: Path) -> None:
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
    archive_dir = PACKAGES_ROOT / extension_id / version
    archive_path = archive_dir / 'package.zip'

    if stage_root.exists():
        shutil.rmtree(stage_root)

    stage_root.mkdir(parents=True, exist_ok=True)

    manifest_files = []
    for source in sorted(path for path in files_dir.rglob('*') if path.is_file()):
        relative_path = source.relative_to(files_dir).as_posix()
        destination = stage_root / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        manifest_files.append(
            {
                'path': relative_path,
                'sha256': sha256_for_file(source),
            }
        )

    manifest = dict(descriptor)
    manifest['files'] = manifest_files

    dump_json(stage_root / 'm12labs-extension.json', manifest)

    archive_dir.mkdir(parents=True, exist_ok=True)
    with ZipFile(archive_path, 'w', compression=ZIP_DEFLATED) as archive:
        for file_path in sorted(path for path in stage_root.rglob('*') if path.is_file()):
            archive.write(file_path, file_path.relative_to(stage_root).as_posix())

    archive_checksum = sha256_for_file(archive_path)
    published_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')

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
        }
    )

    release_entry = {
        'version': version,
        'archive': f'packages/{extension_id}/{version}/package.zip',
        'sha256': archive_checksum,
        'publishedAt': published_at,
        'compatiblePanelVersions': descriptor.get('compatiblePanelVersions', []),
    }

    versions = [entry for entry in package_entry.get('versions', []) if entry.get('version') != version]
    versions.append(release_entry)
    versions.sort(key=lambda entry: entry.get('publishedAt', ''), reverse=True)
    package_entry['versions'] = versions

    packages.sort(key=lambda entry: entry.get('id', ''))
    dump_json(REGISTRY_PATH, registry)

    print(f'Published {extension_id}@{version}')
    print(f'Archive: {archive_path.relative_to(REPO_ROOT)}')
    print(f'SHA256:  {archive_checksum}')


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print('Usage: python3 tools/publish_extension.py <extension-source-dir>')
        return 1

    extension_dir = (REPO_ROOT / argv[1]).resolve()
    if not extension_dir.exists():
        print(f'Extension source directory not found: {extension_dir}')
        return 1

    build_package(extension_dir)
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))