import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import test from "node:test";

const script = fileURLToPath(new URL("./backup-restore.sh", import.meta.url));
const sourceIdentity = "pilot_acceptance|10.0.0.2|5432|100";
const restoreIdentity = "moya_pilot_restore_check|10.0.0.2|5432|200";

const fixture = (t) => {
  const directory = mkdtempSync(join(tmpdir(), "moya-pilot-restore-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = join(directory, "calls");
  writeFileSync(calls, "");
  for (const name of ["services", "passwords"]) {
    writeFileSync(join(directory, name), "synthetic test configuration\n");
  }
  writeFileSync(
    join(directory, "psql"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'psql\\n' >> "$TEST_CALLS"
case "$*" in
  *count*) printf '%s\\n' "$TEST_USER_OBJECTS" ;;
  *service=restore*) printf '%s\\n' "$TEST_RESTORE_IDENTITY" ;;
  *) printf '%s\\n' "$TEST_SOURCE_IDENTITY" ;;
esac
`,
    { mode: 0o700 },
  );
  writeFileSync(
    join(directory, "pg_dump"),
    `#!/usr/bin/env bash
printf 'pg_dump\\n' >> "$TEST_CALLS"
printf 'DUMP'
`,
    { mode: 0o700 },
  );
  writeFileSync(
    join(directory, "pg_restore"),
    `#!/usr/bin/env bash
printf 'pg_restore %s\\n' "$*" >> "$TEST_CALLS"
`,
    { mode: 0o700 },
  );
  const archive = join(directory, "backup.dump");
  writeFileSync(archive, "DUMP");
  const environment = {
    ...process.env,
    PATH: `${directory}${delimiter}${process.env.PATH}`,
    PGSERVICEFILE: join(directory, "services"),
    PGPASSFILE: join(directory, "passwords"),
    MOYA_PILOT_SOURCE_SERVICE: "source",
    MOYA_PILOT_SOURCE_IDENTITY: sourceIdentity,
    MOYA_PILOT_RESTORE_SERVICE: "restore",
    MOYA_PILOT_RESTORE_IDENTITY: restoreIdentity,
    MOYA_PILOT_ARCHIVE_SHA256: createHash("sha256")
      .update("DUMP")
      .digest("hex"),
    TEST_CALLS: calls,
    TEST_SOURCE_IDENTITY: sourceIdentity,
    TEST_RESTORE_IDENTITY: restoreIdentity,
    TEST_USER_OBJECTS: "0",
  };
  return {
    archive,
    environment,
    calls: () => readFileSync(calls, "utf8"),
    run: (mode = "restore", overrides = {}, path = archive) =>
      spawnSync("bash", [script, mode, path], {
        encoding: "utf8",
        env: { ...environment, ...overrides },
      }),
  };
};

for (const scenario of [
  [
    "source identity drift",
    { TEST_SOURCE_IDENTITY: "other" },
    /source identity/,
  ],
  [
    "restore identity drift",
    { TEST_RESTORE_IDENTITY: "other" },
    /restore identity/,
  ],
  [
    "active acceptance database through another service alias",
    {
      TEST_RESTORE_IDENTITY: sourceIdentity,
      MOYA_PILOT_RESTORE_IDENTITY: sourceIdentity,
    },
    /active Pilot database/,
  ],
  [
    "non-rehearsal target",
    {
      TEST_RESTORE_IDENTITY: "shared|10.0.0.2|5432|300",
      MOYA_PILOT_RESTORE_IDENTITY: "shared|10.0.0.2|5432|300",
    },
    /explicitly isolated/,
  ],
  ["nonempty target", { TEST_USER_OBJECTS: "1" }, /contains user objects/],
  [
    "changed archive",
    { MOYA_PILOT_ARCHIVE_SHA256: "0".repeat(64) },
    /Archive SHA/,
  ],
  ["unverified archive", { MOYA_PILOT_ARCHIVE_SHA256: "" }, /archive SHA/],
]) {
  test(`restore refuses ${scenario[0]} before any restore call`, (t) => {
    const current = fixture(t);
    const result = current.run("restore", scenario[1]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, scenario[2]);
    assert.doesNotMatch(current.calls(), /pg_restore|pg_dump/);
  });
}

test("isolated restore calls pg_restore transactionally without clearing or creating", (t) => {
  const current = fixture(t);
  const result = current.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    current.calls(),
    /pg_restore .*--single-transaction --exit-on-error/,
  );
  assert.match(current.calls(), /--dbname=service=restore/);
  assert.doesNotMatch(current.calls(), /--clean|--create|pg_dump/);
});

test("backup refuses an existing archive without invoking pg_dump", (t) => {
  const current = fixture(t);
  const result = current.run("backup");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /existing backup/);
  assert.equal(readFileSync(current.archive, "utf8"), "DUMP");
  assert.doesNotMatch(current.calls(), /pg_dump/);
});

test("backup creates a new retained archive and checks its table of contents", (t) => {
  const current = fixture(t);
  const newArchive = `${current.archive}.new`;
  const result = current.run("backup", {}, newArchive);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(newArchive, "utf8"), "DUMP");
  assert.match(current.calls(), /pg_dump\npg_restore --list/);
});
