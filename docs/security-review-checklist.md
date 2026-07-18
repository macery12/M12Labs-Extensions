# Security Review Checklist

Every extension is manually reviewed and approved before it enters this repo.
Extensions run **unsandboxed** — arbitrary PHP on the backend and JS in the
panel bundle — so review is the real control. Run the
[scanner](scanner.md) first (`python3 tools/m12labs_extension_tool.py scan …`),
then work through this list. Scanner rule ids are noted where they map.

## Automated (scanner-flagged)

- [ ] Scan is clean, or every finding is understood and justified.
- [ ] No `eval`/`assert`/`exec`/`shell_exec`/`system`/`passthru`/`proc_open`/
      `popen`/backticks (`php.dangerous-call.*`, `php.backtick-exec`).
- [ ] No `base64_decode` feeding `eval`/`include` (`php.b64-near-eval`).
- [ ] No `withoutMiddleware()` anywhere (`php.without-middleware`).
- [ ] No `document.cookie`, `eval`, or `new Function` in frontend code
      (`js.document-cookie`, `js.dynamic-code.*`), no remote dynamic `import()`.
- [ ] Every `Schema::create` uses the `ext_<id>_` prefix and lives under
      `database/migrations/` (`php.schema-create-unprefixed`).
- [ ] All file paths are inside the two install roots for this extension id
      (`path.*`); archive matches its manifest (`manifest.*`).

## Manual

- [ ] **Routes**: `routes/admin.php` / `routes/client.php` set no prefix or
      middleware of their own and never strip inherited middleware. Admin routes
      inherit admin auth; client routes go through `extensions.access:<id>`.
- [ ] **Requests**: every controller action uses a FormRequest extending the
      right base with a `permission()`/`authorize()` — no bare `Request`, no
      direct `$_GET/$_POST` (`php.superglobal`, `php.bare-request`).
- [ ] **SQL**: no raw SQL with interpolated user input; queries use bindings
      (`php.raw-sql-interpolated`).
- [ ] **External calls**: any backend HTTP or frontend network call to an
      external host is expected, documented in the extension README, and does
      not exfiltrate panel/user data (`php.external-http`, `js.external-network`).
      No reading of tokens/credentials from web storage (`js.storage-token`).
- [ ] **Filesystem**: no writes/deletes outside the extension's own package dir
      or `storage/` (`php.delete-outside-package`).
- [ ] **Migrations**: `down()` fully drops what `up()` created; no FKs that
      would block core deletes; sensible retention if it accumulates rows.
- [ ] **Scheduler/commands**: commands early-exit when the extension is
      disabled; `schedule.php` only wires the scheduler (no side effects).
- [ ] **Secrets**: no hardcoded credentials, API keys, or tokens.
- [ ] **Manifest**: `compatiblePanelVersions` targets the real panel version
      (exact match, e.g. `Alpha 3.0`); `manifestVersion: 2` if it uses any v2
      feature; `backend`/`admin` declarations match the files.
- [ ] **UI**: colours are theme CSS variables (works in light + dark); strings
      are literal English (extensions can't use Paraglide yet).
- [ ] **Overall**: the code does what the description says and nothing more.
