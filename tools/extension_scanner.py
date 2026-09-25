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


MANIFEST_VERSION = 3

# Mirrors ExtensionCapabilityVocabulary::CAPABILITY_KEYS.
CAPABILITY_KEYS = {
    'routes', 'pages', 'permissions', 'database', 'hooks',
    'queues', 'schedule', 'commands', 'secrets', 'settings',
    'privileged', 'bindings', 'streams', 'slots', 'flags', 'nav',
}


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
    manifest_version = manifest.get('manifestVersion')
    capabilities = manifest.get('capabilities')

    if manifest_version != MANIFEST_VERSION:
        findings.append(Finding('block', 'manifest.version-unsupported', MANIFEST_FILENAME, 0,
                                f'Declares manifestVersion {manifest_version!r}; the panel accepts version '
                                f'{MANIFEST_VERSION} only. v1 and v2 manifests carry no capability block, so every '
                                'privileged surface would have to be inferred — which is exactly what v3 removes.'))
        return extension_id, findings

    if not isinstance(capabilities, dict):
        findings.append(Finding('block', 'manifest.no-capabilities', MANIFEST_FILENAME, 0,
                                'Declares no "capabilities" object. Missing means denied, so a manifest without one '
                                'grants nothing — but the omission is more likely a mistake than an intent.'))
        capabilities = {}

    unknown = sorted(set(capabilities) - CAPABILITY_KEYS)
    if unknown:
        findings.append(Finding('block', 'manifest.unknown-capability', MANIFEST_FILENAME, 0,
                                f'Declares unknown capability key(s): {", ".join(unknown)}. The panel rejects a '
                                'manifest naming anything outside its vocabulary rather than ignoring it.'))

    for retired, replacement in (
        ('extension.route', 'routes are derived by the loader from capabilities.routes'),
        ('extension.admin', 'declare admin pages under capabilities.pages.admin'),
        ('extension.settingsSchema', 'declare settings under capabilities.settings.fields'),
    ):
        section, key = retired.split('.')
        if key in (manifest.get(section) or {}):
            findings.append(Finding('block', 'manifest.retired-key', MANIFEST_FILENAME, 0,
                                    f'"{retired}" is a manifest v2 key the panel rejects; {replacement}.'))

    if 'backend' in manifest:
        findings.append(Finding('block', 'manifest.retired-key', MANIFEST_FILENAME, 0,
                                'Top-level "backend" is a manifest v2 key the panel rejects; declare migrations, '
                                'schedule and commands under "capabilities".'))

    # Capability <-> files, in both directions. A declared surface with no file
    # fails at runtime; a shipped file with no declaration is code the
    # administrator was never shown. The panel enforces the same pairing at
    # install (ExtensionCapabilityFileValidator).
    routes = capabilities.get('routes') or {}
    database = capabilities.get('database') or {}
    pages = capabilities.get('pages') or {}

    def ships(path: str) -> bool:
        return path in declared_paths

    def ships_under(prefix: str) -> bool:
        return any(p.startswith(prefix) for p in declared_paths)

    for capability, declared, shipped, where in (
        ('capabilities.routes.client', bool(routes.get('client')),
         ships(f'{backend_root}routes/client.php'), f'{backend_root}routes/client.php'),
        ('capabilities.routes.admin', bool(routes.get('admin')),
         ships(f'{backend_root}routes/admin.php'), f'{backend_root}routes/admin.php'),
        ('capabilities.schedule', bool(capabilities.get('schedule')),
         ships(f'{backend_root}schedule.php'), f'{backend_root}schedule.php'),
        ('capabilities.database.migrations', bool(database.get('migrations')),
         ships_under(f'{backend_root}database/migrations/'), f'{backend_root}database/migrations/'),
        ('capabilities.commands', bool(capabilities.get('commands')),
         ships_under(f'{backend_root}Console/Commands/'), f'{backend_root}Console/Commands/'),
        ('capabilities.queues', bool(capabilities.get('queues')),
         ships_under(f'{backend_root}Jobs/'), f'{backend_root}Jobs/'),
    ):
        if declared and not shipped:
            findings.append(Finding('block', 'capability.declared-without-files', MANIFEST_FILENAME, 0,
                                    f'Declares "{capability}" but ships no {where}.'))
        elif shipped and not declared:
            findings.append(Finding('block', 'capability.files-without-declaration', where, 0,
                                    f'Ships {where} but does not declare "{capability}"; the panel will refuse to '
                                    'install a package whose files exceed its manifest.'))

    declared_handlers = {str(h.get('handler', '')) for h in (capabilities.get('hooks') or []) if isinstance(h, dict)}
    for handler in sorted(declared_handlers):
        if not ships(f'{backend_root}Hooks/{handler}.php'):
            findings.append(Finding('block', 'capability.declared-without-files', MANIFEST_FILENAME, 0,
                                    f'Declares the hook handler "{handler}" but ships no '
                                    f'{backend_root}Hooks/{handler}.php.'))
    for path in declared_paths:
        if path.startswith(f'{backend_root}Hooks/') and path.endswith('.php'):
            if path[len(f'{backend_root}Hooks/'):-len('.php')] not in declared_handlers:
                findings.append(Finding('block', 'capability.files-without-declaration', path, 0,
                                        'Ships a hook handler that capabilities.hooks does not declare. It would be '
                                        'inert on the panel, but it is still unreviewed code on the deletion path.'))

    for surface in ('server', 'admin'):
        declared_slugs = {str(p.get('slug', '')) for p in (pages.get(surface) or []) if isinstance(p, dict)}
        prefix = f'{frontend_root}pages/{surface}/'

        for slug in sorted(declared_slugs):
            if not ships(f'{prefix}{slug}.tsx'):
                findings.append(Finding('block', 'capability.declared-without-files', MANIFEST_FILENAME, 0,
                                        f'Declares the {surface} page "{slug}" but ships no {prefix}{slug}.tsx.'))

        for path in declared_paths:
            # Only the page entry itself needs declaring; supporting components
            # may sit in a subdirectory beside it.
            if path.startswith(prefix) and path.endswith('.tsx') and '/' not in path[len(prefix):]:
                if path[len(prefix):-len('.tsx')] not in declared_slugs:
                    findings.append(Finding('block', 'capability.files-without-declaration', path, 0,
                                            f'Ships a {surface} page that capabilities.pages.{surface} does not '
                                            'declare.'))

    # Slots: declared entry <-> slots/<entry>.tsx, both directions. An entry is
    # a slug, never a path. An undeclared slot matters more than an undeclared
    # page: a slot mounts on pages the user did not navigate to, so it is code
    # running somewhere the administrator was never shown.
    declared_entries = {str(s.get('entry', '')) for s in (capabilities.get('slots') or []) if isinstance(s, dict)}
    slot_prefix = f'{frontend_root}slots/'

    for entry in sorted(declared_entries):
        if not ships(f'{slot_prefix}{entry}.tsx'):
            findings.append(Finding('block', 'capability.declared-without-files', MANIFEST_FILENAME, 0,
                                    f'Declares the frontend slot entry "{entry}" but ships no '
                                    f'{slot_prefix}{entry}.tsx.'))

    for path in declared_paths:
        # Only a top-level entry is mounted; supporting components may sit in a
        # subdirectory below slots/.
        if path.startswith(slot_prefix) and path.endswith('.tsx') and '/' not in path[len(slot_prefix):]:
            if path[len(slot_prefix):-len('.tsx')] not in declared_entries:
                findings.append(Finding('block', 'capability.files-without-declaration', path, 0,
                                        'Ships a frontend slot entry that capabilities.slots does not declare.'))

    # Bindings: one-directional. A declared binding must ship its class; the
    # reverse is not a fault, since a package ships plenty of classes it has no
    # reason to share.
    for binding in (capabilities.get('bindings') or []):
        binding = str(binding)

        if not re.fullmatch(r'[A-Z][A-Za-z0-9]*(/[A-Z][A-Za-z0-9]*)*', binding):
            findings.append(Finding('block', 'capability.binding-malformed', MANIFEST_FILENAME, 0,
                                    f'Declares the binding "{binding}", which is not a StudlyCase path inside the '
                                    'package. The file and the class name are both derived from it, which is what '
                                    'keeps a binding from naming anything outside its own directory.'))
        elif not ships(f'{backend_root}{binding}.php'):
            findings.append(Finding('block', 'capability.declared-without-files', MANIFEST_FILENAME, 0,
                                    f'Declares the binding "{binding}" but ships no {backend_root}{binding}.php.'))

    # Privileged services are consent, not containment: the panel runs package
    # PHP in-process either way. Surface them so a reviewer reads them.
    for privilege in sorted({str(p) for p in (capabilities.get('privileged') or [])}):
        findings.append(Finding('info', 'capability.privileged', MANIFEST_FILENAME, 0,
                                f'Declares the privileged service "{privilege}". An administrator approves this at '
                                'install and again if an update adds one; confirm the package genuinely needs it.'))

    for legacy in ('meta.json', 'index.tsx', 'admin.tsx'):
        if ships(f'{frontend_root}{legacy}'):
            findings.append(Finding('block', 'layout.v2-remnant', f'{frontend_root}{legacy}', 0,
                                    'Belongs to the retired v2 layout, which inferred surfaces from filenames. '
                                    'Declare pages under capabilities.pages and ship them as '
                                    'pages/<surface>/<slug>.tsx.'))

    if not manifest.get('compatiblePanelVersions'):
        findings.append(Finding('warn', 'manifest.no-compat-versions', MANIFEST_FILENAME, 0,
                                'compatiblePanelVersions is empty; the package will install onto any panel version.'))

    # Only meaningful for a built artifact. A source tree has no signature by
    # construction — signing happens at build time, from a key the working copy
    # does not hold.
    if is_archive and not (manifest.get('integrity') or {}).get('signature'):
        findings.append(Finding('warn', 'manifest.unsigned', MANIFEST_FILENAME, 0,
                                'Carries no signature. A panel with a pinned root admits it only with an explicit '
                                'operator acknowledgement, and blocks hooks, queues and dangerous permissions.'))

    return extension_id, findings


# ---------------------------------------------------------------------------
# PHP checks
# ---------------------------------------------------------------------------

# `(?<!function )` because a method may legitimately be *named* one of these.
# `AiMessage::system()` is a factory for a system-role message, not a call to
# PHP's system(); refusing an install over a declaration would be a gate that
# cannot be satisfied except by renaming working code.
PHP_BLOCK_CALLS = re.compile(r'(?<![\w$>])(?<!function )(eval|assert|exec|shell_exec|system|passthru|proc_open|popen|pcntl_exec)\s*\(')
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
# A verb route whose handler is a closure (fn/function after the argument
# comma, or as sole fallback() argument). Route::group() closures are fine.
PHP_ROUTE_CLOSURE = re.compile(
    r'Route::(?:get|post|put|patch|delete|options|any|match|fallback)'
    r'\s*\(\s*(?:[^;]{0,200}?,\s*)?(?:static\s+)?(?:fn\s*\(|function\s*\()', re.S)
PHP_PUBLIC_METHOD = re.compile(r'public\s+(?:static\s+)?function\s+(\w+)\s*\(([^)]*)\)', re.S)
PHP_TYPED_PARAM = re.compile(r'([\w\\]+)\s+\$\w+')


def has_form_request_param(params: str) -> bool:
    """True when any parameter's type is a FormRequest subclass by naming
    convention (ends in "Request" but is not the bare Illuminate Request)."""
    for match in PHP_TYPED_PARAM.finditer(params):
        basename = match.group(1).rsplit('\\', 1)[-1]
        if basename.endswith('Request') and basename != 'Request':
            return True
    return False


def php_code_view(text: str) -> str:
    """A copy of the source with comments and string bodies blanked out.

    Same length, same line breaks, same offsets — only the bytes inside a
    comment or a string literal become spaces. Detection runs against this;
    excerpts still come from the original, so a finding quotes the real line.

    This is what the panel's own PHP scanner does (ExtensionPhpSourceView), and
    the reason is the same: prose is full of things that look like code. A
    docblock describing a tool's `next` field, or a prompt written for a model
    in Markdown, is not a shell command — and a gate that refuses an install
    over a sentence in a comment is worse than no gate, because the author
    cannot tell a real finding from a quoted one.
    """
    out = list(text)
    i, n = 0, len(text)
    while i < n:
        ch = text[i]

        if ch == '/' and i + 1 < n and text[i + 1] == '/':
            while i < n and text[i] != '\n':
                out[i] = ' '
                i += 1
            continue

        if ch == '#':
            while i < n and text[i] != '\n':
                out[i] = ' '
                i += 1
            continue

        if ch == '/' and i + 1 < n and text[i + 1] == '*':
            out[i] = out[i + 1] = ' '
            i += 2
            while i < n and not (text[i] == '*' and i + 1 < n and text[i + 1] == '/'):
                if text[i] != '\n':
                    out[i] = ' '
                i += 1
            if i < n:
                out[i] = ' '
                if i + 1 < n:
                    out[i + 1] = ' '
                i += 2
            continue

        if ch in ('"', "'"):
            quote = ch
            i += 1
            while i < n and text[i] != quote:
                if text[i] == '\\':
                    out[i] = ' '
                    i += 1
                    if i < n and text[i] != '\n':
                        out[i] = ' '
                    i += 1
                    continue
                if text[i] != '\n':
                    out[i] = ' '
                i += 1
            i += 1
            continue

        # Heredoc and nowdoc: everything up to the closing label is content.
        if ch == '<' and text.startswith('<<<', i):
            j = i + 3
            while j < n and text[j] in ' \t':
                j += 1
            wrap = ''
            if j < n and text[j] in ('"', "'"):
                wrap = text[j]
                j += 1
            label_start = j
            while j < n and (text[j].isalnum() or text[j] == '_'):
                j += 1
            label = text[label_start:j]
            if not label:
                i += 1
                continue
            if wrap and j < n and text[j] == wrap:
                j += 1
            end = text.find('\n' + label, j)
            if end == -1:
                end = n
            for k in range(j, min(end, n)):
                if text[k] != '\n':
                    out[k] = ' '
            i = min(end + 1 + len(label), n)
            continue

        i += 1

    return ''.join(out)


def scan_php(extension_id: str, path: str, text: str) -> list[Finding]:
    findings: list[Finding] = []
    backend_root, _ = allowed_roots(extension_id)
    is_route_file = path.startswith(f'{backend_root}routes/') and path.endswith('.php')
    is_migration = path.startswith(f'{backend_root}database/migrations/')
    is_controller = '/Http/Controllers/' in path
    is_form_request = '/Http/Requests/' in path

    # Two views of the same bytes at identical offsets. `code` has comments and
    # string bodies blanked out and is what the operator/keyword rules read, so
    # a backtick in a docblock table or a Markdown code span inside a prompt
    # written for a model is not mistaken for the shell operator.
    #
    # The content rules keep reading the real line, because blanking is exactly
    # what would hide what they look for: an interpolated variable inside a raw
    # SQL string, or the host in a hardcoded URL.
    code = php_code_view(text)
    source_lines = text.splitlines()
    code_lines = code.splitlines()

    for i, line in enumerate(source_lines, start=1):
        stripped = line.strip()
        code_line = code_lines[i - 1] if i - 1 < len(code_lines) else ''

        if stripped.startswith(('//', '*', '/*', '#')):
            continue

        for match in PHP_BLOCK_CALLS.finditer(code_line):
            findings.append(Finding('block', f'php.dangerous-call.{match.group(1)}', path, i,
                                    f'Call to {match.group(1)}() — extensions must never execute code or shell commands dynamically.', stripped[:160]))
        if PHP_BACKTICK.search(code_line):
            findings.append(Finding('block', 'php.backtick-exec', path, i,
                                    'Backtick operator executes shell commands.', stripped[:160]))
        if 'Symfony\\Component\\Process' in code_line or 'Symfony\\Process' in code_line:
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
        if PHP_SUPERGLOBAL.search(code_line):
            findings.append(Finding('warn', 'php.superglobal', path, i,
                                    'Direct superglobal access bypasses FormRequest validation/authorization.', stripped[:160]))
        if PHP_WITHOUT_MW.search(code_line):
            findings.append(Finding('block', 'php.without-middleware', path, i,
                                    'withoutMiddleware() can strip the inherited admin-auth stack from extension routes. Prohibited.', stripped[:160]))
        if PHP_ROUTE_CALL.search(code_line) and not is_route_file:
            findings.append(Finding('warn', 'php.route-outside-routes', path, i,
                                    'Route registration outside routes/*.php escapes the reviewed route surface.', stripped[:160]))
        if is_controller and PHP_BARE_REQUEST.search(code_line):
            findings.append(Finding('warn', 'php.bare-request', path, i,
                                    'Controller action takes a bare Request; use a FormRequest with permission()/authorize() instead.', stripped[:160]))

    if is_route_file:
        for match in PHP_ROUTE_CLOSURE.finditer(code):
            line_no = code[:match.start()].count('\n') + 1
            findings.append(Finding('block', 'php.route-closure', path, line_no,
                                    'Route handler is a closure — extension routes must use [Controller::class, \'method\'] so the action goes through a reviewable FormRequest and survives route:cache.',
                                    text.splitlines()[line_no - 1].strip()[:160]))

    if is_controller:
        for match in PHP_PUBLIC_METHOD.finditer(code):
            method, params = match.group(1), match.group(2)
            if method.startswith('__') and method != '__invoke':
                continue
            if not has_form_request_param(params):
                line_no = code[:match.start()].count('\n') + 1
                findings.append(Finding('block', 'php.action-without-formrequest', path, line_no,
                                        f'Public controller method "{method}" has no FormRequest parameter — every action must validate/authorize through a FormRequest (make non-action helpers protected/private).',
                                        f'public function {method}({params.strip()[:100]})'))

    if is_form_request and 'extends ApplicationApiRequest' in text and 'function permission(' not in text:
        findings.append(Finding('block', 'php.admin-request-without-permission', path, 0,
                                'Admin FormRequest (extends ApplicationApiRequest) does not define permission() — every admin endpoint needs an explicit admin-permission gate.'))

    if PHP_B64_NEAR_EVAL.search(code):
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

    # Localization fragments are data, not code — no allowed-root exception is
    # needed (they live under the frontend package root) — but flag their presence
    # so a reviewer knows the panel will merge them into its Paraglide catalog.
    _, frontend_root = allowed_roots(extension_id)
    messages_prefix = f'{frontend_root}messages/'
    fragment_locales = sorted(
        Path(path).stem for path in files
        if path.startswith(messages_prefix) and path.endswith('.json')
    )
    if fragment_locales:
        findings.append(Finding('info', 'i18n.message-fragments', f'{messages_prefix}*.json', 0,
                                f'Ships Paraglide message fragments (locales: {", ".join(fragment_locales)}) '
                                f'merged into the panel catalog under the ext.{extension_id}. namespace.'))

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
