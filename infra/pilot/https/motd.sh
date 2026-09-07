#!/bin/sh
# Install in /etc/update-motd.d/ with __PILOT_STATUS_JSON__ replaced by
# the configured status_root/status.json. This reads only the public safe report.
exec /usr/bin/python3 - '__PILOT_STATUS_JSON__' <<'PY'
import datetime
import json
import pathlib
import sys

try:
    report = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    health = report.get("health")
    if health not in ("OK", "WARNING", "FAILED", "STOPPED", "UNKNOWN"):
        raise ValueError()
    checked = datetime.datetime.fromisoformat(report["updatedAt"].replace("Z", "+00:00"))
    age = (datetime.datetime.now(datetime.timezone.utc) - checked).total_seconds()
    if age > 2 * 3600 and health != "STOPPED":
        health = "STALE"
    print("Pilot TLS: " + health + ". Passive local status; no external alert is sent.")
except Exception:
    print("Pilot TLS: STATUS_UNAVAILABLE. Check the certificate services.")
PY
