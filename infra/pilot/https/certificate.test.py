"""Operational failure tests; these do not substitute for live CA/TLS checks."""

import contextlib
import datetime as dt
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import ssl
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch


SPEC = importlib.util.spec_from_file_location("pilot_certificate", Path(__file__).with_name("certificate.py"))
tls = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tls)
NOW = dt.datetime(2026, 9, 7, 12, 0, tzinfo=dt.timezone.utc)
SECRET = "DO-NOT-REPORT-FAKE-SECRET"


class CertificateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="moya-certificate-test-")
        self.addCleanup(self.temporary.cleanup)
        self.values = {
            "ipv4": "203.0.113.10", "deadlineUTC": "2026-09-14T12:00:00Z",
            "cert_name": "moya-pilot-ip", "webroot": "/var/lib/moya-acme",
            "lineage": "/etc/letsencrypt/live/moya-pilot-ip",
            "status_root": "/var/lib/moya-pilot/https-status",
        }
        self.config = tls.Config(self.values)
        # Only unit-test state is redirected. Production Config rejects this path.
        self.config.status_root = Path(self.temporary.name).resolve() / "status"
        self.store = tls.Store(self.config)
        self.clock = patch.object(tls, "utcnow", return_value=NOW)
        self.clock.start()
        self.addCleanup(self.clock.stop)
        self.evidence = {
            "certificateSha256": "a" * 64, "expiresAt": "2026-09-12T12:00:00Z",
            "remainingSeconds": 5 * 86400, "servedMatchesDisk": True,
            "ipSanMatches": True, "chainTrusted": True,
        }

    def seed_attempt(self, hours=1):
        self.store.update(lambda state: state.update(
            lastRenewAttemptAt=tls.timestamp(NOW - dt.timedelta(hours=hours))
        ))

    def test_date_requires_explicit_utc_and_real_calendar_date(self):
        for value in ("2026-09-14", "2026-09-14T12:00:00+08:00", "2026-02-30T12:00:00Z", None):
            with self.subTest(value=value), self.assertRaises(tls.Failure):
                tls.parse_utc(value)
        self.assertEqual(tls.parse_utc("2026-09-07T12:00:00Z"), NOW)

    def test_config_rejects_extra_fields_and_lineage_escape(self):
        for change in ({"password": SECRET}, {"cert_name": "../x"},
                       {"lineage": "/tmp/lineage"}, {"ipv4": "::1"},
                       {"status_root": "/var/lib/moya-acme/status"}):
            with self.subTest(change=change), self.assertRaises(tls.Failure):
                tls.Config(dict(self.values, **change))

    def test_subprocess_nonzero_and_timeout_never_expose_output(self):
        result = subprocess.CompletedProcess(["fake"], 2, SECRET.encode(), SECRET.encode())
        with patch.object(tls.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(tls.Failure, "^CERTBOT_RENEW_FAILED$"):
                tls.run(["fake"], "CERTBOT_RENEW")
        timeout = subprocess.TimeoutExpired([SECRET], 1, output=SECRET, stderr=SECRET)
        with patch.object(tls.subprocess, "run", side_effect=timeout):
            with self.assertRaisesRegex(tls.Failure, "^CERTBOT_RENEW_TIMEOUT$"):
                tls.run(["fake"], "CERTBOT_RENEW")

    def test_subprocess_does_not_inherit_secret_environment_or_stdin(self):
        result = subprocess.CompletedProcess(["fake"], 0, b"safe", b"")
        with patch.dict(os.environ, {"SECRET_KEY": SECRET}), \
                patch.object(tls.subprocess, "run", return_value=result) as execute:
            tls.run(["fake"], "CHECK")
        self.assertNotIn("SECRET_KEY", execute.call_args.kwargs["env"])
        self.assertEqual(execute.call_args.kwargs["stdin"], subprocess.DEVNULL)

    def test_renew_uses_ari_then_explicit_reload_and_live_verification(self):
        with patch.object(tls, "run", return_value=b"") as execute, \
                patch.object(tls, "disk_certificate", return_value="a" * 64), \
                patch.object(tls, "verify_tls", return_value=self.evidence) as verify:
            self.assertEqual(tls.operate("renew", self.config, self.store), "VERIFIED")
        arguments = [call.args[0] for call in execute.call_args_list]
        self.assertEqual(arguments[0], [tls.CERTBOT, "renew", "--cert-name", "moya-pilot-ip",
                                        "--quiet", "--no-random-sleep-on-renew"])
        self.assertEqual(arguments[1:], [[tls.NGINX, "-t"], [tls.SYSTEMCTL, "reload", "nginx.service"]])
        verify.assert_called_once_with(self.config)
        state = self.store.snapshot()
        self.assertEqual(state["lastRenewAttemptAt"], tls.timestamp(NOW))
        self.assertEqual(state["lastRenewSuccessAt"], tls.timestamp(NOW))
        self.assertNotIn("lastIssuanceDetectedAt", state)

    def test_certbot_failure_does_not_reload_or_claim_success(self):
        with patch.object(tls, "run", side_effect=tls.Failure("CERTBOT_RENEW_FAILED")) as execute, \
                patch.object(tls, "verify_tls") as verify:
            with self.assertRaisesRegex(tls.Failure, "CERTBOT_RENEW_FAILED"):
                tls.operate("renew", self.config, self.store)
        self.assertEqual(execute.call_count, 1)
        verify.assert_not_called()
        self.assertNotIn("lastRenewSuccessAt", self.store.snapshot())

    def test_reload_failure_after_certbot_success_is_failure(self):
        with patch.object(tls, "run", side_effect=[b"", b"", tls.Failure("NGINX_RELOAD_FAILED")]), \
                patch.object(tls, "disk_certificate", return_value="a" * 64):
            with self.assertRaisesRegex(tls.Failure, "NGINX_RELOAD_FAILED"):
                tls.operate("renew", self.config, self.store)
        self.assertNotIn("lastRenewSuccessAt", self.store.snapshot())

    def test_disk_chain_failure_prevents_nginx_reload(self):
        with patch.object(tls, "run", return_value=b"") as execute, \
                patch.object(tls, "disk_certificate", side_effect=tls.Failure("DISK_CHAIN_FAILED")):
            with self.assertRaisesRegex(tls.Failure, "DISK_CHAIN_FAILED"):
                tls.operate("dry-run", self.config, self.store)
        self.assertEqual(execute.call_count, 1)

    def test_dry_run_does_not_use_staging_lineage_or_mark_production_renewal(self):
        with patch.object(tls, "run", return_value=b"") as execute, \
                patch.object(tls, "disk_certificate", return_value="a" * 64), \
                patch.object(tls, "verify_tls", return_value=self.evidence):
            tls.operate("dry-run", self.config, self.store)
        command = execute.call_args_list[0].args[0]
        self.assertIn("--dry-run", command)
        self.assertNotIn("--staging", command)
        self.assertNotIn("--run-deploy-hooks", command)
        state = self.store.snapshot()
        self.assertIn("lastDryRunSuccessAt", state)
        self.assertNotIn("lastRenewSuccessAt", state)
        self.assertNotIn("lastRenewAttemptAt", state)

    def test_reload_waits_briefly_for_asynchronous_nginx_workers(self):
        with patch.object(tls, "run", return_value=b""), \
                patch.object(tls, "disk_certificate", return_value="a" * 64), \
                patch.object(tls, "verify_tls", side_effect=[
                    tls.Failure("SERVED_CERTIFICATE_MISMATCH"), self.evidence
                ]) as verify, patch.object(tls.time, "sleep") as sleep:
            tls.operate("reload", self.config, self.store)
        self.assertEqual(verify.call_count, 2)
        sleep.assert_called_once_with(0.2)

    def test_persistent_served_mismatch_fails_after_bounded_retries(self):
        with patch.object(tls, "run", return_value=b""), \
                patch.object(tls, "disk_certificate", return_value="a" * 64), \
                patch.object(tls, "verify_tls", side_effect=tls.Failure("SERVED_CERTIFICATE_MISMATCH")) as verify, \
                patch.object(tls.time, "sleep"):
            with self.assertRaisesRegex(tls.Failure, "SERVED_CERTIFICATE_MISMATCH"):
                tls.operate("reload", self.config, self.store)
        self.assertEqual(verify.call_count, 5)

    def test_tls_uses_system_ca_and_configured_ip_for_hostname_verification(self):
        der = b"unit-test-public-certificate"
        secure = MagicMock()
        secure.getpeercert.side_effect = lambda binary_form=False: der if binary_form else {
            "subjectAltName": (("IP Address", self.config.ipv4),),
            "notAfter": "Sep 12 12:00:00 2026 GMT",
        }
        context = MagicMock()
        context.wrap_socket.return_value.__enter__.return_value = secure
        with patch.object(tls, "disk_certificate", return_value=hashlib.sha256(der).hexdigest()), \
                patch.object(tls.ssl, "create_default_context", return_value=context) as defaults, \
                patch.object(tls.socket, "create_connection") as connect:
            result = tls.verify_tls(self.config)
        defaults.assert_called_once_with(cafile=tls.SYSTEM_CA_FILE, capath=tls.SYSTEM_CA_PATH)
        connect.assert_called_once_with(("127.0.0.1", 443), timeout=10)
        self.assertEqual(context.wrap_socket.call_args.kwargs["server_hostname"], self.config.ipv4)
        self.assertTrue(result["chainTrusted"])

    def test_untrusted_tls_exception_is_sanitized(self):
        with patch.object(tls, "disk_certificate", return_value="a" * 64), \
                patch.object(tls.socket, "create_connection", side_effect=ssl.SSLError(SECRET)):
            with self.assertRaisesRegex(tls.Failure, "^TLS_VERIFICATION_FAILED$"):
                tls.verify_tls(self.config)

    def test_hourly_check_requires_enabled_and_active_renew_timer(self):
        self.seed_attempt()
        with patch.object(tls, "verify_tls", return_value=self.evidence), \
                patch.object(tls, "run", side_effect=[b"", tls.Failure("RENEW_TIMER_ACTIVE_FAILED")]):
            with self.assertRaisesRegex(tls.Failure, "RENEW_TIMER_ACTIVE_FAILED"):
                tls.operate("check", self.config, self.store)
        state = self.store.snapshot()
        self.assertTrue(state["renewTimerEnabled"])
        self.assertFalse(state["renewTimerActive"])

    def test_hourly_check_rejects_missing_stale_or_future_attempt(self):
        with patch.object(tls, "run", return_value=b""):
            with self.assertRaisesRegex(tls.Failure, "RENEW_ATTEMPT_MISSING"):
                tls.timer_health(self.store)
            for hours in (9, -1):
                self.seed_attempt(hours)
                with self.assertRaisesRegex(tls.Failure, "RENEW_ATTEMPT_STALE"):
                    tls.timer_health(self.store)

    def test_successful_hourly_check_does_not_clear_unresolved_renewal_failure(self):
        self.seed_attempt()
        tls.record_failure(self.store, "renew", "CERTBOT_RENEW_FAILED")
        with patch.object(tls, "verify_tls", return_value=self.evidence), \
                patch.object(tls, "run", return_value=b""):
            tls.operate("check", self.config, self.store)
        self.assertEqual(self.store.snapshot()["health"], "FAILED")
        self.assertEqual(self.store.snapshot()["failureCount"], 1)

    def test_expiry_warning_is_reported_below_48_hours(self):
        self.store.update(lambda state: state.update(entryState="ACTIVE", remainingSeconds=47 * 3600))
        state = self.store.snapshot()
        self.assertEqual(state["health"], "WARNING")
        self.assertEqual(state["warnings"], ["CERTIFICATE_UNDER_48_HOURS"])

    def test_deadline_stop_does_nothing_early(self):
        with patch.object(tls, "run") as execute:
            self.assertEqual(tls.operate("stop", self.config, self.store), "NOT_DUE")
        execute.assert_not_called()

    def test_deadline_stop_only_disables_nginx_and_certificate_timers(self):
        self.config.deadline = NOW
        with patch.object(tls, "run", side_effect=[b"", b"", b"inactive\n"]) as execute:
            self.assertEqual(tls.operate("stop", self.config, self.store), "STOPPED")
        commands = [call.args[0] for call in execute.call_args_list]
        self.assertEqual(commands[:2], [
            [tls.SYSTEMCTL, "disable", "--now", tls.RENEW_TIMER, tls.CHECK_TIMER],
            [tls.SYSTEMCTL, "disable", "--now", "nginx.service"],
        ])
        self.assertEqual(self.store.snapshot()["entryState"], "STOPPED")

    def test_stop_still_attempts_nginx_if_timer_stop_fails(self):
        self.config.deadline = NOW
        with patch.object(tls, "run", side_effect=[tls.Failure("ENTRY_STOP_FAILED"), b""]) as execute:
            with self.assertRaisesRegex(tls.Failure, "ENTRY_STOP_FAILED"):
                tls.stop_entry(self.config, self.store)
        self.assertEqual(execute.call_count, 2)
        self.assertNotEqual(self.store.snapshot()["entryState"], "STOPPED")

    def test_overdue_renew_stops_entry_without_contacting_ca(self):
        self.config.deadline = NOW - dt.timedelta(seconds=1)
        with patch.object(tls, "run", side_effect=[b"", b"", b"inactive\n"]) as execute:
            tls.operate("renew", self.config, self.store)
        self.assertFalse(any(call.args[0][0] == tls.CERTBOT for call in execute.call_args_list))

    def test_state_and_public_report_permissions_and_projection(self):
        self.store.update(lambda state: state.update(privateDiagnostic=SECRET))
        for name, mode in (("state.json", 0o600), ("status.json", 0o644), ("index.html", 0o644)):
            path = self.config.status_root / name
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), mode)
            if name != "state.json":
                self.assertNotIn(SECRET, path.read_text())
        self.assertEqual(stat.S_IMODE(self.config.status_root.stat().st_mode), 0o755)

    def test_status_directory_symlink_is_rejected(self):
        link = Path(self.temporary.name).resolve() / "redirect"
        link.symlink_to(self.config.status_root, target_is_directory=True)
        with self.assertRaisesRegex(tls.Failure, "UNSAFE_STATUS_DIRECTORY"):
            tls.safe_directory(link)

    def test_exec_stop_post_success_does_not_create_failure(self):
        with patch.dict(os.environ, {"SERVICE_RESULT": "success"}):
            self.assertEqual(tls.operate("status-failure", self.config, self.store), "NO_FAILURE")
        self.assertEqual(self.store.snapshot()["failureCount"], 0)

    def test_exec_stop_post_abnormal_exit_uses_own_unit_action_and_deduplicates(self):
        self.store.update(lambda state: state.update(lastAction="check"))
        with patch.dict(os.environ, {"SERVICE_RESULT": "timeout", "MOYA_CERTIFICATE_ACTION": "renew"}):
            tls.operate("status-failure", self.config, self.store)
            tls.operate("status-failure", self.config, self.store)
        self.assertEqual(self.store.snapshot()["failures"], {"renew": "SERVICE_FAILED"})
        self.assertEqual(self.store.snapshot()["failureCount"], 1)

    def test_main_suppresses_raw_exception_and_returns_nonzero(self):
        output = io.StringIO()
        with patch.object(tls.os, "geteuid", return_value=0), \
                patch.object(tls, "load_config", return_value=self.config), \
                patch.object(tls, "Store", return_value=self.store), \
                patch.object(tls, "operate", side_effect=RuntimeError(SECRET)), \
                contextlib.redirect_stdout(output):
            self.assertEqual(tls.main(["renew"]), 1)
        self.assertNotIn(SECRET, output.getvalue())
        self.assertNotIn(SECRET, (self.config.status_root / "status.json").read_text())
        self.assertEqual(json.loads(output.getvalue())["reason"], "OPERATION_FAILED")

    def test_invalid_command_never_echoes_unexpected_arguments(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(tls.main(["renew", SECRET]), 2)
        self.assertNotIn(SECRET, output.getvalue())

    def test_disk_requires_ip_san_and_system_ca_chain_before_use(self):
        pem = b"-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----\n"
        archive = Path("/etc/letsencrypt/archive/moya-pilot-ip/cert1.pem")
        with patch.object(Path, "resolve", return_value=archive), \
                patch.object(Path, "read_bytes", return_value=pem), \
                patch.object(tls, "run", side_effect=[b"IP Address:203.0.113.10\n", b"OK"]) as execute:
            result = tls.disk_certificate(self.config)
        self.assertEqual(result, hashlib.sha256(b"\x01\x02\x03").hexdigest())
        self.assertEqual(execute.call_args_list[1].args[0], [
            tls.OPENSSL, "verify", "-verify_ip", "203.0.113.10", "-untrusted",
            str(self.config.lineage / "chain.pem"), str(self.config.lineage / "cert.pem"),
        ])

    def test_disk_wrong_ip_san_is_rejected(self):
        pem = b"-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----\n"
        with patch.object(Path, "resolve", return_value=Path("/etc/letsencrypt/archive/moya-pilot-ip/cert1.pem")), \
                patch.object(Path, "read_bytes", return_value=pem), \
                patch.object(tls, "run", return_value=b"IP Address:203.0.113.20\n"):
            with self.assertRaisesRegex(tls.Failure, "DISK_IP_SAN_MISMATCH"):
                tls.disk_certificate(self.config)

    def test_live_leaf_hash_mismatch_is_rejected(self):
        secure = MagicMock()
        secure.getpeercert.side_effect = lambda binary_form=False: b"other" if binary_form else {
            "subjectAltName": (("IP Address", self.config.ipv4),),
            "notAfter": "Sep 12 12:00:00 2026 GMT",
        }
        context = MagicMock()
        context.wrap_socket.return_value.__enter__.return_value = secure
        with patch.object(tls, "disk_certificate", return_value="a" * 64), \
                patch.object(tls.ssl, "create_default_context", return_value=context), \
                patch.object(tls.socket, "create_connection"):
            with self.assertRaisesRegex(tls.Failure, "SERVED_CERTIFICATE_MISMATCH"):
                tls.verify_tls(self.config)

    def test_start_guard_before_deadline_is_read_only(self):
        output = io.StringIO()
        with patch.object(tls.os, "geteuid", return_value=0), \
                patch.object(tls, "load_config", return_value=self.config), \
                patch.object(tls, "Store") as store, patch.object(tls, "run") as execute, \
                contextlib.redirect_stdout(output):
            self.assertEqual(tls.main(["start-guard"]), 0)
        store.assert_not_called()
        execute.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())["result"], "START_ALLOWED")

    def test_start_guard_rejects_exact_deadline_and_later_without_side_effects(self):
        for elapsed in (0, 86400):
            self.config.deadline = NOW - dt.timedelta(seconds=elapsed)
            output = io.StringIO()
            with self.subTest(elapsed=elapsed), \
                    patch.object(tls.os, "geteuid", return_value=0), \
                    patch.object(tls, "load_config", return_value=self.config), \
                    patch.object(tls, "Store") as store, patch.object(tls, "run") as execute, \
                    contextlib.redirect_stdout(output):
                self.assertEqual(tls.main(["start-guard"]), 1)
            store.assert_not_called()
            execute.assert_not_called()
            self.assertEqual(json.loads(output.getvalue())["reason"], "ENTRY_DEADLINE_EXPIRED")

    def test_start_guard_rejects_invalid_configuration_without_writing_status(self):
        output = io.StringIO()
        with patch.object(tls.os, "geteuid", return_value=0), \
                patch.object(tls, "load_config", side_effect=tls.Failure("INVALID_UTC_DATE")), \
                patch.object(tls, "Store") as store, patch.object(tls, "run") as execute, \
                contextlib.redirect_stdout(output):
            self.assertEqual(tls.main(["start-guard"]), 1)
        store.assert_not_called()
        execute.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())["reason"], "INVALID_UTC_DATE")

    def test_start_guard_missing_configuration_is_fail_closed_and_sanitized(self):
        output = io.StringIO()
        with patch.object(tls.os, "geteuid", return_value=0), \
                patch.object(tls, "read_json", side_effect=FileNotFoundError(SECRET)), \
                patch.object(tls, "Store") as store, patch.object(tls, "run") as execute, \
                contextlib.redirect_stdout(output):
            self.assertEqual(tls.main(["start-guard"]), 1)
        store.assert_not_called()
        execute.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())["reason"], "CONFIG_UNAVAILABLE")
        self.assertNotIn(SECRET, output.getvalue())


if __name__ == "__main__":
    unittest.main()
