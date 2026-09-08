# Package signing

Every manifest v3 release is signed, and a panel decides whether to trust it
from a single value its operator pinned out of band.

## The chain

```
offline root key  --signs-->  release key record  --signs-->  package manifest
   (kept offline)               (registry.json)                (in the archive)
```

Three parties, three responsibilities:

| Who | Holds | Does |
| --- | --- | --- |
| Repository operator | the **root private key**, offline | authorizes and revokes release keys |
| CI | a **release private key**, as a secret | signs each release |
| Panel operator | nothing secret | pins the root's public key and fingerprint |

The root never signs a package. It signs a short record naming a release key,
and that record travels in `registry.json`. A panel admits the release key only
when the root's signature over that record verifies — so the registry can be
served from anywhere, over any mirror, without becoming a trust decision.

Release keys are meant to be replaced. Rotating one, or revoking a compromised
one, is a change to `registry.json` and nothing else: no panel is reconfigured,
and no already-installed package is disturbed unless its key is revoked.

## Provisioning the root

Once, on a machine you control, and never again on a build machine:

```bash
php -r '$k = sodium_crypto_sign_keypair();
  echo "private: ", base64_encode(sodium_crypto_sign_secretkey($k)), "\n";
  echo "public:  ", base64_encode(sodium_crypto_sign_publickey($k)), "\n";
  echo "fingerprint: ", hash("sha256", sodium_crypto_sign_publickey($k)), "\n";'
```

Move the private half to offline storage. Pin the public half in
`tools/signing.py` (`ROOT_PUBLIC_KEY` / `ROOT_FINGERPRINT`), which is what the
release gate checks registry keys against, and give panel operators the same two
values to pin in their own configuration.

## Authorizing a release key

Run on the machine holding the root key. It writes the signed record into
`registry.json` and prints what a panel operator needs:

```bash
python3 tools/m12labs_extension_tool.py authorize-key m12labs-release-2027a \
  --root-key /path/to/root.private.b64 \
  --public-key '<base64 public key of the new release key>' \
  --label 'M12Labs CI release key (2027)' \
  --valid-from 2027-01-01T00:00:00Z \
  --valid-until 2028-01-01T00:00:00Z
```

Pass `--public-key` rather than `--release-key` wherever possible: authorizing a
key needs only its public half, so the release private key never has to be on
the same machine as the root.

Revoking is the same command with `--revoke`, which re-signs the record with its
status flipped. Revocation is one-way on the panel side: a registry that later
stops advertising it cannot un-revoke a key.

## What a signature covers

The signed message is domain-separated and bound to one package and version:

```
m12labs-ext-v3
<extension id>
<version>
<sha256 of the canonical manifest>
```

The canonical manifest is JCS-style: recursive key sort, no insignificant
whitespace, slashes and unicode unescaped, with `integrity.signature` stripped
because a signature cannot cover itself. Both the panel
(`ExtensionManifestCanonicalizer`) and this tooling (`tools/signing.py`)
implement it, and a round-trip test asserts they produce identical bytes.

**The archive's own hash is deliberately not covered.** The signature ships
inside the archive, so signing the archive hash would be circular — writing the
signature changes the hash it just committed to. Nothing is lost by leaving it
out: the manifest carries a sha256 for every file, and the panel installs only
files the manifest lists, verifying each one, so signing the manifest already
commits to everything that reaches the panel. Archive-level integrity for a
repository install comes from the registry's own checksum, checked before
extraction.

What you sign is the manifest **as shipped** — integrity block present, only
`integrity.signature` absent. Signing anything else produces a signature that
verifies nowhere.

## Panels with no root pinned

Enforcement follows what the panel can actually check. With no root pinned it
can attribute a package to nobody, so it admits packages as *unverified* rather
than refusing everything — but an unverified package may declare neither hooks,
nor queues, nor a permission marked dangerous. It cannot run code on core's
deletion path or dispatch background work on a panel that does not know who
wrote it.

Pinning a root is what turns enforcement on.
