# Extension Scanner

`tools/extension_scanner.py` statically scans an extension for common security
problems. It is a **manual-review aid** — it helps the reviewer (and operators)
find dangerous or suspicious code fast. **A clean scan does not mean an
extension is safe; read the code.** It is not a PHP sandbox. The repository publisher and required CI job refuse block findings before distribution.

## Running it

```bash
# via the packaging tool
python3 tools/m12labs_extension_tool.py scan extensions/my_ext
python3 tools/m12labs_extension_tool.py scan path/to/my_ext.M12LabsExtension

# or directly
python3 tools/extension_scanner.py extensions/my_ext [--fail-on warn|block] [--json]
```

Accepts either an `extensions/<id>` source directory or a built
`.M12LabsExtension` archive. Pure standard library — no dependencies.

- `--fail-on block` (default): exit non-zero when any block-severity finding
  exists. `--fail-on warn`: also fail on warnings.
- `--json`: machine-readable output for CI/tooling.

## Severities

- **block** — must not ship: `eval`/`exec`/`shell_exec`/`system`/backticks,
  `base64_decode` near `eval`, `withoutMiddleware()`, `document.cookie`,
  `eval`/`new Function` in JS, remote dynamic `import()`, `Schema::create`
  outside the `ext_<id>_` namespace, path-allowlist violations, archive/manifest
  mismatches (undeclared files, checksum mismatch), closure route handlers in
  `routes/*.php` (`php.route-closure`), public controller actions without a
  FormRequest parameter (`php.action-without-formrequest`), admin FormRequests
  (extending `ApplicationApiRequest`) that lack a `permission()` method
  (`php.admin-request-without-permission`).
- **warn** — review carefully: external HTTP/network calls (hosts listed), raw
  SQL with interpolation, `$_GET/$_POST` use, controllers taking a bare
  `Request`, `Route::` outside `routes/*.php`, token-like web-storage reads,
  obfuscation/high-entropy literals, missing `compatiblePanelVersions`.
- **info** — context only (e.g. raw SQL with a static string).

## What it does NOT do

It cannot prove safety, understand intent, or catch cleverly obfuscated logic.
It is a first pass. The authoritative control is human review against the
[security-review-checklist](security-review-checklist.md) before an extension
is approved into this repo.

## Required release checks

Run `python3 -m unittest discover -s tools/tests -p 'test_*.py' -v` and
`python3 tools/check_extensions.py` before a release. CI also passes `--base`
to scan every new or changed registry release and archive. The workflow job
**Extension security gate** must be configured as required in branch protection.
See the [README](../README.md#required-ci) for historical archive policy.
