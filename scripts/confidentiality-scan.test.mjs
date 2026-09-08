import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { categories, inspect, digest } from "./confidentiality-scan.mjs";

const source = path.dirname(fileURLToPath(import.meta.url));
// These intentionally invalid fixtures are assembled at runtime. No production
// identity, address, credential or media is read by this suite.
const approvedName = "Synthetic Developer";
const approvedEmail = ["synthetic-developer", "users.noreply.github.com"].join(
  "@",
);
const rejectedEmail = ["synthetic-person", "fictional-person.invalidtld"].join(
  "@",
);
const token = ["gh", "p_", "Z".repeat(36)].join("");
const privatePath = [
  "/",
  "Users",
  "/",
  "synthetic-person",
  "/private-input",
].join("");
const address = [10, 24, 31, 57].join(".");
const secretContent = ['const payload = "', token, '";\n'].join("");
const signedUrl =
  "https://example.invalid/" + "image?" + "q-signature=" + "a".repeat(40);

function run(command, args, { cwd, env, input } = {}) {
  return spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: "utf8",
    timeout: 30000,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}
function fixture(t, installed = true) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "confidentiality-synthetic-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const globalConfig = path.join(dir, "synthetic-config");
  writeFileSync(
    globalConfig,
    "[user]\n name = " +
      approvedName +
      "\n email = " +
      approvedEmail +
      "\n useConfigOnly = true\n",
  );
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const key of Object.keys(env))
    if (
      /^GIT_(?:AUTHOR|COMMITTER|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$)/.test(
        key,
      )
    )
      delete env[key];
  const repo = path.join(dir, "repo");
  mkdirSync(repo);
  const git = (...args) => run("git", args, { cwd: repo, env });
  const good = (...args) => {
    const result = git(...args);
    assert.equal(result.status, 0, "synthetic Git setup must succeed");
    return result.stdout.trim();
  };
  good("init", "-b", "main");
  writeFileSync(path.join(repo, "safe.txt"), "Explicit synthetic fixture.\n");
  good("add", ".");
  good("commit", "-m", "Synthetic base");
  const remote = path.join(dir, "remote.git");
  assert.equal(run("git", ["init", "--bare", remote], { env }).status, 0);
  good("remote", "add", "origin", remote);
  good("push", "origin", "main");
  const install = (...args) =>
    run(
      process.execPath,
      [
        path.join(source, "install-confidentiality-hooks.mjs"),
        "--confirm-current-identity-approved",
        ...args,
      ],
      { cwd: repo, env },
    );
  const scan = (mode, ...args) =>
    run(
      process.execPath,
      [path.join(source, "confidentiality-scan.mjs"), mode, ...args],
      { cwd: repo, env },
    );
  if (installed)
    assert.equal(install().status, 0, "synthetic install must succeed");
  return { dir, repo, remote, env, git, good, install, scan, globalConfig };
}
function blocked(result, expected) {
  assert.notEqual(result.status, 0, "operation must be blocked");
  if (expected)
    assert.ok(
      (result.stdout + result.stderr).includes(expected),
      "sanitized category must be present",
    );
  for (const value of [token, signedUrl])
    assert.ok(
      !(result.stdout + result.stderr).includes(value),
      "diagnostics must suppress synthetic sensitive values",
    );
}
function add(f, content, filename = "fixture.txt") {
  writeFileSync(path.join(f.repo, filename), content);
  f.good("add", "--", filename);
}

test("types, references, relative imports and versions are not credential literals", () => {
  const values = [
    "password:string",
    "SecretKey:options.secretKey",
    "token: process.env.API_TOKEN",
    "const password = process.env.PASSWORD;",
    "const key = options.secretKey;",
    "import value from '../../module';",
    'const version = "18.4.0";',
    'const assignment = "API_KEY=" + "PLACEHOLDER";',
    "type Login = { password: string; secretKey?: string };",
  ];
  for (const value of values)
    assert.deepEqual(categories(value, "fixture.ts"), []);
  assert.deepEqual(categories('{"cookie":"^1.0.0"}', "package.json"), []);
  assert.deepEqual(
    categories("https://example.invalid/search?code=9781234567890", "notes.md"),
    [],
  );
  for (const text of [
    'username, password = value["username"], value["password"]',
    "username, password = load_auth(args.auth_file)",
    "wrong_password = secrets.token_urlsafe(32)",
    "while wrong_password == password:",
    "headers, body = authenticated(asset_path, check_wrong_password=False)",
  ])
    assert.deepEqual(categories(text, "probe.py"), []);
  for (const operator of ["=", ":=", "==", "!=", "===", "!=="])
    assert.ok(
      categories(
        ["password", operator, '"opaqueCredential123456789"'].join(" "),
        "probe.py",
      ).length,
    );
});
test("ordinary identifiers, certificates, public keys and readable artifacts pass", () => {
  for (const filename of [
    "pilot.service",
    "pilot.timer",
    "drawing.svg",
    "certificate.pem",
    "config.env",
  ]) {
    const text = [
      address,
      privatePath,
      rejectedEmail,
      "https://example.invalid/path",
      "resource-id-example",
      "<svg></svg>",
      "-----BEGIN CERTIFICATE-----",
      "QUJDREVGR0hJ",
      "-----END CERTIFICATE-----",
      "-----BEGIN PUBLIC KEY-----",
      "QUJDREVGR0hJ",
      "-----END PUBLIC KEY-----",
      "version https://git-lfs.github.com/spec/v1",
      "oid sha256:" + "a".repeat(64),
      "TOKEN=PLACEHOLDER",
      "PASSWORD=${PASSWORD}",
    ].join("\n");
    assert.deepEqual(inspect(Buffer.from(text), filename), []);
  }
  const findings = inspect(Buffer.from([0, 255]), "photo.png");
  assert.equal(findings[0].severity, "WARN");
  assert.equal(findings[0].path, "photo.png");
});
test("core credentials retain location without printing values", () => {
  const samples = [
    token,
    ["-----BEGIN ", "PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----"].join(
      "",
    ),
    ["postgres://example:", "opaquePass987", "@example.invalid/db"].join(""),
    "COS_SECRET_KEY=" + "opaqueCredential123456789",
    signedUrl,
  ];
  for (const sample of samples) {
    const findings = inspect(Buffer.from("safe\n" + sample), "config.env");
    assert.ok(
      findings.some(
        (f) =>
          f.severity === "BLOCK" && f.line === 2 && f.path === "config.env",
      ),
    );
    assert.ok(!JSON.stringify(findings).includes(sample));
  }
  for (const [filename, text] of [
    ["settings.yml", "password: " + "opaqueCredential123456789"],
    ["settings.yaml", "api_key: " + "opaqueCredential123456789"],
    [
      "pilot.service",
      ['Environment="', "API_KEY", "=", "opaqueCredential123456789", '"'].join(
        "",
      ),
    ],
  ])
    assert.ok(categories(text, filename).includes("CREDENTIAL_LITERAL"));
});
test("actual message, trailer and exact outbound text check only core credentials", (t) => {
  const f = fixture(t);
  add(f, "safe\n");
  blocked(f.git("commit", "-m", "Synthetic title\n\n" + token), "API_TOKEN");
  assert.equal(
    f.git(
      "commit",
      "-m",
      "Synthetic title\n\nCo-authored-by: Example <" + rejectedEmail + ">",
    ).status,
    0,
  );
  const file = path.join(f.dir, "payload.md");
  writeFileSync(file, signedUrl);
  blocked(f.scan("outbound", file), "AUTHORIZING_URL");
  writeFileSync(
    file,
    "Ordinary URL https://example.invalid/ and " + privatePath,
  );
  assert.equal(f.scan("outbound", file).status, 0);
});
test("same content and syntax context reuse cache, changed bytes are rechecked", (t) => {
  const f = fixture(t);
  add(f, "Safe reusable content\n");
  const a = JSON.parse(f.scan("staged").stdout),
    b = JSON.parse(f.scan("staged").stdout);
  assert.equal(a.status, "PASS");
  assert.equal(b.scanned, 0);
  assert.ok(b.reused > 0);
  assert.ok(b.batchUsedMs >= a.batchUsedMs);
  add(f, secretContent);
  blocked(f.scan("staged"), "API_TOKEN");
  assert.deepEqual(categories("password=options.password", "fixture.ts"), []);
  assert.ok(categories("password=options.password", "fixture.env").length);
});
test("normal includeIf and worktree config do not trigger credential blocking", (t) => {
  const f = fixture(t, false);
  const include = path.join(f.dir, "included-config");
  writeFileSync(include, "[alias]\n example = status\n");
  f.good("config", "includeIf.onbranch:main.path", include);
  f.good("config", "extensions.worktreeConfig", "true");
  f.good("config", "--worktree", "core.sparseCheckout", "false");
  assert.equal(f.install().status, 0);
  add(f, "Safe bytes\n");
  assert.equal(f.scan("staged").status, 0);
});
test("one delivery allowance spans stages and a real deadline kills child processes", async (t) => {
  const f = fixture(t);
  add(f, "Safe budget bytes\n");
  assert.equal(f.scan("staged").status, 0);
  const common = f.good(
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  );
  const admin = f.good("rev-parse", "--absolute-git-dir");
  const stateFile = path.join(
    common,
    "confidentiality-check-state",
    digest(Buffer.from(admin)) + ".json",
  );
  const state = JSON.parse(readFileSync(stateFile));
  state.remainingMs = 800;
  state.usedMs = 119200;
  writeFileSync(stateFile, JSON.stringify(state));
  const helper = path.join(f.dir, "slow-transport");
  const marker = path.join(f.dir, "should-not-complete");
  const pidFile = path.join(f.dir, "helper.pid");
  writeFileSync(
    helper,
    '#!/bin/sh\nprintf "%s" "$$" > "' +
      pidFile +
      '"\nsleep 2\nprintf done > "' +
      marker +
      '"\n',
  );
  chmodSync(helper, 0o700);
  f.good("config", "protocol.ext.allow", "always");
  const head = f.good("rev-parse", "HEAD");
  const start = Date.now();
  const r = run(
    process.execPath,
    [
      path.join(source, "confidentiality-scan.mjs"),
      "push",
      "example",
      "ext::" + helper,
    ],
    {
      cwd: f.repo,
      env: f.env,
      input:
        "refs/heads/main " + head + " refs/heads/new " + "0".repeat(40) + "\n",
    },
  );
  assert.equal(r.status, 2);
  const result = JSON.parse(r.stdout);
  assert.equal(result.status, "INCOMPLETE");
  assert.ok(Date.now() - start < 1500);
  assert.equal(r.stdout.trim().split("\n").length, 1);
  assert.equal(existsSync(marker), false);
  assert.equal(f.scan("staged").status, 2);
  assert.ok(existsSync(pidFile), "the slow related process actually started");
  await new Promise((resolve) => setTimeout(resolve, 2200));
  assert.equal(
    existsSync(marker),
    false,
    "the helper cannot continue after the deadline",
  );
});

test("installer freezes only local policy and health verifies same version", (t) => {
  const f = fixture(t);
  const before = readFileSync(f.globalConfig);
  assert.equal(f.scan("health").status, 0);
  assert.equal(JSON.parse(f.install().stdout).changed, false);
  assert.ok(
    path.isAbsolute(f.good("config", "--local", "--get", "core.hooksPath")),
  );
  assert.equal(
    f.good("config", "--local", "--get", "confidentiality.approvedEmail"),
    approvedEmail,
  );
  assert.deepEqual(readFileSync(f.globalConfig), before);
});
test("unknown custom hook is preserved and installation stops", (t) => {
  const f = fixture(t, false);
  const hook = path.join(f.repo, ".git", "hooks", "pre-commit");
  const contents = "#!/bin/sh\nexit 0\n";
  writeFileSync(hook, contents);
  chmodSync(hook, 0o700);
  blocked(f.install(), "EXISTING_HOOKS_CONFLICT");
  assert.equal(readFileSync(hook, "utf8"), contents);
  assert.equal(f.git("config", "--local", "--get", "core.hooksPath").status, 1);
});
test("unknown hooksPath is preserved and installation stops", (t) => {
  const f = fixture(t, false);
  f.good("config", "--local", "core.hooksPath", "synthetic-custom-hooks");
  blocked(f.install(), "EXISTING_HOOKS_PATH_CONFLICT");
  assert.equal(
    f.good("config", "--local", "--get", "core.hooksPath"),
    "synthetic-custom-hooks",
  );
});
test("installed file tamper stops health and subsequent commit", (t) => {
  const f = fixture(t);
  const hooks = f.good("config", "--local", "--get", "core.hooksPath");
  writeFileSync(path.join(hooks, "pre-push"), "#!/bin/sh\nexit 1\n");
  blocked(f.scan("health"), "INSTALLED_FILE_CHANGED");
  add(f, "Safe synthetic change.\n");
  blocked(f.git("commit", "-m", "Synthetic update"), "INSTALLED_FILE_CHANGED");
});
test("actual pre-commit scans staged secret even when worktree is cleaned", (t) => {
  const f = fixture(t);
  add(f, secretContent);
  writeFileSync(path.join(f.repo, "fixture.txt"), "Clean working copy.\n");
  blocked(f.git("commit", "-m", "Synthetic update"), "API_TOKEN");
});
test("actual pre-commit accepts clean staged bytes despite unstaged secret", (t) => {
  const f = fixture(t);
  add(f, "Safe staged bytes.\n");
  writeFileSync(path.join(f.repo, "fixture.txt"), secretContent);
  assert.equal(f.git("commit", "-m", "Synthetic clean index").status, 0);
});
test("whole modified blob includes preexisting unchanged sensitive line", (t) => {
  const f = fixture(t, false);
  add(f, secretContent);
  f.good("commit", "-m", "Synthetic historical input");
  assert.equal(f.install().status, 0);
  add(f, secretContent + "A new unrelated line.\n");
  blocked(f.git("commit", "-m", "Synthetic update"), "API_TOKEN");
});
test("old sibling worktree without tracked guard files uses shared hooks", (t) => {
  const f = fixture(t);
  const sibling = path.join(f.dir, "stale-worktree");
  f.good("worktree", "add", "-b", "synthetic-sibling", sibling, "main");
  assert.equal(existsSync(path.join(sibling, ".githooks")), false);
  writeFileSync(path.join(sibling, "fixture.txt"), secretContent);
  assert.equal(
    run("git", ["add", "."], { cwd: sibling, env: f.env }).status,
    0,
  );
  blocked(
    run("git", ["commit", "-m", "Synthetic update"], {
      cwd: sibling,
      env: f.env,
    }),
    "API_TOKEN",
  );
});
test("actual new-branch push scans every intermediate added then removed blob", (t) => {
  const f = fixture(t, false);
  f.good("switch", "-c", "synthetic-new");
  add(f, secretContent);
  f.good("commit", "-m", "Synthetic intermediate");
  f.good("rm", "fixture.txt");
  f.good("commit", "-m", "Synthetic removal");
  assert.equal(f.install().status, 0);
  blocked(f.git("push", "origin", "synthetic-new"), "API_TOKEN");
});
test("actual push scans renamed intermediate content", (t) => {
  const f = fixture(t, false);
  add(f, secretContent);
  f.good("commit", "-m", "Synthetic intermediate");
  f.good("mv", "fixture.txt", "renamed.txt");
  f.good("commit", "-m", "Synthetic rename");
  add(f, "Safe final bytes.\n", "renamed.txt");
  f.good("commit", "-m", "Synthetic final");
  assert.equal(f.install().status, 0);
  blocked(f.git("push", "origin", "main"), "API_TOKEN");
});
test("annotated tag message is scanned even when target already remote", (t) => {
  const f = fixture(t);
  f.good("tag", "-a", "synthetic-tag", "-m", "Synthetic tag " + token);
  blocked(f.git("push", "origin", "synthetic-tag"), "API_TOKEN");
});
test("actual clean new-branch push succeeds against confirmed baseline", (t) => {
  const f = fixture(t);
  f.good("switch", "-c", "synthetic-clean");
  add(f, "Safe synthetic update.\n");
  f.good("commit", "-m", "Synthetic clean update");
  assert.equal(f.git("push", "origin", "synthetic-clean").status, 0);
});
test("unavailable remote baseline fails closed without raw Git error", (t) => {
  const f = fixture(t);
  const head = f.good("rev-parse", "HEAD");
  const result = run(
    process.execPath,
    [
      path.join(source, "confidentiality-scan.mjs"),
      "push",
      "synthetic-missing",
      path.join(f.dir, "missing.git"),
    ],
    {
      cwd: f.repo,
      env: f.env,
      input:
        "refs/heads/main " + head + " refs/heads/main " + "0".repeat(40) + "\n",
    },
  );
  blocked(result, "GIT_READ_FAILED");
  assert.equal(result.stderr, "");
  assert.ok(!result.stdout.includes(f.dir));
});
test("unrelated remote branch missing locally does not block a new branch", (t) => {
  const f = fixture(t);
  const other = path.join(f.dir, "other");
  assert.equal(
    run("git", ["clone", f.remote, other], { env: f.env }).status,
    0,
  );
  writeFileSync(path.join(other, "other.txt"), "Other synthetic bytes.\n");
  for (const args of [
    ["add", "."],
    ["commit", "-m", "Synthetic remote advance"],
    ["push", "origin", "HEAD:refs/heads/other"],
  ])
    assert.equal(run("git", args, { cwd: other, env: f.env }).status, 0);
  f.good("switch", "-c", "synthetic-local");
  add(f, "Safe bytes.\n");
  f.good("commit", "-m", "Synthetic update");
  assert.equal(f.git("push", "origin", "synthetic-local").status, 0);
});
test("merge resolution blob is scanned against all parents", (t) => {
  const f = fixture(t, false);
  f.good("switch", "-c", "synthetic-side");
  add(f, "Synthetic side.\n", "side.txt");
  f.good("commit", "-m", "Synthetic side");
  f.good("switch", "main");
  add(f, "Synthetic main.\n", "main.txt");
  f.good("commit", "-m", "Synthetic main");
  f.good("merge", "--no-commit", "--no-ff", "synthetic-side");
  add(f, secretContent);
  f.good("commit", "-m", "Synthetic merge");
  assert.equal(f.install().status, 0);
  blocked(f.git("push", "origin", "main"), "API_TOKEN");
});

test("invalid UTF-8 filenames cannot collide and hide staged sensitive content", (t) => {
  const f = fixture(t);
  const sensitiveBlob = run("git", ["hash-object", "-w", "--stdin"], {
    cwd: f.repo,
    env: f.env,
    input: secretContent,
  }).stdout.trim();
  const safeBlob = run("git", ["hash-object", "-w", "--stdin"], {
    cwd: f.repo,
    env: f.env,
    input: "Safe bytes.\n",
  }).stdout.trim();
  const indexInput = Buffer.concat([
    Buffer.from("100644 " + sensitiveBlob + "\t"),
    Buffer.from([0x80, 0]),
    Buffer.from("100644 " + safeBlob + "\t"),
    Buffer.from([0x81, 0]),
  ]);
  assert.equal(
    run("git", ["update-index", "-z", "--index-info"], {
      cwd: f.repo,
      env: f.env,
      input: indexInput,
    }).status,
    0,
  );
  blocked(f.scan("staged"), "GIT_TEXT_UNREADABLE");
});
test("repository fsmonitor helper is not executed during staged inspection", (t) => {
  const f = fixture(t);
  const marker = path.join(f.dir, "helper-ran");
  const helper = path.join(f.dir, "synthetic-helper");
  writeFileSync(helper, '#!/bin/sh\nprintf x > "' + marker + '"\n');
  chmodSync(helper, 0o700);
  add(f, "Safe bytes.\n");
  f.good("config", "core.fsmonitor", helper);
  assert.equal(f.scan("staged").status, 0);
  assert.equal(existsSync(marker), false);
});
test("controlled update preserves shared directory and requires explicit update", (t) => {
  const f = fixture(t);
  f.env.CONFIDENTIALITY_BATCH_ID = "synthetic-controlled-update";
  add(f, "Reusable content across a rule update\n");
  const prior = JSON.parse(f.scan("staged").stdout);
  const release = path.join(f.dir, "synthetic-release");
  mkdirSync(path.join(release, "scripts"), { recursive: true });
  mkdirSync(path.join(release, ".githooks"));
  for (const filename of [
    "confidentiality-scan.mjs",
    "install-confidentiality-hooks.mjs",
  ]) {
    copyFileSync(
      path.join(source, filename),
      path.join(release, "scripts", filename),
    );
  }
  for (const filename of ["pre-commit", "commit-msg", "pre-push"]) {
    copyFileSync(
      path.join(source, "..", ".githooks", filename),
      path.join(release, ".githooks", filename),
    );
  }
  const nextScanner = path.join(release, "scripts", "confidentiality-scan.mjs");
  writeFileSync(
    nextScanner,
    readFileSync(nextScanner, "utf8") + "\n// Synthetic controlled update.\n",
  );
  const installer = path.join(
    release,
    "scripts",
    "install-confidentiality-hooks.mjs",
  );
  const hooks = f.good("config", "--local", "--get", "core.hooksPath");
  blocked(
    run(process.execPath, [installer], { cwd: f.repo, env: f.env }),
    "EXPLICIT_CONTROLLED_UPDATE_REQUIRED",
  );
  assert.equal(
    run(process.execPath, [installer, "--update"], { cwd: f.repo, env: f.env })
      .status,
    0,
  );
  assert.equal(f.good("config", "--local", "--get", "core.hooksPath"), hooks);
  const next = run(process.execPath, [nextScanner, "staged"], {
    cwd: f.repo,
    env: f.env,
  });
  assert.equal(next.status, 0);
  const refreshed = JSON.parse(next.stdout);
  assert.ok(refreshed.scanned > 0, "a changed rule invalidates cached content");
  assert.ok(
    refreshed.batchUsedMs > prior.batchUsedMs,
    "a rule update cannot replenish this delivery allowance",
  );
  assert.equal(
    run(process.execPath, [nextScanner, "health"], { cwd: f.repo, env: f.env })
      .status,
    0,
  );
  add(f, secretContent);
  blocked(f.git("commit", "-m", "Synthetic update"), "API_TOKEN");
});

test("stdin module import never runs CLI or emits a raw filesystem error", () => {
  const moduleFile = path.join(source, "confidentiality-scan.mjs");
  const result = run(process.execPath, ["--input-type=module", "-"], {
    input:
      "await import(" +
      JSON.stringify(moduleFile) +
      "); console.log('IMPORT_OK');",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "IMPORT_OK");
  assert.equal(result.stderr, "");
});

test("installer refuses nonexecutable hooks for idempotent and update operations", (t) => {
  const f = fixture(t);
  const hooks = f.good("config", "--local", "--get", "core.hooksPath");
  for (const file of ["pre-commit", "commit-msg", "pre-push"])
    chmodSync(path.join(hooks, file), 0o600);
  blocked(f.install(), "HOOK_NOT_EXECUTABLE");
  blocked(f.install("--update"), "HOOK_NOT_EXECUTABLE");
  blocked(f.scan("health"), "HOOK_NOT_EXECUTABLE");
});

test("all hooks fail safely when PATH contains no runtime utilities", (t) => {
  const f = fixture(t);
  const hooks = f.good("config", "--local", "--get", "core.hooksPath");
  const emptyPath = path.join(f.dir, "empty-bin");
  mkdirSync(emptyPath);
  for (const file of ["pre-commit", "commit-msg", "pre-push"]) {
    const result = run("/bin/sh", [path.join(hooks, file)], {
      cwd: f.repo,
      env: { ...f.env, PATH: emptyPath },
    });
    blocked(result, "HOOK_RUNTIME_MISSING");
    assert.equal(result.stderr, "");
    assert.ok(!result.stdout.includes(f.dir));
  }
});
test("missing promisor blob remains missing and inspection cannot lazy fetch", (t) => {
  const f = fixture(t, false);
  assert.equal(
    run(
      "git",
      ["--git-dir", f.remote, "config", "uploadpack.allowFilter", "true"],
      { env: f.env },
    ).status,
    0,
  );
  const oid = f.good("rev-parse", "HEAD:safe.txt");
  const partial = path.join(f.dir, "partial-clone");
  const clone = run(
    "git",
    [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      pathToFileURL(f.remote).href,
      partial,
    ],
    { env: f.env },
  );
  assert.equal(clone.status, 0, "synthetic filtered clone must succeed");
  const present = () =>
    run("git", ["--no-lazy-fetch", "cat-file", "-e", oid], {
      cwd: partial,
      env: f.env,
    }).status === 0;
  assert.equal(present(), false, "synthetic blob must initially be missing");
  const program =
    "const {git}=await import(" +
    JSON.stringify(path.join(source, "confidentiality-scan.mjs")) +
    "); try {git(['cat-file','-s'," +
    JSON.stringify(oid) +
    "]); console.log('UNEXPECTED_PASS');} catch {console.log('EXPECTED_STOP');process.exitCode=1;}";
  const result = run(process.execPath, ["--input-type=module", "-"], {
    cwd: partial,
    env: f.env,
    input: program,
  });
  blocked(result, "EXPECTED_STOP");
  assert.equal(result.stderr, "");
  assert.equal(
    present(),
    false,
    "inspection must not materialize the missing object",
  );
});

test("pre-push input rejects invalid UTF-8 ref names before remote access", (t) => {
  const f = fixture(t);
  const head = f.good("rev-parse", "HEAD");
  for (const location of ["local", "remote"]) {
    const local =
      location === "local" ? Buffer.from([0x80]) : Buffer.from("main");
    const remote =
      location === "remote" ? Buffer.from([0x81]) : Buffer.from("new");
    const input = Buffer.concat([
      Buffer.from("refs/heads/"),
      local,
      Buffer.from(" " + head + " refs/heads/"),
      remote,
      Buffer.from(" " + "0".repeat(40) + "\n"),
    ]);
    const result = run(
      process.execPath,
      [
        path.join(source, "confidentiality-scan.mjs"),
        "push",
        "origin",
        f.remote,
      ],
      { cwd: f.repo, env: f.env, input },
    );
    blocked(result, "PUSH_INPUT_UNDETERMINED");
    assert.equal(result.stderr, "");
  }
});
