#!/usr/bin/env python3
"""Static scanner for M12Labs extension packages.

A MANUAL-REVIEW AID, not a security gate: it flags common dangerous or
suspicious constructs so the human reviewing a PR (or an operator inspecting a
downloaded archive) knows where to look first. A clean scan does not mean an
extension is safe — read the code.

Usage (standalone or via the packaging tool):
    python3 tools/extension_scanner.py <archive|source-dir> [--fail-on warn|block] [--json]
    python3 tools/m12labs_extension_tool.py scan <archive|source-dir>

Accepts either a built .M12LabsExtension archive or an extensions/<id> source
directory. Pure standard library.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import tempfile
from dataclasses import dataclass, asdict
from pathlib import Path
from zipfile import ZipFile

MANIFEST_FILENAME = 'm12labs-extension.json'
SEVERITY_ORDER = {'info': 0, 'warn': 1, 'block': 2}

PHP_SUFFIXES = {'.php'}
JS_SUFFIXES = {'.ts', '.tsx', '.js', '.jsx'}


@dataclass
class Finding:
    severity: str  # info | warn | block
    rule: str
    file: str
    line: int
    message: str
    excerpt: str = ''


def allowed_roots(extension_id: str) -> tuple[str, str]:
    return (
        f'app/Extensions/Packages/{extension_id}/',
        f'frontend/src/extensions/packages/{extension_id}/',
    )


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def shannon_entropy(text: str) -> float:
    if not text:
        return 0.0
    counts: dict[str, int] = {}
    for ch in text:
        counts[ch] = counts.get(ch, 0) + 1
    total = len(text)
    return -sum((n / total) * math.log2(n / total) for n in counts.values())


# ---------------------------------------------------------------------------
# Target loading — normalises archive vs. source dir into (manifest, files)
# where files maps install-relative path -> file content bytes.
# ---------------------------------------------------------------------------

def load_target(target: Path) -> tuple[dict, dict[str, bytes], list[Finding], bool]:
    """Returns (manifest_or_descriptor, files, structural_findings, is_archive)."""
    findings: list[Finding] = []

    if target.is_dir():
        descriptor_path = target / 'extension.json'
        files_dir = target / 'files'
        if not descriptor_path.is_file():
            raise SystemExit(f'{target} is not an extension source directory (no extension.json).')
        manifest = json.loads(descriptor_path.read_text(encoding='utf-8'))
        files: dict[str, bytes] = {}
        if files_dir.is_dir():
            for path in sorted(p for p in files_dir.rglob('*') if p.is_file()):
                files[path.relative_to(files_dir).as_posix()] = path.read_bytes()
        return manifest, files, findings, False

    if not target.is_file():
        raise SystemExit(f'Scan target not found: {target}')

    with ZipFile(target, 'r') as archive:
        names = [n for n in archive.namelist() if not n.endswith('/')]
        try:
            manifest = json.loads(archive.read(MANIFEST_FILENAME).decode('utf-8'))
        except KeyError:
            raise SystemExit(f'{target} does not contain {MANIFEST_FILENAME}.')
        except json.JSONDecodeError as exc:
            raise SystemExit(f'{target} contains malformed manifest JSON: {exc}')

        files = {n: archive.read(n) for n in names if n != MANIFEST_FILENAME}

        declared = {}
        for entry in manifest.get('files', []) or []:
            if isinstance(entry, dict) and entry.get('path'):
                declared[entry['path']] = entry.get('sha256', '')

        for name in files:
            if name not in declared:
                findings.append(Finding('block', 'manifest.undeclared-file', name, 0,
                                        'File exists in the archive but is not declared in the manifest (the installer would never copy it, but it hides content from review).'))
        for path, checksum in declared.items():
            if path not in files:
                findings.append(Finding('block', 'manifest.missing-file', path, 0,
                                        'Manifest declares this file but the archive does not contain it.'))
            elif checksum and sha256_bytes(files[path]) != checksum:
                findings.append(Finding('block', 'manifest.checksum-mismatch', path, 0,
                                        'File content does not match its manifest sha256.'))

    return manifest, files, findings, True


# ---------------------------------------------------------------------------
# Structural / manifest checks
# ---------------------------------------------------------------------------

def check_structure(manifest: dict, files: dict[str, bytes], is_archive: bool) -> tuple[str, list[Finding]]:
    findings: list[Finding] = []
    extension_id = (manifest.get('extension') or {}).get('id') or ''
    if not extension_id:
        findings.append(Finding('block', 'manifest.no-id', 'extension.json', 0, 'Manifest declares no extension.id.'))
        return extension_id, findings

    roots = allowed_roots(extension_id)

    declared_paths = [e.get('path', '') for e in (manifest.get('files') or []) if isinstance(e, dict)] \
        if is_archive else list(files.keys())

    for path in declared_paths:
        if '..' in path.split('/') or path.startswith('/') or '\\' in path:
            findings.append(Finding('block', 'path.traversal', path, 0,
                                    'Path contains traversal or absolute segments; the installer rejects it.'))
        elif not path.startswith(roots):
            findings.append(Finding('block', 'path.outside-allowlist', path, 0,
                                    f'Path is outside the allowed install roots for "{extension_id}".'))

    backend_root, frontend_root = roots
    has_migrations = any(p.startswith(f'{backend_root}database/migrations/') for p in declared_paths)
    has_schedule = f'{backend_root}schedule.php' in declared_paths
    has_admin_routes = f'{backend_root}routes/admin.php' in declared_paths
    has_admin_page = f'{frontend_root}admin.tsx' in declared_paths
    declared_admin = (manifest.get('extension') or {}).get('admin')
    manifest_version = manifest.get('manifestVersion', 1)

    if (has_migrations or has_schedule or has_admin_routes or declared_admin) and manifest_version < 2:
        findings.append(Finding('warn', 'manifest.version-too-low', MANIFEST_FILENAME, 0,
                                'Uses v2 features (admin page / migrations / schedule / admin routes) without "manifestVersion": 2; the panel installer will reject this package.'))
    if declared_admin and not has_admin_page:
        findings.append(Finding('warn', 'manifest.admin-without-entry', MANIFEST_FILENAME, 0,
                                'extension.admin is declared but no admin.tsx ships; the admin page will never render.'))
    if has_admin_page and not declared_admin:
        findings.append(Finding('warn', 'manifest.entry-without-admin', f'{frontend_root}admin.tsx', 0,
                                'admin.tsx ships but extension.admin is not declared in the manifest.'))
    if not manifest.get('compatiblePanelVersions'):
        findings.append(Finding('warn', 'manifest.no-compat-versions', MANIFEST_FILENAME, 0,
                                'compatiblePanelVersions is empty; the package will install onto any panel version.'))

    meta_path = f'{frontend_root}meta.json'
    if meta_path in files:
        try:
            json.loads(files[meta_path].decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            findings.append(Finding('block', 'meta.invalid-json', meta_path, 0, 'meta.json is not valid JSON.'))

    return extension_id, findings


# ---------------------------------------------------------------------------
# PHP checks
# ---------------------------------------------------------------------------

PHP_BLOCK_CALLS = re.compile(r'(?<![\w$>])(eval|assert|exec|shell_exec|system|passthru|proc_open|popen|pcntl_exec)\s*\(')
PHP_BACKTICK = re.compile(r'(?<![\\\'"])`[^`\n]{2,}`')
PHP_B64_NEAR_EVAL = re.compile(r'base64_decode[\s\S]{0,200}?(eval|include|require|assert)\s*\(|(eval|include|require|assert)\s*\([\s\S]{0,200}?base64_decode')
PHP_HTTP_CALL = re.compile(r'''(file_get_contents|curl_init|curl_setopt|Http::\w+|fopen)\s*\(\s*['"](https?://[^'"]+)''')
PHP_RAW_SQL = re.compile(r'(DB::statement|DB::unprepared|->whereRaw|->selectRaw|->havingRaw|->orderByRaw)\s*\(')
PHP_SQL_INTERPOLATED = re.compile(r'(DB::statement|DB::unprepared|->whereRaw|->selectRaw|->havingRaw|->orderByRaw)\s*\(\s*("[^"]*\$|\'[^\']*\'\s*\.\s*\$|\$)')
PHP_FS_DELETE = re.compile(r'(?<![\w$>])(unlink|rmdir|File::delete|File::deleteDirectory|Storage::delete)\s*\(')
PHP_SUPERGLOBAL = re.compile(r'\$_(GET|POST|REQUEST|COOKIE)\b')
PHP_WITHOUT_MW = re.compile(r'withoutMiddleware')
PHP_ROUTE_CALL = re.compile(r'(?<![\w$>])Route::')
PHP_BARE_REQUEST = re.compile(r'function\s+\w+\s*\([^)]*(?<![\w\\])(Illuminate\\Http\\)?Request\s+\$')
PHP_SCHEMA_CREATE = re.compile(r'''Schema::create\(\s*['"]([^'"]+)['"]''')


def scan_php(extension_id: str, path: str, text: str) -> list[Finding]:
    findings: list[Finding] = []
    backend_root, _ = allowed_roots(extension_id)
    is_route_file = path.startswith(f'{backend_root}routes/') and path.endswith('.php')
    is_migration = path.startswith(f'{backend_root}database/migrations/')
    is_controller = '/Http/Controllers/' in path

    for i, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith(('//', '*', '/*', '#')):
            continue

        for match in PHP_BLOCK_CALLS.finditer(line):
            findings.append(Finding('block', f'php.dangerous-call.{match.group(1)}', path, i,
                                    f'Call to {match.group(1)}() — extensions must never execute code or shell commands dynamically.', stripped[:160]))
        if PHP_BACKTICK.search(line):
            findings.append(Finding('block', 'php.backtick-exec', path, i,
                                    'Backtick operator executes shell commands.', stripped[:160]))
        if 'Symfony\\Component\\Process' in line or 'Symfony\\Process' in line:
            findings.append(Finding('warn', 'php.symfony-process', path, i,
                                    'Uses Symfony Process (spawns OS processes) — verify what is executed and why.', stripped[:160]))
        for match in PHP_HTTP_CALL.finditer(line):
            findings.append(Finding('warn', 'php.external-http', path, i,
                                    f'Backend HTTP call to external host: {match.group(2)}', stripped[:160]))
        if PHP_SQL_INTERPOLATED.search(line):
            findings.append(Finding('warn', 'php.raw-sql-interpolated', path, i,
                                    'Raw SQL with interpolated/concatenated input — SQL injection risk; use bindings.', stripped[:160]))
        elif PHP_RAW_SQL.search(line):
            findings.append(Finding('info', 'php.raw-sql', path, i,
                                    'Raw SQL (static string). Verify no user input reaches it.', stripped[:160]))
        for match in PHP_FS_DELETE.finditer(line):
            if f'Extensions/Packages/{extension_id}' not in line and 'storage_path' not in line:
                findings.append(Finding('warn', 'php.delete-outside-package', path, i,
                                        f'{match.group(1)}() targeting a path that is not obviously inside the extension or storage — verify the target.', stripped[:160]))
        if PHP_SUPERGLOBAL.search(line):
            findings.append(Finding('warn', 'php.superglobal', path, i,
                                    'Direct superglobal access bypasses FormRequest validation/authorization.', stripped[:160]))
        if PHP_WITHOUT_MW.search(line):
            findings.append(Finding('block', 'php.without-middleware', path, i,
                                    'withoutMiddleware() can strip the inherited admin-auth stack from extension routes. Prohibited.', stripped[:160]))
        if PHP_ROUTE_CALL.search(line) and not is_route_file:
            findings.append(Finding('warn', 'php.route-outside-routes', path, i,
                                    'Route registration outside routes/*.php escapes the reviewed route surface.', stripped[:160]))
        if is_controller and PHP_BARE_REQUEST.search(line):
            findings.append(Finding('warn', 'php.bare-request', path, i,
                                    'Controller action takes a bare Request; use a FormRequest with permission()/authorize() instead.', stripped[:160]))

    if PHP_B64_NEAR_EVAL.search(text):
        findings.append(Finding('block', 'php.b64-near-eval', path, 0,
                                'base64_decode used near eval/include/assert — classic obfuscated-payload pattern.'))

    for match in PHP_SCHEMA_CREATE.finditer(text):
        table = match.group(1)
        prefix = f'ext_{extension_id}_'
        if not table.startswith(prefix):
            findings.append(Finding('block', 'php.schema-create-unprefixed', path, 0,
                                    f'Schema::create("{table}") is outside the extension\'s "{prefix}" table namespace.'))
        if not is_migration:
            findings.append(Finding('warn', 'php.schema-outside-migrations', path, 0,
                                    f'Schema::create("{table}") outside database/migrations/ — schema changes must ship as migrations so install/uninstall can track them.'))

    return findings


# ---------------------------------------------------------------------------
# JS / TS checks
# ---------------------------------------------------------------------------

JS_EVAL = re.compile(r'(?<![\w$.])(eval|Function)\s*\(')
JS_DYNAMIC_URL_IMPORT = re.compile(r'''import\s*\(\s*[`'"]https?://''')
JS_EXTERNAL_NET = re.compile(r'''(fetch|axios[.\w]*|XMLHttpRequest|WebSocket)\s*\(?[^)\n]{0,80}?['"`](https?:|wss?:)//([^'"`/\s]+)''')
JS_DOC_COOKIE = re.compile(r'document\.cookie')
JS_STORAGE_TOKEN = re.compile(r'(localStorage|sessionStorage)\s*[.\[][^\n]{0,60}(token|auth|session|jwt|secret)', re.IGNORECASE)
JS_HEX_HEAVY = re.compile(r'(\\x[0-9a-fA-F]{2}){12,}|(\\u[0-9a-fA-F]{4}){12,}')
JS_LONG_LITERAL = re.compile(r'''['"`]([A-Za-z0-9+/=_\-]{200,})['"`]''')


def scan_js(extension_id: str, path: str, text: str) -> list[Finding]:
    findings: list[Finding] = []

    for i, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith(('//', '*', '/*')):
            continue

        for match in JS_EVAL.finditer(line):
            if match.group(1) == 'Function' and 'new' not in line[:match.start()].rsplit(';', 1)[-1]:
                continue  # only `new Function(...)` builds code from strings
            findings.append(Finding('block', f'js.dynamic-code.{match.group(1).lower()}', path, i,
                                    'Dynamic code execution in extension UI code.', stripped[:160]))
        if JS_DYNAMIC_URL_IMPORT.search(line):
            findings.append(Finding('block', 'js.remote-import', path, i,
                                    'Dynamic import of a remote URL loads unreviewed code at runtime.', stripped[:160]))
        for match in JS_EXTERNAL_NET.finditer(line):
            findings.append(Finding('warn', 'js.external-network', path, i,
                                    f'Network call to external host: {match.group(3)} — panel data must not leave the panel without the operator knowing.', stripped[:160]))
        if JS_DOC_COOKIE.search(line):
            findings.append(Finding('block', 'js.document-cookie', path, i,
                                    'Reads/writes document.cookie — extension UIs have no business touching session cookies.', stripped[:160]))
        if JS_STORAGE_TOKEN.search(line):
            findings.append(Finding('warn', 'js.storage-token', path, i,
                                    'Web-storage access with a token/auth-like key — verify no credentials are being read or exfiltrated.', stripped[:160]))
        if JS_HEX_HEAVY.search(line):
            findings.append(Finding('warn', 'js.hex-obfuscation', path, i,
                                    'Dense hex/unicode escape sequences — possible obfuscated payload.', stripped[:120]))
        for match in JS_LONG_LITERAL.finditer(line):
            literal = match.group(1)
            if shannon_entropy(literal) > 4.5:
                findings.append(Finding('warn', 'js.high-entropy-literal', path, i,
                                        f'High-entropy {len(literal)}-char literal — possible embedded/obfuscated payload.', literal[:80] + '…'))

    return findings


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------

def scan_target(target: Path) -> list[Finding]:
    manifest, files, findings, is_archive = load_target(target)
    extension_id, structural = check_structure(manifest, files, is_archive)
    findings.extend(structural)

    if not extension_id:
        return findings

    for path, content in files.items():
        suffix = Path(path).suffix
        if suffix not in PHP_SUFFIXES | JS_SUFFIXES:
            continue
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            findings.append(Finding('warn', 'file.not-utf8', path, 0,
                                    'Code file is not valid UTF-8 — cannot be reviewed as text.'))
            continue

        if suffix in PHP_SUFFIXES:
            findings.extend(scan_php(extension_id, path, text))
        else:
            findings.extend(scan_js(extension_id, path, text))

    findings.sort(key=lambda f: (-SEVERITY_ORDER[f.severity], f.file, f.line))
    return findings


def render_report(findings: list[Finding], fail_on: str = 'block', as_json: bool = False) -> int:
    counts = {'block': 0, 'warn': 0, 'info': 0}
    for f in findings:
        counts[f.severity] += 1

    if as_json:
        print(json.dumps({'findings': [asdict(f) for f in findings], 'counts': counts}, indent=2))
    else:
        if not findings:
            print('Scan clean: no findings. (This is a review aid — still read the code.)')
        for f in findings:
            location = f'{f.file}:{f.line}' if f.line else f.file
            print(f'[{f.severity.upper():5}] {f.rule}  {location}')
            print(f'        {f.message}')
            if f.excerpt:
                print(f'        > {f.excerpt}')
        print(f'\nSummary: {counts["block"]} block, {counts["warn"]} warn, {counts["info"]} info.')

    threshold = SEVERITY_ORDER[fail_on]
    return 1 if any(SEVERITY_ORDER[f.severity] >= threshold for f in findings) else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Scan an M12Labs extension for common security problems (manual-review aid).')
    parser.add_argument('target', help='Path to a .M12LabsExtension archive or an extensions/<id> source directory')
    parser.add_argument('--fail-on', choices=['warn', 'block'], default='block')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)

    findings = scan_target(Path(args.target))
    return render_report(findings, fail_on=args.fail_on, as_json=args.json)


if __name__ == '__main__':
    sys.exit(main())
