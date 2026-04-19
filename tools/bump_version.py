#!/usr/bin/env python3
"""
Bump the version of an M12Labs extension and publish it.

Usage
-----
Interactive (guided prompts):
    python3 tools/bump_version.py

Non-interactive (fully scripted):
    python3 tools/bump_version.py <extension_id> <major|minor|patch|x.y.z>

Examples
--------
    python3 tools/bump_version.py                                  # interactive
    python3 tools/bump_version.py minecraft_icon_builder patch     # 1.0.0 → 1.0.1
    python3 tools/bump_version.py minecraft_icon_builder minor     # 1.0.0 → 1.1.0
    python3 tools/bump_version.py minecraft_icon_builder major     # 1.0.0 → 2.0.0
    python3 tools/bump_version.py minecraft_icon_builder 1.2.3     # explicit
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSIONS_ROOT = REPO_ROOT / 'extensions'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path) -> dict:
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)


def dump_json(path: Path, payload: dict) -> None:
    with path.open('w', encoding='utf-8') as fh:
        json.dump(payload, fh, indent=2)
        fh.write('\n')


def discover_extensions() -> dict[str, Path]:
    """Return {extension_id: extension_dir} for every extension that has an extension.json."""
    found: dict[str, Path] = {}
    if not EXTENSIONS_ROOT.is_dir():
        return found
    for candidate in sorted(EXTENSIONS_ROOT.iterdir()):
        descriptor = candidate / 'extension.json'
        if candidate.is_dir() and descriptor.exists():
            try:
                meta = load_json(descriptor)
                ext_id = meta.get('extension', {}).get('id', candidate.name)
            except (json.JSONDecodeError, OSError):
                ext_id = candidate.name
            found[ext_id] = candidate
    return found


def parse_semver(version: str) -> tuple[int, int, int]:
    parts = version.strip().lstrip('v').split('.')
    if len(parts) != 3:
        raise ValueError(f'Version must be x.y.z, got: {version!r}')
    return int(parts[0]), int(parts[1]), int(parts[2])


def bump_semver(current: str, bump: str) -> str:
    """Return a new semver string after applying bump (major/minor/patch/x.y.z)."""
    bump = bump.strip().lower()
    if bump in ('major', 'minor', 'patch'):
        major, minor, patch = parse_semver(current)
        if bump == 'major':
            return f'{major + 1}.0.0'
        if bump == 'minor':
            return f'{major}.{minor + 1}.0'
        return f'{major}.{minor}.{patch + 1}'
    # Treat it as an explicit version — validate it first.
    parse_semver(bump)
    return bump.lstrip('v')


def update_extension_json(extension_dir: Path, new_version: str) -> str:
    """Write the new version into extension.json and return the old version."""
    descriptor_path = extension_dir / 'extension.json'
    descriptor = load_json(descriptor_path)
    old_version = descriptor.get('package', {}).get('version', '?')
    descriptor.setdefault('package', {})['version'] = new_version
    dump_json(descriptor_path, descriptor)
    return old_version


# ---------------------------------------------------------------------------
# Interactive helpers
# ---------------------------------------------------------------------------

def prompt_choose_extension(extensions: dict[str, Path]) -> str:
    ids = list(extensions.keys())
    print('\nAvailable extensions:')
    for i, ext_id in enumerate(ids, 1):
        descriptor = load_json(extensions[ext_id] / 'extension.json')
        version = descriptor.get('package', {}).get('version', '?')
        name = descriptor.get('extension', {}).get('name', ext_id)
        print(f'  [{i}] {ext_id:<35} v{version}  ({name})')

    while True:
        raw = input('\nSelect extension (number or id): ').strip()
        if raw.isdigit():
            idx = int(raw) - 1
            if 0 <= idx < len(ids):
                return ids[idx]
            print(f'  ✗  Please enter a number between 1 and {len(ids)}.')
        elif raw in ids:
            return raw
        else:
            print('  ✗  Not recognised — try again.')


def prompt_bump_type(current_version: str) -> str:
    major, minor, patch = parse_semver(current_version)
    options = {
        '1': ('patch', f'{major}.{minor}.{patch + 1}'),
        '2': ('minor', f'{major}.{minor + 1}.0'),
        '3': ('major', f'{major + 1}.0.0'),
        '4': ('custom', None),
    }
    print(f'\nCurrent version: {current_version}')
    print('  [1] patch  →', options['1'][1])
    print('  [2] minor  →', options['2'][1])
    print('  [3] major  →', options['3'][1])
    print('  [4] custom version')

    while True:
        choice = input('\nChoose bump type [1-4]: ').strip()
        if choice in ('1', '2', '3'):
            return options[choice][0]
        if choice == '4':
            while True:
                custom = input('Enter version (x.y.z): ').strip()
                try:
                    parse_semver(custom)
                    return custom
                except ValueError as exc:
                    print(f'  ✗  {exc}')
        print('  ✗  Enter 1, 2, 3 or 4.')


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def run(extension_id: str, bump: str, debug: bool = False) -> int:
    extensions = discover_extensions()

    if extension_id not in extensions:
        print(f'✗  Extension {extension_id!r} not found in {EXTENSIONS_ROOT}')
        print(f'   Available: {", ".join(extensions) or "(none)"}')
        return 1

    extension_dir = extensions[extension_id]
    descriptor = load_json(extension_dir / 'extension.json')
    current_version = descriptor.get('package', {}).get('version', '0.0.0')

    try:
        new_version = bump_semver(current_version, bump)
    except ValueError as exc:
        print(f'✗  {exc}')
        return 1

    if new_version == current_version:
        print(f'✗  New version {new_version!r} is the same as the current version — nothing to do.')
        return 1

    print(f'\n  Extension : {extension_id}')
    print(f'  {current_version}  →  {new_version}')
    confirm = input('\nProceed? [y/N] ').strip().lower()
    if confirm not in ('y', 'yes'):
        print('Aborted.')
        return 0

    old_version = update_extension_json(extension_dir, new_version)
    print(f'✓  Updated extension.json  ({old_version} → {new_version})')

    # Delegate to the existing publish pipeline.
    print(f'\nPublishing {extension_id}@{new_version} …\n')
    from m12labs_extension_tool import main as tool_main  # noqa: PLC0415

    publish_args = ['publish', str(extension_dir)]
    if debug:
        publish_args.append('--debug')

    rc = tool_main(publish_args)
    if rc == 0:
        print(f'\n✓  Done — {extension_id} is now at v{new_version}')
    else:
        print(f'\n✗  Publish step failed (exit code {rc}). extension.json has already been updated to {new_version}.')
    return rc


def interactive_mode(debug: bool = False) -> int:
    extensions = discover_extensions()
    if not extensions:
        print(f'No extensions found under {EXTENSIONS_ROOT}')
        return 1

    extension_id = prompt_choose_extension(extensions)
    descriptor = load_json(extensions[extension_id] / 'extension.json')
    current_version = descriptor.get('package', {}).get('version', '0.0.0')
    bump = prompt_bump_type(current_version)
    print()
    return run(extension_id, bump, debug=debug)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description='Bump the version of an M12Labs extension and publish it.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        'extension_id',
        nargs='?',
        help='Extension id (e.g. minecraft_icon_builder). Omit for interactive mode.',
    )
    parser.add_argument(
        'bump',
        nargs='?',
        help='Bump type: major | minor | patch | x.y.z',
    )
    parser.add_argument('--debug', action='store_true', help='Pass --debug to the publish tool')
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = make_parser()
    args = parser.parse_args(argv)

    if args.extension_id and args.bump:
        return run(args.extension_id, args.bump, debug=args.debug)

    if args.extension_id or args.bump:
        parser.error('Provide both <extension_id> and <bump>, or neither for interactive mode.')

    return interactive_mode(debug=args.debug)


if __name__ == '__main__':
    raise SystemExit(main())