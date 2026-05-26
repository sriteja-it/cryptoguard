#!/usr/bin/env python
import sys
import ssl
import socket
import json

try:
    from cryptography import x509
    from cryptography.hazmat.primitives.asymmetric import rsa, dsa, ec, ed25519, ed448
except Exception:
    x509 = None

if len(sys.argv) < 2:
    print(json.dumps({"error": "missing_host"}))
    sys.exit(1)

host = sys.argv[1]
port = 443

ctx = ssl.create_default_context()


def name_to_dict(name):
    values = {}
    for attribute in name:
        key = attribute.oid._name or attribute.oid.dotted_string
        values[key] = attribute.value
    return values


def public_key_details(public_key):
    if isinstance(public_key, rsa.RSAPublicKey):
        return 'RSA', public_key.key_size
    if isinstance(public_key, dsa.DSAPublicKey):
        return 'DSA', public_key.key_size
    if isinstance(public_key, ec.EllipticCurvePublicKey):
        return 'ECC', public_key.key_size
    if isinstance(public_key, ed25519.Ed25519PublicKey):
        return 'ED25519', 256
    if isinstance(public_key, ed448.Ed448PublicKey):
        return 'ED448', 456
    return type(public_key).__name__.replace('PublicKey', '').upper(), getattr(public_key, 'key_size', None)


def parse_certificate(der_bytes):
    if x509 is None:
        return None

    cert = x509.load_der_x509_certificate(der_bytes)
    public_key = cert.public_key()
    public_key_type, key_size = public_key_details(public_key)

    signature_algorithm = None
    if cert.signature_hash_algorithm is not None:
        signature_algorithm = cert.signature_hash_algorithm.name

    return {
        'subject': name_to_dict(cert.subject),
        'issuer': name_to_dict(cert.issuer),
        'notBefore': cert.not_valid_before_utc.isoformat() if hasattr(cert, 'not_valid_before_utc') else cert.not_valid_before.isoformat(),
        'notAfter': cert.not_valid_after_utc.isoformat() if hasattr(cert, 'not_valid_after_utc') else cert.not_valid_after.isoformat(),
        'serialNumber': format(cert.serial_number, 'x'),
        'signatureAlgorithm': signature_algorithm,
        'publicKeyType': public_key_type,
        'publicKeySize': key_size,
    }


try:
    with socket.create_connection((host, port), timeout=5) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as ssock:
            tls_version = ssock.version()
            cert_bin = ssock.getpeercert(binary_form=True)

            parsed = parse_certificate(cert_bin)
            if parsed is None:
                cert = ssock.getpeercert(binary_form=False)
                parsed = {
                    'subject': dict(x[0] for x in cert.get('subject', [])),
                    'issuer': dict(x[0] for x in cert.get('issuer', [])),
                    'notBefore': cert.get('notBefore'),
                    'notAfter': cert.get('notAfter'),
                    'serialNumber': None,
                    'signatureAlgorithm': None,
                    'publicKeyType': 'UNKNOWN',
                    'publicKeySize': None,
                }

            parsed['tlsVersion'] = tls_version
            print(json.dumps(parsed))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(2)
