import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import m12labs_extension_tool as packaging
from extension_scanner import scan_target, render_report
from check_extensions import check_archive


class SecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'extensions/demo'
        self.files = self.source / 'files'
        self.files.mkdir(parents=True)
        self.descriptor = {'manifestVersion': 2, 'package': {'id': 'demo', 'version': '1.0.0'}, 'extension': {'id': 'demo', 'name': 'Demo', 'defaults': {'enabled': False}}, 'compatiblePanelVersions': ['>=Alpha 3.0 <Alpha 4.0']}
        (self.source / 'extension.json').write_text(json.dumps(self.descriptor))
        self.write('frontend/src/extensions/packages/demo/index.tsx', 'export default function Page() { return null; }')
        for name, value in [('BUILD_ROOT', self.root / '.build'), ('PACKAGES_ROOT', self.root / 'packages')]:
            context = patch.object(packaging, name, value)
            context.start()
            self.addCleanup(context.stop)

    def write(self, path, text):
        target = self.files / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def rules(self):
        return {f.rule for f in scan_target(self.source) if f.severity == 'block'}

    def test_current_roots_and_archive_roundtrip(self):
        self.assertFalse(self.rules())
        result = packaging.stage_extension(self.source)
        self.assertFalse([f for f in scan_target(result['archive_path']) if f.severity == 'block'])
        self.assertEqual(check_archive(self.root, result['release_entry'], 'demo', True), result['manifest'])

    def test_rejected_roots_and_identity(self):
        for path in ['resources/scripts/extensions/packages/demo/index.tsx', 'frontend/src/extensions/packages/other/index.tsx']:
            with self.subTest(path=path):
                self.write(path, 'export default null;')
                self.assertIn('path.outside-allowlist', self.rules())
                (self.files / path).unlink()

    def test_middleware_removal_blocks_publish_before_writing_release(self):
        self.write('app/Extensions/Packages/demo/routes/client.php', "<?php Route::get('/x', [Controller::class, 'index'])->withoutMiddleware('auth');")
        self.assertIn('php.without-middleware', self.rules())
        with self.assertRaises(SystemExit):
            packaging.stage_extension(self.source)
        self.assertFalse((self.root / 'packages').exists())

    def test_controller_requires_formrequest(self):
        self.write('app/Extensions/Packages/demo/Http/Controllers/DemoController.php', '<?php class DemoController {\n public function index(Request $request): array { return []; }\n}')
        self.assertIn('php.action-without-formrequest', self.rules())

    def test_archive_tampering_is_blocked(self):
        result = packaging.stage_extension(self.source)
        with ZipFile(result['archive_path'], 'a') as archive:
            archive.writestr('hidden.php', '<?php echo 1;')
        self.assertIn('manifest.undeclared-file', {f.rule for f in scan_target(result['archive_path'])})
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            check_archive(self.root, result['release_entry'], 'demo', True)

    def test_threshold_returns_failure(self):
        self.write('frontend/src/extensions/packages/demo/index.tsx', 'document.cookie;')
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(render_report(scan_target(self.source)), 1)

    def test_manifest_capability_mismatch_is_rejected(self):
        self.descriptor['extension']['admin'] = {'route': 'demo', 'label': 'Demo'}
        (self.source / 'extension.json').write_text(json.dumps(self.descriptor))
        with self.assertRaises(SystemExit):
            packaging.stage_extension(self.source)


if __name__ == '__main__':
    unittest.main()
