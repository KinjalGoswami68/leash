"""Build agent/certs/ca-bundle.pem = certifi's CAs + this Windows machine's trusted root CAs.

Why: antivirus HTTPS scanning (Avast here) re-signs TLS traffic with its own root CA. Windows and Node
trust that CA, but Python's requests/httpx only trust certifi, so every call to Groq and the RPC fails
with CERTIFICATE_VERIFY_FAILED. config.py points requests/httpx at this bundle when it exists.
Stdlib + certifi only (already installed with requests), no new dependency. Public certificates only:
nothing secret is written. Run: python make_ca_bundle.py (from the agent folder, venv active).
"""
import ssl
import sys
from pathlib import Path

import certifi

OUT = Path(__file__).with_name("certs") / "ca-bundle.pem"


def main() -> None:
    if not hasattr(ssl, "enum_certificates"):
        sys.exit("Windows only: on other systems certifi alone is enough.")
    pems = [Path(certifi.where()).read_text(encoding="ascii")]
    count = 0
    for store in ("ROOT", "CA"):
        for cert, encoding, _trust in ssl.enum_certificates(store):
            if encoding == "x509_asn":
                pems.append(ssl.DER_cert_to_PEM_cert(cert))
                count += 1
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(pems), encoding="ascii")
    print(f"Wrote {OUT} (certifi + {count} Windows certificates).")


if __name__ == "__main__":
    main()
