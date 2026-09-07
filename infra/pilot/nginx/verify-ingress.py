#!/usr/bin/env python3
"""Probe the real Pilot ingress; plaintext mode is restricted to loopback.

Credentials come from an external 0600 JSON file with username/password fields.
Default TLS verification uses the system CA store and requires the approved IP
in the certificate SAN. No custom CA, insecure TLS or redirect option exists.
Only controlled result codes and counts are emitted; bodies and URLs stay in RAM.
"""

from __future__ import annotations

import argparse
import base64
import collections
import concurrent.futures
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import ssl
import stat
import sys
import threading
import time
import urllib.parse


MAX_BODY = 16 * 1024 * 1024
MAX_ASSETS = 128
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class ProbeError(Exception):
    """Only fixed error codes, never provider messages or request values."""


def require(condition: bool, code: str) -> None:
    if not condition:
        raise ProbeError(code)


class Arguments(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ProbeError("ARGUMENTS_INVALID")


class IpTlsConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, connect_ip: str, port: int) -> None:
        context = ssl.create_default_context()
        require(context.check_hostname, "TLS_HOSTNAME_CHECK_REQUIRED")
        require(context.verify_mode == ssl.CERT_REQUIRED, "TLS_CA_CHECK_REQUIRED")
        super().__init__(host, port, timeout=10, context=context)
        self.connect_ip = connect_ip

    def connect(self) -> None:
        raw = socket.create_connection((self.connect_ip, self.port), timeout=10)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
            certificate = self.sock.getpeercert()
            require(
                ("IP Address", self.host) in certificate.get("subjectAltName", ()),
                "TLS_IP_SAN_REQUIRED",
            )
        except BaseException:
            raw.close()
            if self.sock is not None:
                self.sock.close()
            raise


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.references: set[tuple[str, str]] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        reference = None
        kind = tag
        if tag in ("script", "img"):
            reference = values.get("src")
        elif tag == "image":
            reference = values.get("href") or values.get("xlink:href")
        elif tag == "link":
            rel = (values.get("rel") or "").split()
            if set(rel) & {"stylesheet", "preload", "modulepreload", "icon"}:
                reference = values.get("href")
                kind = "image" if values.get("as") == "image" else "link"
        if reference:
            self.references.add((reference, "image" if kind == "img" else kind))


def load_auth(file: Path) -> tuple[str, str]:
    attributes = file.lstat()
    resolved = file.resolve(strict=True)
    require(
        stat.S_ISREG(attributes.st_mode)
        and stat.S_IMODE(attributes.st_mode) == 0o600
        and attributes.st_uid in (0, os.getuid())
        and not resolved.is_relative_to(REPOSITORY_ROOT),
        "AUTH_FILE_MUST_BE_EXTERNAL_PRIVATE_REGULAR_FILE",
    )
    with file.open("rb") as handle:
        opened = os.fstat(handle.fileno())
        require(
            (opened.st_dev, opened.st_ino, opened.st_mode, opened.st_uid, opened.st_size)
            == (attributes.st_dev, attributes.st_ino, attributes.st_mode,
                attributes.st_uid, attributes.st_size),
            "AUTH_FILE_CHANGED",
        )
        content = handle.read(16385)
    require(len(content) <= 16384, "AUTH_FILE_TOO_LARGE")
    value = json.loads(content)
    require(
        isinstance(value, dict) and set(value) == {"username", "password"},
        "AUTH_FILE_FIELDS_INVALID",
    )
    username, password = value["username"], value["password"]
    require(
        all(isinstance(item, str) and 0 < len(item) <= 4096 for item in (username, password)),
        "AUTH_VALUE_INVALID",
    )
    require(
        ":" not in username
        and all(not any(ord(character) < 32 or ord(character) == 127 for character in item)
                for item in (username, password)),
        "AUTH_VALUE_INVALID",
    )
    return username, password


def auth_header(username: str, password: str) -> str:
    value = base64.b64encode((username + ":" + password).encode()).decode("ascii")
    return "Basic " + value


def private_headers(headers: dict[str, str]) -> None:
    cache = {item.strip().lower() for item in headers.get("cache-control", "").split(",")}
    require({"private", "no-store"} <= cache and "public" not in cache, "CACHE_POLICY_INVALID")
    require(headers.get("referrer-policy") == "no-referrer", "REFERRER_POLICY_INVALID")
    robots = {item.strip().lower() for item in headers.get("x-robots-tag", "").split(",")}
    require({"noindex", "nofollow", "noarchive"} <= robots, "ROBOTS_POLICY_INVALID")


DENIED_PATHS = (
    "/docs/prototypes/mobile-preview",
    "/docs/prototypes/mobile-preview/",
    "/docs/prototypes/mobile-preview/index.html",
    "/docs/prototypes/mobile-preview/index.html/",
    "/docs/prototypes/mobile-preview/README.md",
    "/docs/prototypes/mobile-preview/fixtures",
    "/docs/prototypes/mobile-preview/fixtures/",
    "/docs/prototypes/mobile-preview/fixtures/home-feed.placeholder.js",
    "/docs/prototypes/mobile-preview/fixtures/topics.placeholder.js",
    "/docs/prototypes/mobile-preview/fixtures/catalog-detail.placeholder.js",
    "/docs/prototypes/mobile-preview/fixtures/p5-pilot.snapshot.js",
    "/docs/design-system/assets/demo/cliff-gate.svg",
    "/docs/design-system/assets/demo/qa-visual-square.svg",
    "/docs/design-system/assets/demo/qa-visual-ultrawide.svg",
    "/dev/t02p",
    "/dev/t02p/",
    "/dev/t02p/qa",
    "/dev/t02p/qa?_rsc=ingress-check",
    "/qa",
    "/fixtures",
    "/_next/data/not-a-build/dev/t02p.json",
    "/_next/image?url=%2Fdocs%2Fdesign-system%2Fassets%2Fdemo%2Fcliff-gate.svg&w=640&q=75",
    "/packages/ui/src/assets/icons/README.md",
    "/_pilot/status/",
    "/_pilot/status.json",
    "/.git/config",
    "/.env",
    "/v1/catalog",
    "/health",
    "/%64ocs/prototypes/mobile-preview/%69ndex.html",
    "//docs//prototypes//mobile-preview//index.html",
    "/x/../docs/prototypes/mobile-preview/index.html",
    "/docs/prototypes/mobile-preview/./index.html",
    "/docs/prototypes/mobile-preview/fixtures/../index.html",
    "/docs/prototypes/mobile-preview/fixtures%2fhome-feed.placeholder.js",
    "/%2564ocs/prototypes/mobile-preview/",
    "/docs%252fprototypes%252fmobile-preview%252findex.html",
    "/docs%5cprototypes%5cmobile-preview%5cindex.html",
    "/docs%255cprototypes%255cmobile-preview%255cindex.html",
    "/DOCS/PROTOTYPES/MOBILE-PREVIEW/INDEX.HTML",
    "/docs/prototypes/mobile-preview/index.html?x=1",
    "/_next/static/../../docs/prototypes/mobile-preview/index.html",
    "/_next/static/%252e%252e/%252e%252e/docs/prototypes/mobile-preview/index.html",
)


def main() -> None:
    parser = Arguments(description=__doc__)
    parser.add_argument("--ipv4", required=True)
    parser.add_argument("--auth-file", required=True, type=Path)
    parser.add_argument("--connect-ip", help="Approved IP or loopback; TLS still verifies --ipv4.")
    parser.add_argument("--port", type=int)
    parser.add_argument("--http-port", type=int, help="Challenge-only port; defaults to 80 in TLS mode.")
    parser.add_argument("--preflight-http", action="store_true",
                        help="Loopback-only HTTP preflight; never counts as TLS or external proof.")
    args = parser.parse_args()
    address = str(ipaddress.IPv4Address(args.ipv4))
    connect_ip = str(ipaddress.IPv4Address(args.connect_ip or address))
    port = args.port or (80 if args.preflight_http else 443)
    http_port = args.http_port if args.http_port is not None else (None if args.preflight_http else 80)
    require(1 <= port <= 65535 and (http_port is None or 1 <= http_port <= 65535), "PORT_INVALID")
    require(connect_ip == address or ipaddress.ip_address(connect_ip).is_loopback, "CONNECT_IP_INVALID")
    if args.preflight_http:
        require(ipaddress.ip_address(connect_ip).is_loopback, "PLAINTEXT_REQUIRES_LOOPBACK")
    else:
        require(not any(os.environ.get(key) for key in ("SSL_CERT_FILE", "SSL_CERT_DIR")),
                "CUSTOM_CA_ENVIRONMENT_NOT_ALLOWED")
    username, password = load_auth(args.auth_file)
    authorization = auth_header(username, password)
    wrong_password = secrets.token_urlsafe(32)
    while wrong_password == password:
        wrong_password = secrets.token_urlsafe(32)
    wrong_authorization = auth_header(username, wrong_password)
    started = time.monotonic()
    count = 0
    count_lock = threading.Lock()
    phase = "authentication"
    assets_verified = 0
    asset_kinds: set[str] = set()

    def request(path: str, method: str = "GET", credential: str | None = None,
                host: str | None = None, plaintext_port: int | None = None,
                rsc: bool = False) -> tuple[int, dict[str, str], bytes]:
        nonlocal count
        require(time.monotonic() - started < 300, "PROBE_DEADLINE")
        require(path.startswith("/") and path.isascii()
                and not any(ord(character) <= 32 or ord(character) == 127 for character in path),
                "REQUEST_PATH_INVALID")
        if plaintext_port is not None:
            require(credential is None, "NO_CREDENTIALS_ON_HTTP_CHALLENGE_PORT")
            connection = http.client.HTTPConnection(connect_ip, plaintext_port, timeout=10)
        elif args.preflight_http:
            connection = http.client.HTTPConnection(connect_ip, port, timeout=10)
        else:
            connection = IpTlsConnection(address, connect_ip, port)
        try:
            # Send the exact raw path: HTTPConnection.putrequest normalizes //.
            # TLS connection verification still completes before any credential.
            connection.connect()
            lines = [method + " " + path + " HTTP/1.1", "Host: " + (host or address),
                     "Accept-Encoding: identity", "Connection: close"]
            if credential is not None:
                lines.append("Authorization: " + credential)
            if rsc:
                lines.append("RSC: 1")
            connection.sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("ascii"))
            response = http.client.HTTPResponse(connection.sock, method=method)
            response.begin()
            headers: dict[str, str] = {}
            for name, value in response.getheaders():
                name = name.lower()
                headers[name] = headers[name] + "," + value if name in headers else value
            try:
                body = response.read(MAX_BODY + 1)
            finally:
                response.close()
            require(len(body) <= MAX_BODY, "RESPONSE_TOO_LARGE")
            with count_lock:
                count += 1
            return response.status, headers, body
        finally:
            connection.close()

    def authenticated(path: str, method: str = "GET",
                      check_wrong_password: bool = True) -> tuple[dict[str, str], bytes]:
        for credential in ((None, wrong_authorization) if check_wrong_password else (None,)):
            status, headers, _ = request(path, method, credential)
            require(status == 401, "AUTHENTICATION_BYPASS")
            require(headers.get("www-authenticate", "").startswith("Basic "), "BASIC_CHALLENGE_MISSING")
            private_headers(headers)
        status, headers, body = request(path, method, authorization)
        require(status == 200, "AUTHENTICATED_RESOURCE_UNAVAILABLE")
        private_headers(headers)
        return headers, body

    try:
        landing_headers, landing = authenticated("/")
        require("text/html" in landing_headers.get("content-type", ""), "LANDING_TYPE_INVALID")
        authenticated("/", "HEAD")
        status_headers, _ = authenticated("/_pilot/status")
        require("text/html" in status_headers.get("content-type", ""), "STATUS_TYPE_INVALID")
        authenticated("/_pilot/status", "HEAD")
        api_headers, page_bytes = authenticated("/api/catalog")
        require("application/json" in api_headers.get("content-type", ""), "API_TYPE_INVALID")
        page = json.loads(page_bytes)
        require(page.get("total") == 3 and len(page.get("items", [])) == 3, "PILOT_CATALOG_COUNT_INVALID")
        authenticated("/api/catalog", "HEAD")
        ids = [row.get("id") for row in page["items"]]
        require(len(set(ids)) == 3 and all(isinstance(value, str) for value in ids), "CATALOG_IDENTITIES_INVALID")
        for catalog_id in ids:
            path = "/api/catalog/" + urllib.parse.quote(catalog_id, safe="")
            headers, detail_bytes = authenticated(path)
            require("application/json" in headers.get("content-type", ""), "DETAIL_TYPE_INVALID")
            require(json.loads(detail_bytes).get("id") == catalog_id, "DETAIL_IDENTITY_MISMATCH")

        phase = "denied_paths"
        def denied(path: str) -> None:
            for method in ("GET", "HEAD"):
                for credential in (None, authorization):
                    status, _, _ = request(path, method, credential, rsc="_rsc=" in path)
                    require(status in (400, 404, 405), "DENIED_PATH_REACHABLE_OR_REDIRECTED")
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
        try:
            jobs = [executor.submit(denied, path) for path in DENIED_PATHS]
            for job in concurrent.futures.as_completed(jobs):
                job.result()
        finally:
            executor.shutdown(wait=True, cancel_futures=True)

        phase = "methods_and_host"
        for method in ("POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
            for path in ("/", "/api/catalog", "/_pilot/status"):
                status, headers, _ = request(path, method, authorization)
                require(status == 405, "WRITE_METHOD_ACCEPTED")
                require(headers.get("allow") == "GET, HEAD", "ALLOW_HEADER_INVALID")
                private_headers(headers)
        for host in ("unapproved.invalid", address + ":444"):
            status, _, _ = request("/", credential=authorization, host=host)
            require(status == 421, "UNAPPROVED_HOST_ACCEPTED")
        status, _, _ = request("/", credential=authorization, host=address + ":443")
        require(status == 200, "EXPLICIT_HTTPS_HOST_PORT_REJECTED")

        phase = "real_page_assets"
        parser_html = AssetParser()
        parser_html.feed(landing.decode("utf8"))
        pending: collections.deque[tuple[str, str, str]] = collections.deque(
            ("/", reference, kind) for reference, kind in sorted(parser_html.references)
        )
        seen: set[str] = set()
        while pending:
            parent_path, reference, kind = pending.popleft()
            reference = reference.strip()
            if not reference or reference.startswith(("#", "data:", "blob:")):
                continue
            resolved = urllib.parse.urlsplit(urllib.parse.urljoin("https://" + address + parent_path, reference))
            require(resolved.scheme == "https", "MIXED_CONTENT_ASSET")
            require(not resolved.username and not resolved.password, "ASSET_URL_CREDENTIALS")
            if resolved.hostname != address:
                # Only signed image links may be external. Their approved COS
                # origin and bytes are tested by the separate frozen-media proof.
                parameters = urllib.parse.parse_qs(resolved.query)
                require(kind == "image" and {"q-ak", "q-signature", "q-sign-time"} <= parameters.keys(),
                        "UNEXPECTED_EXTERNAL_ASSET")
                continue
            require(resolved.port in (None, 443), "ASSET_PORT_INVALID")
            asset_path = resolved.path + ("?" + resolved.query if resolved.query else "")
            if asset_path in seen:
                continue
            seen.add(asset_path)
            require(len(seen) <= MAX_ASSETS, "ASSET_COUNT_EXCEEDS_BOUND")
            headers, body = authenticated(asset_path, check_wrong_password=False)
            assets_verified += 1
            content_type = headers.get("content-type", "").split(";", 1)[0].lower()
            if content_type == "text/css":
                asset_kinds.add("css")
                css = body.decode("utf8")
                references = re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", css)
                references += re.findall(r"@import\s+['\"]([^'\"]+)['\"]", css)
                pending.extend((asset_path, value, "css-resource") for value in references)
            elif content_type in ("application/javascript", "text/javascript"):
                asset_kinds.add("javascript")
            elif content_type.startswith("image/"):
                asset_kinds.add("image")
        require({"css", "javascript", "image"} <= asset_kinds, "FORMAL_ASSET_PROOF_INCOMPLETE")

        phase = "http_challenge_boundary"
        if http_port is not None:
            for path in ("/", "/api/catalog", "/_pilot/status", "/.well-known/acme-challenge",
                         "/.well-known/acme-challenge/", "/.well-known/acme-challenge/../index.html",
                         "/.well-known/acme-challenge/not-created-ingress-probe"):
                status, headers, _ = request(path, plaintext_port=http_port)
                require(status in (400, 404), "HTTP_APPLICATION_OR_UNKNOWN_CHALLENGE_EXPOSED")
                require("www-authenticate" not in headers, "BASIC_CHALLENGE_ON_PLAINTEXT")
            status, _, _ = request("/", method="POST", plaintext_port=http_port)
            require(status == 405, "HTTP_WRITE_METHOD_ACCEPTED")
        print(json.dumps({
            "status": "PASS",
            "mode": "LOOPBACK_HTTP_PREFLIGHT" if args.preflight_http else "SYSTEM_CA_IP_SAN_HTTPS",
            "external_network_proof": not ipaddress.ip_address(connect_ip).is_loopback,
            "tls_verified": not args.preflight_http,
            "http_challenge_boundary_checked": http_port is not None,
            "catalogs_verified": len(ids),
            "assets_verified": assets_verified,
            "asset_kinds": sorted(asset_kinds),
            "denied_path_cases": len(DENIED_PATHS),
            "requests": count,
            "duration_seconds": round(time.monotonic() - started, 3),
        }, separators=(",", ":")))
    except BaseException as error:
        if isinstance(error, ProbeError):
            code = str(error)
        elif isinstance(error, ssl.SSLCertVerificationError):
            code = "TLS_CERTIFICATE_VERIFICATION_FAILED"
        elif isinstance(error, (OSError, http.client.HTTPException)):
            code = "NETWORK_OR_HTTP_FAILURE"
        else:
            code = "RESPONSE_OR_CONFIGURATION_INVALID"
        print(json.dumps({"status": "FAIL", "phase": phase, "code": code,
                          "requests": count, "assets_verified": assets_verified},
                         separators=(",", ":")))
        raise SystemExit(1) from None


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException as error:
        code = str(error) if isinstance(error, ProbeError) else "INPUT_OR_CONFIGURATION_INVALID"
        print(json.dumps({"status": "FAIL", "phase": "input", "code": code},
                         separators=(",", ":")))
        raise SystemExit(1) from None
