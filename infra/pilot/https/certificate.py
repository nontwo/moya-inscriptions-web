#!/usr/bin/env python3
"""Bounded Pilot TLS operations. Reports never contain subprocess output."""

import contextlib
import datetime as dt
import fcntl
import hashlib
import html
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import ssl
import stat
import subprocess
import sys
import tempfile
import time


CONFIG_PATH = Path("/etc/moya-pilot/https.json")
CERTBOT = "/opt/moya-certbot-5.8.0/bin/certbot"
SYSTEMCTL = "/usr/bin/systemctl"
NGINX = "/usr/sbin/nginx"
OPENSSL = "/usr/bin/openssl"
RENEW_TIMER = "moya-pilot-certificate.timer"
CHECK_TIMER = "moya-pilot-certificate-check.timer"
UTC = dt.timezone.utc
WARNING_SECONDS = 48 * 3600
MAX_ATTEMPT_AGE = 8 * 3600
SYSTEM_CA_FILE = "/etc/ssl/certs/ca-certificates.crt"
SYSTEM_CA_PATH = "/etc/ssl/certs"
COMMANDS = ("renew", "check", "reload", "dry-run", "status-failure", "stop", "start-guard")


class Failure(Exception):
    """A fixed, public-safe reason code; never wrap raw exception text."""


def utcnow():
    return dt.datetime.now(UTC)


def timestamp(value):
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_utc(value):
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value
    ):
        raise Failure("INVALID_UTC_DATE")
    try:
        return dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    except ValueError:
        raise Failure("INVALID_UTC_DATE") from None


def absolute_path(value):
    if not isinstance(value, str) or not value.startswith("/"):
        raise Failure("INVALID_CONFIG_PATH")
    path = Path(value)
    if ".." in path.parts or str(path) != value or path == Path("/"):
        raise Failure("INVALID_CONFIG_PATH")
    return path


class Config:
    def __init__(self, values):
        if not isinstance(values, dict) or set(values) != {
            "ipv4", "deadlineUTC", "cert_name", "webroot", "lineage", "status_root"
        }:
            raise Failure("INVALID_CONFIG_FIELDS")
        try:
            self.ipv4 = str(ipaddress.IPv4Address(values["ipv4"]))
        except (ValueError, TypeError, ipaddress.AddressValueError):
            raise Failure("INVALID_IPV4") from None
        self.deadline = parse_utc(values["deadlineUTC"])
        name = values["cert_name"]
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}", name):
            raise Failure("INVALID_CERT_NAME")
        self.cert_name = name
        self.webroot = absolute_path(values["webroot"])
        self.lineage = absolute_path(values["lineage"])
        self.status_root = absolute_path(values["status_root"])
        if self.lineage != Path("/etc/letsencrypt/live") / name:
            raise Failure("INVALID_LINEAGE")
        if not self.status_root.is_relative_to("/var/lib/"):
            raise Failure("INVALID_STATUS_ROOT")
        if self.status_root == self.webroot or self.status_root.is_relative_to(self.webroot):
            raise Failure("STATUS_INSIDE_CHALLENGE_ROOT")


def read_json(path, private=False):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "r", encoding="utf-8") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 65536:
            raise Failure("INVALID_STATE_FILE")
        if private and (info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600):
            raise Failure("UNSAFE_PRIVATE_FILE")
        return json.load(stream)


def load_config():
    try:
        return Config(read_json(CONFIG_PATH, private=True))
    except Failure:
        raise
    except Exception:
        raise Failure("CONFIG_UNAVAILABLE") from None


def run(arguments, reason, timeout=30):
    try:
        result = subprocess.run(
            arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=timeout, check=False,
            env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"},
        )
    except subprocess.TimeoutExpired:
        raise Failure(reason + "_TIMEOUT") from None
    except Exception:
        raise Failure(reason + "_UNAVAILABLE") from None
    if result.returncode:
        raise Failure(reason + "_FAILED")
    return result.stdout


def safe_directory(path):
    # Existing parents and the target must not redirect writes through symlinks.
    for parent in (*reversed(path.parents), path):
        if parent.is_symlink():
            raise Failure("UNSAFE_STATUS_DIRECTORY")
    path.mkdir(parents=True, exist_ok=True, mode=0o755)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid():
        raise Failure("UNSAFE_STATUS_DIRECTORY")
    os.chmod(path, 0o755)


def atomic_write(path, content, mode):
    fd, temporary = tempfile.mkstemp(prefix=".tls-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


PUBLIC_FIELDS = (
    "schemaVersion", "updatedAt", "deadlineUTC", "entryState", "health", "warnings",
    "lastAction", "lastCheckAt", "lastRenewAttemptAt", "lastRenewSuccessAt",
    "lastIssuanceDetectedAt", "lastDryRunSuccessAt", "lastReloadSuccessAt",
    "lastFailureAt", "failureCount", "failures", "expiresAt", "remainingSeconds",
    "servedMatchesDisk", "ipSanMatches", "chainTrusted", "certificateSha256",
    "renewTimerEnabled", "renewTimerActive", "renewAttemptFresh", "stoppedAt",
)


class Store:
    def __init__(self, config):
        self.config = config
        self.root = config.status_root
        safe_directory(self.root)

    @contextlib.contextmanager
    def locked(self):
        fd = os.open(self.root / ".state.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "r+") as stream:
            os.fchmod(stream.fileno(), 0o600)
            fcntl.flock(stream, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def _read(self):
        try:
            state = read_json(self.root / "state.json")
        except FileNotFoundError:
            return {"schemaVersion": 1, "failureCount": 0, "failures": {}, "entryState": "UNKNOWN"}
        if not isinstance(state, dict) or not isinstance(state.get("failures"), dict):
            raise Failure("INVALID_STATE_FILE")
        return state

    def snapshot(self):
        with self.locked():
            return self._read()

    def update(self, change):
        with self.locked():
            state = self._read()
            change(state)
            state["updatedAt"] = timestamp(utcnow())
            state["deadlineUTC"] = timestamp(self.config.deadline)
            if "expiresAt" in state:
                state["remainingSeconds"] = int((parse_utc(state["expiresAt"]) - utcnow()).total_seconds())
            remaining = state.get("remainingSeconds")
            state["warnings"] = ["CERTIFICATE_UNDER_48_HOURS"] if (
                isinstance(remaining, (int, float)) and remaining < WARNING_SECONDS
                and state.get("entryState") != "STOPPED"
            ) else []
            state["health"] = "FAILED" if state["failures"] else (
                "STOPPED" if state.get("entryState") == "STOPPED" else (
                    "UNKNOWN" if state.get("entryState") == "UNKNOWN" else (
                        "WARNING" if state["warnings"] else "OK"
                    )
                )
            )
            atomic_write(self.root / "state.json", json.dumps(state, sort_keys=True) + "\n", 0o600)
            public = {key: state[key] for key in PUBLIC_FIELDS if key in state}
            payload = json.dumps(public, sort_keys=True, indent=2) + "\n"
            atomic_write(self.root / "status.json", payload, 0o644)
            page = (
                '<!doctype html><html lang="en"><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width,initial-scale=1">'
                '<meta name="robots" content="noindex,nofollow,noarchive">'
                '<title>Pilot TLS status</title><h1>Pilot TLS status</h1>'
                '<p>Passive status only; no external notification is sent.</p>'
                '<pre style="white-space:pre-wrap;overflow-wrap:anywhere">'
                + html.escape(payload) + "</pre></html>\n"
            )
            atomic_write(self.root / "index.html", page, 0o644)
            return public


def record_failure(store, action, reason):
    def change(state):
        state["lastAction"] = action
        state["lastFailureAt"] = timestamp(utcnow())
        state["failureCount"] = int(state.get("failureCount", 0)) + 1
        state["failures"][action] = reason
        # Old successful flags must not be mistaken for the failed current check.
        if action in ("check", "reload", "renew", "dry-run"):
            state["servedMatchesDisk"] = False
            state["ipSanMatches"] = False
            state["chainTrusted"] = False
    store.update(change)


def disk_certificate(config):
    path = config.lineage / "cert.pem"
    try:
        resolved = path.resolve(strict=True)
        allowed = Path("/etc/letsencrypt/archive") / config.cert_name
        if not resolved.is_relative_to(allowed):
            raise Failure("UNEXPECTED_CERTIFICATE_PATH")
        data = path.read_bytes()
        if len(data) > 65536:
            raise Failure("INVALID_DISK_CERTIFICATE")
        text = data.decode("ascii")
        der = ssl.PEM_cert_to_DER_cert(text)
    except Failure:
        raise
    except Exception:
        raise Failure("DISK_CERTIFICATE_UNAVAILABLE") from None
    details = run(
        [OPENSSL, "x509", "-in", str(path), "-noout", "-ext", "subjectAltName", "-enddate"],
        "DISK_CERTIFICATE_PARSE",
    ).decode("ascii", errors="strict")
    addresses = re.findall(r"IP Address:([^,\s]+)", details)
    if config.ipv4 not in addresses:
        raise Failure("DISK_IP_SAN_MISMATCH")
    chain = config.lineage / "chain.pem"
    try:
        if not chain.resolve(strict=True).is_relative_to(allowed):
            raise Failure("UNEXPECTED_CHAIN_PATH")
    except Failure:
        raise
    except Exception:
        raise Failure("DISK_CHAIN_UNAVAILABLE") from None
    # OpenSSL uses the system CA store. No supplied private CA or staging trust.
    run([OPENSSL, "verify", "-verify_ip", config.ipv4, "-untrusted", str(chain), str(path)],
        "DISK_CHAIN")
    return hashlib.sha256(der).hexdigest()


def verify_tls(config):
    expected = disk_certificate(config)
    try:
        context = ssl.create_default_context(cafile=SYSTEM_CA_FILE, capath=SYSTEM_CA_PATH)
        with socket.create_connection(("127.0.0.1", 443), timeout=10) as connection:
            with context.wrap_socket(connection, server_hostname=config.ipv4) as secure:
                certificate = secure.getpeercert()
                actual = hashlib.sha256(secure.getpeercert(binary_form=True)).hexdigest()
        if not any(kind == "IP Address" and value == config.ipv4
                   for kind, value in certificate.get("subjectAltName", ())):
            raise Failure("SERVED_IP_SAN_MISMATCH")
        if actual != expected:
            raise Failure("SERVED_CERTIFICATE_MISMATCH")
        expires = dt.datetime.fromtimestamp(ssl.cert_time_to_seconds(certificate["notAfter"]), UTC)
        remaining = int((expires - utcnow()).total_seconds())
        if remaining <= 0:
            raise Failure("CERTIFICATE_EXPIRED")
        return {
            "certificateSha256": actual, "expiresAt": timestamp(expires),
            "remainingSeconds": remaining, "servedMatchesDisk": True,
            "ipSanMatches": True, "chainTrusted": True,
        }
    except Failure:
        raise
    except Exception:
        raise Failure("TLS_VERIFICATION_FAILED") from None


def timer_health(store):
    store.update(lambda state: state.update(
        renewTimerEnabled=False, renewTimerActive=False, renewAttemptFresh=False
    ))
    run([SYSTEMCTL, "is-enabled", "--quiet", RENEW_TIMER], "RENEW_TIMER_ENABLED")
    store.update(lambda state: state.update(renewTimerEnabled=True))
    run([SYSTEMCTL, "is-active", "--quiet", RENEW_TIMER], "RENEW_TIMER_ACTIVE")
    store.update(lambda state: state.update(renewTimerActive=True))
    attempt = store.snapshot().get("lastRenewAttemptAt")
    if not attempt:
        raise Failure("RENEW_ATTEMPT_MISSING")
    age = (utcnow() - parse_utc(attempt)).total_seconds()
    if age < -60 or age > MAX_ATTEMPT_AGE:
        raise Failure("RENEW_ATTEMPT_STALE")
    return {"renewTimerEnabled": True, "renewTimerActive": True, "renewAttemptFresh": True}


def stop_entry(config, store):
    if utcnow() < config.deadline:
        return "NOT_DUE"
    # Stop timers first. Disabling nginx also prevents reboot from reopening entry.
    failed = False
    for args in (
        [SYSTEMCTL, "disable", "--now", RENEW_TIMER, CHECK_TIMER],
        [SYSTEMCTL, "disable", "--now", "nginx.service"],
    ):
        try:
            run(args, "ENTRY_STOP", timeout=60)
        except Failure:
            failed = True
    if failed:
        raise Failure("ENTRY_STOP_FAILED")
    active = run([SYSTEMCTL, "show", "--property=ActiveState", "--value", "nginx.service"],
                 "ENTRY_STOP_VERIFY").strip()
    if active not in (b"inactive", b"failed"):
        raise Failure("ENTRY_STILL_ACTIVE")
    def change(state):
        state.update(entryState="STOPPED", stoppedAt=timestamp(utcnow()), lastAction="stop")
        state["failures"].pop("stop", None)
    store.update(change)
    return "STOPPED"


def operate(action, config, store):
    if action == "start-guard":
        # ExecStartPre must fail before nginx can listen, including after reboot.
        # This branch never creates state or invokes a subprocess.
        if utcnow() >= config.deadline:
            raise Failure("ENTRY_DEADLINE_EXPIRED")
        return "START_ALLOWED"
    if action == "status-failure":
        if os.environ.get("SERVICE_RESULT") == "success":
            return "NO_FAILURE"
        state = store.snapshot()
        previous = os.environ.get("MOYA_CERTIFICATE_ACTION", state.get("lastAction", "service"))
        if previous not in COMMANDS:
            previous = "service"
        # A handled error already has a safe report; only record abnormal exits here.
        if previous not in state["failures"]:
            record_failure(store, previous, "SERVICE_FAILED")
        return "FAILURE_RECORDED"
    if action == "stop" or utcnow() >= config.deadline:
        return stop_entry(config, store)
    store.update(lambda state: state.update(lastAction=action))
    if action == "check":
        store.update(lambda state: state.update(
            renewTimerEnabled=False, renewTimerActive=False, renewAttemptFresh=False
        ))
    if action in ("renew", "dry-run"):
        if action == "renew":
            store.update(lambda state: state.update(
                lastAction=action, lastRenewAttemptAt=timestamp(utcnow())
            ))
        args = [CERTBOT, "renew", "--cert-name", config.cert_name,
                "--quiet", "--no-random-sleep-on-renew"]
        if action == "dry-run":
            args.append("--dry-run")
        run(args, "CERTBOT_RENEW" if action == "renew" else "CERTBOT_DRY_RUN", timeout=900)
    if action in ("renew", "reload", "dry-run"):
        if utcnow() >= config.deadline:
            return stop_entry(config, store)
        disk_certificate(config)
        run([NGINX, "-t"], "NGINX_CONFIG")
        run([SYSTEMCTL, "reload", "nginx.service"], "NGINX_RELOAD")
    for attempt in range(5):
        try:
            evidence = verify_tls(config)
            break
        except Failure as error:
            if action == "check" or str(error) != "SERVED_CERTIFICATE_MISMATCH" or attempt == 4:
                raise
            # HUP is asynchronous; briefly allow new nginx workers to take over.
            time.sleep(0.2)
    if action == "check":
        evidence.update(timer_health(store))
    if utcnow() >= config.deadline:
        return stop_entry(config, store)
    def success(state):
        old_hash = state.get("certificateSha256")
        state.update(evidence)
        state.update(lastAction=action, lastCheckAt=timestamp(utcnow()), entryState="ACTIVE")
        state["failures"].pop(action, None)
        state["failures"].pop("service", None)
        if action == "renew":
            state["lastRenewSuccessAt"] = timestamp(utcnow())
        if action == "dry-run":
            state["lastDryRunSuccessAt"] = timestamp(utcnow())
        if action in ("renew", "reload", "dry-run"):
            state["lastReloadSuccessAt"] = timestamp(utcnow())
        if old_hash and old_hash != evidence["certificateSha256"]:
            state["lastIssuanceDetectedAt"] = timestamp(utcnow())
    store.update(success)
    return "VERIFIED"


def main(arguments=None):
    arguments = sys.argv[1:] if arguments is None else arguments
    if arguments in (["--help"], ["-h"]):
        print("Usage: certificate.py {" + ",".join(COMMANDS) + "}")
        return 0
    if len(arguments) != 1 or arguments[0] not in COMMANDS:
        print(json.dumps({"command": "unknown", "result": "FAILED", "reason": "INVALID_COMMAND"}))
        return 2
    action = arguments[0]
    store = None
    try:
        if os.geteuid() != 0:
            raise Failure("ROOT_REQUIRED")
        config = load_config()
        if action != "start-guard":
            store = Store(config)
        result = operate(action, config, store)
        print(json.dumps({"command": action, "result": result}))
        return 0
    except Exception as error:
        reason = str(error) if isinstance(error, Failure) else "OPERATION_FAILED"
        try:
            if store is not None:
                record_failure(store, action, reason)
        except Exception:
            reason = "STATUS_WRITE_FAILED"
        print(json.dumps({"command": action, "result": "FAILED", "reason": reason}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
