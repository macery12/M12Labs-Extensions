#!/usr/bin/env python3
"""Ed25519 signing for M12Labs extension releases.

Mirrors the panel's ExtensionManifestCanonicalizer and ExtensionSignatureService
byte for byte. Any divergence here produces signatures that verify locally and
fail on every panel, so the canonicalizer has a round-trip test against the real
PHP implementation (tools/tests/test_signing.py).

Trust chain:

    offline root key  --signs-->  release key record  --signs-->  artifact

The root key never touches a build machine. It signs a key record once per
release key; the registry carries that record, and the panel admits the release
key only when the record verifies against the fingerprint it pins.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

# Domain separators. A signature over one kind of message must never be
# replayable as a signature over the other, so each message names its own kind.
ARTIFACT_DOMAIN = 'm12labs-ext-v3'
KEY_RECORD_DOMAIN = 'm12labs-ext-key-v1'

# The offline root's public half, pinned in version control so the release
# gate checks registry keys against a reviewed constant rather than against
# whatever the registry happens to claim. Panels pin the same value
# out of band (config/extensions.php signing.root_public_key).
ROOT_PUBLIC_KEY = 'ggFN5FMVZ0I3WAWstAAK9Gh7yTN4DMA/aKVAcyxamRw='
ROOT_FINGERPRINT = 'd00b21be261647e0518f232b782f273d2a9f4485523862040321a122c4f0c1c3'


def canonicalize(manifest: dict) -> str:
    """Deterministic manifest bytes, matching ExtensionManifestCanonicalizer.

    Recursive key sort, no insignificant whitespace, slashes and unicode left
    unescaped. `integrity.signature` is stripped because a signature cannot
    cover itself; an integrity block left empty by that removal is dropped
    entirely, so signing and verification see identical bytes whether or not
    the publisher shipped one.
    """
    doc = json.loads(json.dumps(manifest))  # deep copy

    integrity = doc.get('integrity')
    if isinstance(integrity, dict):
        integrity.pop('signature', None)
        if not integrity:
            doc.pop('integrity', None)

    return json.dumps(_sort(doc), separators=(',', ':'), ensure_ascii=False)


def _sort(value):
    if isinstance(value, dict):
        return {key: _sort(value[key]) for key in sorted(value)}
    # List order is meaningful (files, backoff steps, enum choices).
    if isinstance(value, list):
        return [_sort(item) for item in value]
    return value


def artifact_message(extension_id: str, version: str, canonical_manifest: str) -> str:
    """The bytes a release key signs, matching ExtensionManifestCanonicalizer.

    The archive's own sha256 is deliberately not covered. The signature ships
    inside the archive, so signing the archive hash would be circular — writing
    the signature changes the hash it just committed to. Nothing is lost: the
    canonical manifest carries a sha256 for every shipped file, and the panel
    installs only files the manifest lists, verifying each one. Archive-level
    integrity comes from the registry's own checksum, checked before extraction.
    """
    return '\n'.join([
        ARTIFACT_DOMAIN,
        extension_id,
        version,
        hashlib.sha256(canonical_manifest.encode('utf-8')).hexdigest(),
    ])


def key_record_message(key: dict) -> str:
    return '\n'.join([
        KEY_RECORD_DOMAIN,
        str(key.get('keyId', '')),
        str(key.get('publicKey', '')),
        str(key.get('validFrom', '')),
        str(key.get('validUntil', '')),
        'revoked' if key.get('revoked', False) else 'active',
    ])


def load_private_key(source: str | Path) -> Ed25519PrivateKey:
    """Read a base64 libsodium secret key from a file path or a literal value.

    libsodium's secret key is `seed || public key` (64 bytes); Ed25519 keys are
    the 32-byte seed, so the tail is dropped. A bare 32-byte seed is accepted
    too, which is what a non-PHP generator would produce.
    """
    text = str(source)
    candidate = Path(text)
    if candidate.is_file():
        text = candidate.read_text(encoding='utf-8')

    raw = base64.b64decode(text.strip(), validate=True)

    if len(raw) not in (32, 64):
        raise SystemExit(
            f'Signing key must decode to 32 or 64 bytes, got {len(raw)}. '
            'Expected a base64 Ed25519 seed or a libsodium secret key.'
        )

    return Ed25519PrivateKey.from_private_bytes(raw[:32])


def public_key_b64(private_key: Ed25519PrivateKey) -> str:
    from cryptography.hazmat.primitives import serialization

    return base64.b64encode(
        private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
    ).decode('ascii')


def sign(private_key: Ed25519PrivateKey, message: str) -> str:
    return base64.b64encode(private_key.sign(message.encode('utf-8'))).decode('ascii')


def verify(public_key_base64: str, message: str, signature_base64: str) -> bool:
    try:
        key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_base64, validate=True))
        key.verify(base64.b64decode(signature_base64, validate=True), message.encode('utf-8'))
        return True
    except Exception:
        return False


def fingerprint(public_key_base64: str) -> str:
    return hashlib.sha256(base64.b64decode(public_key_base64, validate=True)).hexdigest()


def release_key_from_env() -> tuple[Ed25519PrivateKey, str] | tuple[None, None]:
    """The CI release key, or (None, None) when the environment has none.

    Staging a release without a key is allowed — it produces an unsigned
    archive, which the panel admits only with an explicit acknowledgement and
    with hooks, queues and dangerous permissions blocked. Publishing to the
    registry requires a signature (see check_extensions.py).
    """
    key_id = os.environ.get('M12LABS_RELEASE_KEY_ID', '').strip()
    material = os.environ.get('M12LABS_RELEASE_KEY', '').strip()

    if not key_id or not material:
        return None, None

    return load_private_key(material), key_id
