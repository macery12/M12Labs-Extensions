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
import signing
import m12labs_extension_tool as packaging
from extension_scanner import scan_target, render_report
from check_extensions import check_archive, check_keys, check_release_signature, without_provenance


class SecurityTests(unittest.TestCase):
    """Regression tests for the ways a package could get privileges it never declared."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'extensions/demo'
        self.files = self.source / 'files'
        self.files.mkdir(parents=True)
        self.descriptor = {
            'manifestVersion': 3,
            'package': {'id': 'demo', 'version': '1.0.0', 'publisher': 'm12labs'},
            'extension': {
                'id': 'demo',
                'name': 'Demo',
                'icon': 'puzzle',
                'defaults': {'enabled': False},
            },
            'compatiblePanelVersions': ['>=Alpha 4.0 <Alpha 5.0'],
            'capabilities': {
                'pages': {
                    'server': [{
                        'slug': 'overview',
                        'labelKey': 'ext.demo.nav.overview',
                        'icon': 'puzzle',
                        'category': 'general',
                    }],
                },
            },
        }
        self.save_descriptor()
        self.write(
            'frontend/src/extensions/packages/demo/pages/server/overview.tsx',
            'export default function Page() { return null; }',
        )
        for name, value in [('BUILD_ROOT', self.root / '.build'), ('PACKAGES_ROOT', self.root / 'packages')]:
            context = patch.object(packaging, name, value)
            context.start()
            self.addCleanup(context.stop)

    def save_descriptor(self):
        (self.source / 'extension.json').write_text(json.dumps(self.descriptor))

    def write(self, path, text):
        target = self.files / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def rules(self):
        return {f.rule for f in scan_target(self.source) if f.severity == 'block'}

    # -- install roots and round trip ------------------------------------

    def test_current_roots_and_archive_roundtrip(self):
        self.assertFalse(self.rules())
        result, public_key = self.signed()
        self.assertFalse([f for f in scan_target(result['archive_path']) if f.severity == 'block'])
        published = check_archive(
            self.root,
            result['release_entry'],
            'demo',
            True,
            keys={'test-key': {'publicKey': public_key, 'revoked': False}},
        )
        self.assertEqual(without_provenance(published), without_provenance(result['manifest']))

    def test_rejected_roots_and_identity(self):
        for path in [
            'resources/scripts/extensions/packages/demo/pages/server/x.tsx',
            'frontend/src/extensions/packages/other/pages/server/x.tsx',
        ]:
            with self.subTest(path=path):
                self.write(path, 'export default null;')
                self.assertIn('path.outside-allowlist', self.rules())
                (self.files / path).unlink()

    # -- code that escapes the loader's gates ----------------------------

    def test_middleware_removal_blocks_publish_before_writing_release(self):
        self.descriptor['capabilities']['routes'] = {'client': True}
        self.save_descriptor()
        self.write(
            'app/Extensions/Packages/demo/routes/client.php',
            "<?php Route::get('/x', [Controller::class, 'index'])->withoutMiddleware('auth');",
        )
        self.assertIn('php.without-middleware', self.rules())
        with self.assertRaises(SystemExit):
            packaging.stage_extension(self.source)
        self.assertFalse((self.root / 'packages').exists())

    def test_controller_requires_formrequest(self):
        self.write(
            'app/Extensions/Packages/demo/Http/Controllers/DemoController.php',
            '<?php class DemoController {\n public function index(Request $request): array { return []; }\n}',
        )
        self.assertIn('php.action-without-formrequest', self.rules())

    def test_archive_tampering_is_blocked(self):
        result, _ = self.signed()
        with ZipFile(result['archive_path'], 'a') as archive:
            archive.writestr('hidden.php', '<?php echo 1;')
        self.assertIn('manifest.undeclared-file', {f.rule for f in scan_target(result['archive_path'])})
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            check_archive(self.root, result['release_entry'], 'demo', True, keys={})

    def test_threshold_returns_failure(self):
        self.write('frontend/src/extensions/packages/demo/pages/server/overview.tsx', 'document.cookie;')
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(render_report(scan_target(self.source)), 1)

    # -- manifest v3: declarations and files must agree ------------------

    def test_capability_declared_without_files_is_rejected(self):
        self.descriptor['capabilities']['schedule'] = True
        self.save_descriptor()
        self.assertIn('capability.declared-without-files', self.rules())
        with self.assertRaises(SystemExit):
            packaging.stage_extension(self.source)

    def test_files_without_declaration_are_rejected(self):
        """A shipped surface the manifest never named is code nobody approved."""
        self.write('app/Extensions/Packages/demo/schedule.php', '<?php return function () {};')
        self.assertIn('capability.files-without-declaration', self.rules())
        with self.assertRaises(SystemExit):
            packaging.stage_extension(self.source)

    def test_undeclared_page_is_rejected(self):
        self.write('frontend/src/extensions/packages/demo/pages/server/secret.tsx', 'export default null;')
        self.assertIn('capability.files-without-declaration', self.rules())

    def test_v2_manifest_is_rejected(self):
        self.descriptor['manifestVersion'] = 2
        self.descriptor['extension']['route'] = 'demo'
        self.save_descriptor()
        self.assertIn('manifest.version-unsupported', self.rules())
        with self.assertRaises(SystemExit):
            packaging.stage_extension(self.source)

    def test_v2_layout_remnants_are_rejected(self):
        for legacy in ('meta.json', 'index.tsx', 'admin.tsx'):
            with self.subTest(legacy=legacy):
                self.write(f'frontend/src/extensions/packages/demo/{legacy}', '{}')
                self.assertIn('layout.v2-remnant', self.rules())
                (self.files / f'frontend/src/extensions/packages/demo/{legacy}').unlink()

    def test_unknown_capability_key_is_rejected(self):
        self.descriptor['capabilities']['sudo'] = True
        self.save_descriptor()
        self.assertIn('manifest.unknown-capability', self.rules())
        with self.assertRaises(SystemExit):
            packaging.stage_extension(self.source)

    # -- signing -------------------------------------------------------

    def signed(self):
        """Stage the package with an ephemeral release key."""
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        key = Ed25519PrivateKey.generate()
        with patch.object(signing, 'release_key_from_env', return_value=(key, 'test-key')):
            result = packaging.stage_extension(self.source)
        return result, signing.public_key_b64(key)

    def test_a_signed_package_verifies_against_its_own_manifest(self):
        result, public_key = self.signed()
        signature = result['release_entry']['signature']

        self.assertEqual('test-key', signature['keyId'])
        self.assertTrue(signing.verify(
            public_key,
            signing.artifact_message('demo', '1.0.0', signing.canonicalize(result['manifest'])),
            signature['value'],
        ))

    def test_publish_refuses_to_write_an_unsigned_release(self):
        with patch.object(signing, 'release_key_from_env', return_value=(None, None)):
            with self.assertRaisesRegex(SystemExit, 'Publishing requires'):
                packaging.stage_extension(self.source)

        self.assertFalse((self.root / 'packages').exists())

    def test_local_build_can_remain_unsigned_but_repository_gate_rejects_it(self):
        with patch.object(signing, 'release_key_from_env', return_value=(None, None)):
            result = packaging.stage_extension(self.source, publish_to_packages=False)

        self.assertNotIn('signature', result['release_entry'])
        with self.assertRaisesRegex(ValueError, 'is unsigned'):
            check_release_signature(result['release_entry'], result['manifest'], {}, 'demo')

    def test_custom_domains_credentials_are_pinned_to_cloudflare(self):
        source = packaging.REPO_ROOT / 'extensions/custom_domains'
        descriptor = packaging.load_json(source / 'extension.json')
        defaults = descriptor['extension']['defaults']['settings']
        fields = descriptor['capabilities']['settings']['fields']

        self.assertNotIn('cloudflare_base_url', defaults)
        self.assertNotIn('cloudflare_base_url', {field['key'] for field in fields})

        settings = (source / 'files/app/Extensions/Packages/custom_domains/Services/PackageSettings.php').read_text()
        service = (source / 'files/app/Extensions/Packages/custom_domains/Services/CloudflareDnsService.php').read_text()
        self.assertNotIn('cloudflare_base_url', settings)
        self.assertIn("private const API_BASE_URL = 'https://api.cloudflare.com/client/v4';", service)
        self.assertIn("->withOptions(['allow_redirects' => false])", service)
        self.assertIn("preg_match('/^[a-f0-9]{32}$/i', $value)", service)
        self.assertNotIn('PackageSettings::baseUrl()', service)

        request = (source / 'files/app/Extensions/Packages/custom_domains/Http/Requests/Admin/StoreCustomDomainRequest.php').read_text()
        self.assertIn("'regex:/^[a-f0-9]{32}$/i'", request)

    def test_a_manifest_edited_after_signing_no_longer_verifies(self):
        result, public_key = self.signed()
        edited = json.loads(json.dumps(result['manifest']))
        edited['capabilities']['schedule'] = True

        self.assertFalse(signing.verify(
            public_key,
            signing.artifact_message('demo', '1.0.0', signing.canonicalize(edited)),
            result['release_entry']['signature']['value'],
        ))

    def test_a_key_record_not_signed_by_the_root_is_rejected(self):
        """The registry cannot authorize its own keys; only the offline root can."""
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        stranger = Ed25519PrivateKey.generate()
        record = {
            'keyId': 'forged',
            'publicKey': signing.public_key_b64(stranger),
            'validFrom': '',
            'validUntil': '',
            'revoked': False,
        }
        record['rootSignature'] = signing.sign(stranger, signing.key_record_message(record))

        with self.assertRaisesRegex(ValueError, 'not signed by the pinned root'):
            check_keys({'keys': [record]})

    def test_an_edited_key_record_is_rejected(self):
        """Extending a key's validity after signing must invalidate the record."""
        record = {
            'keyId': 'm12labs-release-2026a',
            'publicKey': 'AAAA',
            'validFrom': '',
            'validUntil': '2026-01-01T00:00:00Z',
            'revoked': False,
            'rootSignature': 'A' * 88,
        }

        with self.assertRaisesRegex(ValueError, 'not signed by the pinned root'):
            check_keys({'keys': [record]})

    def test_the_pinned_root_fingerprint_matches_the_pinned_key(self):
        self.assertEqual(signing.ROOT_FINGERPRINT, signing.fingerprint(signing.ROOT_PUBLIC_KEY))

    def test_canonicalization_strips_only_the_signature(self):
        """An integrity block reduced to nothing must vanish, or signing and
        verification would see different bytes."""
        self.assertEqual(
            signing.canonicalize({'a': 1}),
            signing.canonicalize({'a': 1, 'integrity': {'signature': 'x'}}),
        )
        self.assertNotEqual(
            signing.canonicalize({'a': 1}),
            signing.canonicalize({'a': 1, 'integrity': {'keyId': 'k'}}),
        )


if __name__ == '__main__':
    unittest.main()
