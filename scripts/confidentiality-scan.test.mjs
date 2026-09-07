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
import { categories, inspect } from "./confidentiality-scan.mjs";

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
  for (const value of [token, rejectedEmail, privatePath, address, signedUrl])
    assert.ok(
      !(result.stdout + result.stderr).includes(value),
      "diagnostics must suppress synthetic sensitive values",
    );
}
function add(f, content, filename = "fixture.txt") {
  writeFileSync(path.join(f.repo, filename), content);
  f.good("add", "--", filename);
}

test("explicit placeholders, documentation IPs and reserved email examples pass", () => {
  assert.deepEqual(
    categories(
      [
        "TOKEN=EXAMPLE_ONLY",
        "PASSWORD=<PLACEHOLDER>",
        "https://example.invalid/image?q-signature=PLACEHOLDER",
        "203.0.113.10",
        "2001:db8::10",
        "example@example.com",
        "127.0.0.1",
      ].join("\n"),
    ),
    [],
  );
});
test("credential, address, personal path/email and signed URL categories are redacted", () => {
  for (const [value, category] of [
    [token, "CREDENTIAL_SHAPE"],
    [privatePath, "PRIVATE_LOCAL_PATH"],
    [address, "DEPLOYMENT_ADDRESS"],
    [rejectedEmail, "PERSONAL_EMAIL"],
    [signedUrl, "SIGNED_OR_TOKEN_URL"],
  ]) {
    const result = inspect(Buffer.from(value), "fixture.txt");
    assert.ok(result.some((item) => item.category === category));
    assert.ok(!JSON.stringify(result).includes(value));
  }
});
test("quoted and dotenv secrets block while code expressions pass", () => {
  assert.ok(
    categories("pass" + 'word: "' + "opaque-credential-value" + '"').includes(
      "SECRET_LITERAL",
    ),
  );
  assert.ok(
    categories("SECRET_" + "KEY=" + "opaqueCredentialValue123").includes(
      "SECRET_LITERAL",
    ),
  );
  assert.deepEqual(
    inspect(
      Buffer.from("const " + "pass" + "word = process.env.PASSWORD;"),
      "fixture.mjs",
    ),
    [],
  );
});
test("binary, oversize and LFS pointer carriers fail closed", () => {
  assert.equal(
    inspect(Buffer.from([0, 255]))[0].category,
    "UNINSPECTABLE_BINARY",
  );
  assert.equal(
    inspect(Buffer.alloc(8 * 1024 * 1024 + 1))[0].category,
    "INPUT_TOO_LARGE",
  );
  const pointer = [
    "version https://git-lfs.github.com/spec/",
    "v1\noid sha256:",
    "0".repeat(64),
    "\nsize 2\n",
  ].join("");
  assert.ok(
    inspect(Buffer.from(pointer)).some(
      (item) => item.category === "UNINSPECTABLE_LFS",
    ),
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
  blocked(f.git("commit", "-m", "Synthetic update"), "CREDENTIAL_SHAPE");
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
  blocked(f.git("commit", "-m", "Synthetic update"), "CREDENTIAL_SHAPE");
});
test("actual commit-msg blocks complete message and trailers", (t) => {
  const f = fixture(t);
  add(f, "Safe bytes.\n");
  blocked(
    f.git(
      "commit",
      "-m",
      "Synthetic title\n\nCo-authored-by: Synthetic <" + rejectedEmail + ">",
    ),
    "PERSONAL_EMAIL",
  );
  blocked(
    f.git("commit", "-m", "Synthetic title\n\n" + token),
    "CREDENTIAL_SHAPE",
  );
});
test("effective author and committer overrides fail closed", (t) => {
  const f = fixture(t);
  add(f, "Safe bytes.\n");
  for (const field of ["AUTHOR", "COMMITTER"]) {
    blocked(
      run("git", ["commit", "-m", "Synthetic update"], {
        cwd: f.repo,
        env: { ...f.env, ["GIT_" + field + "_EMAIL"]: rejectedEmail },
      }),
      "IDENTITY_NOT_APPROVED",
    );
  }
});
test("sensitive filename cannot leak through scanner diagnostics", (t) => {
  const f = fixture(t);
  add(f, "Safe bytes.\n", rejectedEmail + ".txt");
  blocked(f.scan("staged"), "PERSONAL_EMAIL");
  assert.ok(f.scan("staged").stdout.includes("[redacted-path]"));
});
test("staged binary and symlink are blocked", (t) => {
  const f = fixture(t);
  add(f, Buffer.from([0, 255]));
  blocked(f.scan("staged"), "UNINSPECTABLE_BINARY");
  f.good("reset", "--", "fixture.txt");
  const oid = f.good("hash-object", "-w", "--stdin");
  f.good(
    "update-index",
    "--add",
    "--cacheinfo",
    "120000," + oid + ",synthetic-link",
  );
  blocked(f.scan("staged"), "GIT_OBJECT_UNINSPECTABLE");
});
test("exact outbound files block signed links and binary, allow placeholders", (t) => {
  const f = fixture(t);
  const outgoing = path.join(f.dir, "outbound.txt");
  writeFileSync(outgoing, signedUrl);
  blocked(f.scan("outbound", outgoing), "SIGNED_OR_TOKEN_URL");
  writeFileSync(outgoing, Buffer.from([0, 255]));
  blocked(f.scan("outbound", outgoing), "UNINSPECTABLE_BINARY");
  writeFileSync(
    outgoing,
    "Synthetic announcement with https://example.invalid/ and TOKEN=PLACEHOLDER\n",
  );
  assert.equal(f.scan("outbound", outgoing).status, 0);
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
    "CREDENTIAL_SHAPE",
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
  blocked(f.git("push", "origin", "synthetic-new"), "CREDENTIAL_SHAPE");
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
  blocked(f.git("push", "origin", "main"), "CREDENTIAL_SHAPE");
});
test("outgoing commit identity and full metadata are checked", (t) => {
  const f = fixture(t, false);
  add(f, "Safe content.\n");
  assert.equal(
    run("git", ["commit", "-m", "Synthetic metadata"], {
      cwd: f.repo,
      env: { ...f.env, GIT_AUTHOR_EMAIL: rejectedEmail },
    }).status,
    0,
  );
  assert.equal(f.install().status, 0);
  blocked(f.git("push", "origin", "main"), "IDENTITY_NOT_APPROVED");
});
test("annotated tag message is scanned even when target already remote", (t) => {
  const f = fixture(t);
  f.good("tag", "-a", "synthetic-tag", "-m", "Synthetic tag " + token);
  blocked(f.git("push", "origin", "synthetic-tag"), "CREDENTIAL_SHAPE");
});
test("annotated tagger must be the approved identity", (t) => {
  const f = fixture(t);
  assert.equal(
    run("git", ["tag", "-a", "synthetic-tagger", "-m", "Synthetic tag"], {
      cwd: f.repo,
      env: { ...f.env, GIT_COMMITTER_EMAIL: rejectedEmail },
    }).status,
    0,
  );
  blocked(f.git("push", "origin", "synthetic-tagger"), "IDENTITY_NOT_APPROVED");
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
  blocked(result, "GIT_OPERATION_UNVERIFIABLE");
  assert.equal(result.stderr, "");
  assert.ok(!result.stdout.includes(f.dir));
});
test("advertised remote object absent locally blocks new ref rather than skipping", (t) => {
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
  blocked(
    f.git("push", "origin", "synthetic-local"),
    "GIT_OPERATION_UNVERIFIABLE",
  );
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
  blocked(f.git("push", "origin", "main"), "CREDENTIAL_SHAPE");
});

test("bare secret literals have no generic identifier exemption", () => {
  for (const key of ["PASSWORD", "COS_SECRET_KEY", "password"]) {
    assert.ok(
      categories(key + "=" + "syntheticOpaqueCredential123").includes(
        "SECRET_LITERAL",
      ),
    );
  }
});
test("placeholder directory cannot mask a private home prefix", () => {
  for (const suffix of ["/EXAMPLE/input", "/{placeholder}/input"]) {
    assert.ok(categories(privatePath + suffix).includes("PRIVATE_LOCAL_PATH"));
  }
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
  blocked(f.scan("staged"), "GIT_TEXT_UNINSPECTABLE");
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
test("custom local transport helpers are blocked before invocation", (t) => {
  const f = fixture(t);
  const head = f.good("rev-parse", "HEAD");
  for (const key of [
    "credential.helper",
    "core.sshCommand",
    "remote.synthetic.vcs",
  ]) {
    f.good("config", key, "synthetic-helper-must-not-run");
    const result = run(
      process.execPath,
      [
        path.join(source, "confidentiality-scan.mjs"),
        "push",
        "origin",
        f.remote,
      ],
      {
        cwd: f.repo,
        env: f.env,
        input:
          "refs/heads/main " +
          head +
          " refs/heads/new " +
          "0".repeat(40) +
          "\n",
      },
    );
    blocked(result, "LOCAL_TRANSPORT_HELPER_REQUIRES_REVIEW");
    f.good("config", "--unset", key);
  }
});

test("ASCII PDF and unknown attachments are not treated as verified text", () => {
  assert.ok(
    inspect(
      Buffer.from(["%PDF", "-1.4\n1 0 obj\nendobj\n%%EOF"].join("")),
      "attachment.txt",
    ).some((item) => item.category === "OPAQUE_ARTIFACT"),
  );
  assert.ok(
    inspect(Buffer.from("Synthetic opaque attachment."), "attachment.har").some(
      (item) => item.category === "UNCLASSIFIED_ARTIFACT",
    ),
  );
  const result = inspect(
    Buffer.from([0, 255]),
    "Synthetic-Person-Private-Photo.png",
  );
  assert.ok(result.every((item) => item.path === "[redacted-path]"));
});
test("URL rewrite to explicitly enabled ext transport cannot invoke helper", (t) => {
  const f = fixture(t);
  const marker = path.join(f.dir, "transport-ran");
  const helper = path.join(f.dir, "transport-helper");
  writeFileSync(helper, '#!/bin/sh\nprintf x > "' + marker + '"\n');
  chmodSync(helper, 0o700);
  f.good("config", "protocol.ext.allow", "always");
  f.good(
    "config",
    "url.ext::" + helper + ".insteadOf",
    "https://example.invalid/",
  );
  const head = f.good("rev-parse", "HEAD");
  const result = run(
    process.execPath,
    [
      path.join(source, "confidentiality-scan.mjs"),
      "push",
      "synthetic",
      "https://example.invalid/repo",
    ],
    {
      cwd: f.repo,
      env: f.env,
      input:
        "refs/heads/main " + head + " refs/heads/new " + "0".repeat(40) + "\n",
    },
  );
  blocked(result, "GIT_OPERATION_UNVERIFIABLE");
  assert.equal(existsSync(marker), false);
});

test("controlled update preserves shared directory and requires explicit update", (t) => {
  const f = fixture(t);
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
  assert.equal(
    run(process.execPath, [nextScanner, "health"], { cwd: f.repo, env: f.env })
      .status,
    0,
  );
  add(f, secretContent);
  blocked(f.git("commit", "-m", "Synthetic update"), "CREDENTIAL_SHAPE");
});

test("local frozen identity drift fails health even with unchanged installed files", (t) => {
  const f = fixture(t);
  f.good(
    "config",
    "--local",
    "confidentiality.approvedName",
    "Another Synthetic Developer",
  );
  blocked(f.scan("health"), "IDENTITY_POLICY_CHANGED");
  f.good("config", "--local", "user.name", "Another Synthetic Developer");
  blocked(f.install("--update"), "IDENTITY_POLICY_CONFLICT");
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

test("dotted bare credentials in configuration, prose and outbound metadata block", () => {
  const dottedValue = ["fictionalCredential", "component", "suffix"].join(".");
  for (const filename of [
    ".env",
    "runtime.env",
    "README.md",
    "payload.txt",
    "[commit-message]",
    "[commit-metadata]",
    "[tag-metadata]",
  ]) {
    for (const key of ["PASSWORD", "COS_SECRET_KEY", "ACCESS_TOKEN"]) {
      const bytes = Buffer.from(key + "=" + dottedValue);
      assert.ok(
        inspect(bytes, filename).some(
          (item) => item.category === "SECRET_LITERAL",
        ),
      );
    }
  }
});
test("only explicit declarations in JavaScript code receive reference exemption", () => {
  const declaration = "const " + "pass" + "word = process.env.PASSWORD;";
  assert.deepEqual(inspect(Buffer.from(declaration), "fixture.mjs"), []);
  assert.ok(
    inspect(Buffer.from(declaration), "README.md").some(
      (item) => item.category === "SECRET_LITERAL",
    ),
  );
  for (const wrapper of [
    (value) => "`\n" + value + "\n`",
    (value) => "/*\n" + value + "\n*/",
    (value) => "// " + value,
  ]) {
    assert.ok(
      inspect(Buffer.from(wrapper(declaration)), "fixture.mjs").some(
        (item) => item.category === "SECRET_LITERAL",
      ),
    );
  }
  const bare = "PASSWORD" + "=" + ["fictionalCredential", "suffix"].join(".");
  assert.ok(
    inspect(Buffer.from(bare), "fixture.mjs").some(
      (item) => item.category === "SECRET_LITERAL",
    ),
  );
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
test("conditional Git config is rejected before shared hooks installation", (t) => {
  const f = fixture(t, false);
  const conditional = path.join(f.dir, "conditional-config");
  writeFileSync(conditional, "[core]\n hooksPath = synthetic-other-hooks\n");
  f.good(
    "config",
    "--local",
    "includeIf.onbranch:synthetic-sibling.path",
    conditional,
  );
  blocked(f.install(), "CONDITIONAL_GIT_CONFIG_REQUIRES_REVIEW");
  assert.equal(f.git("config", "--local", "--get", "core.hooksPath").status, 1);
  const sibling = path.join(f.dir, "conditional-sibling");
  f.good("worktree", "add", "-b", "synthetic-sibling", sibling, "main");
  const other = run(
    process.execPath,
    [
      path.join(source, "install-confidentiality-hooks.mjs"),
      "--confirm-current-identity-approved",
    ],
    { cwd: sibling, env: f.env },
  );
  blocked(other, "CONDITIONAL_GIT_CONFIG_REQUIRES_REVIEW");
  assert.equal(
    readFileSync(conditional, "utf8"),
    "[core]\n hooksPath = synthetic-other-hooks\n",
  );
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

test("actual commit rejects command-config committer override with approved author", (t) => {
  const f = fixture(t);
  add(f, "Safe synthetic bytes.\n");
  const before = f.good("rev-parse", "HEAD");
  const result = f.git(
    "-c",
    "user.email=" + rejectedEmail,
    "commit",
    "--author=" + approvedName + " <" + approvedEmail + ">",
    "-m",
    "Synthetic identity override",
  );
  blocked(result, "IDENTITY_NOT_APPROVED");
  assert.equal(f.good("rev-parse", "HEAD"), before);
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
    blocked(result, "PUSH_INPUT_INVALID");
    assert.equal(result.stderr, "");
  }
});

test("repository-local include cannot hide a transport helper from pre-push", (t) => {
  const f = fixture(t);
  const included = path.join(f.dir, "included-config");
  writeFileSync(
    included,
    "[credential]\n helper = !synthetic-helper-must-not-run\n",
  );
  f.good("config", "--local", "include.path", included);
  const head = f.good("rev-parse", "HEAD");
  const result = run(
    process.execPath,
    [path.join(source, "confidentiality-scan.mjs"), "push", "origin", f.remote],
    {
      cwd: f.repo,
      env: f.env,
      input:
        "refs/heads/main " + head + " refs/heads/new " + "0".repeat(40) + "\n",
    },
  );
  blocked(result, "LOCAL_TRANSPORT_HELPER_REQUIRES_REVIEW");
  assert.equal(result.stderr, "");
});

test("enabled empty worktree configuration permits installation and sibling health", (t) => {
  const f = fixture(t, false);
  f.good("config", "extensions.worktreeConfig", "true");
  const sibling = path.join(f.dir, "empty-config-sibling");
  f.good("worktree", "add", "-b", "synthetic-empty-config", sibling, "main");
  assert.equal(f.install().status, 0);
  assert.equal(f.scan("health").status, 0);
  const siblingHealth = run(
    process.execPath,
    [path.join(source, "confidentiality-scan.mjs"), "health"],
    { cwd: sibling, env: f.env },
  );
  assert.equal(siblingHealth.status, 0);
  assert.equal(f.good("config", "--get", "extensions.worktreeConfig"), "true");
  writeFileSync(path.join(f.repo, ".git", "config.worktree"), "");
  blocked(f.scan("health"), "WORKTREE_CONFIG_REQUIRES_REVIEW");
  blocked(f.install("--update"), "WORKTREE_CONFIG_REQUIRES_REVIEW");
});
test("existing sibling worktree configuration blocks installation without reading it", (t) => {
  const f = fixture(t, false);
  f.good("config", "extensions.worktreeConfig", "true");
  const sibling = path.join(f.dir, "configured-sibling");
  f.good("worktree", "add", "-b", "synthetic-configured", sibling, "main");
  const admin = run("git", ["rev-parse", "--absolute-git-dir"], {
    cwd: sibling,
    env: f.env,
  }).stdout.trim();
  const configFile = path.join(admin, "config.worktree");
  writeFileSync(configFile, "");
  blocked(f.install(), "WORKTREE_CONFIG_REQUIRES_REVIEW");
  assert.equal(f.git("config", "--local", "--get", "core.hooksPath").status, 1);
  assert.equal(readFileSync(configFile, "utf8"), "");
});
test("dangling worktree configuration links block install and health", (t) => {
  const f = fixture(t);
  f.good("config", "extensions.worktreeConfig", "true");
  const configFile = path.join(f.repo, ".git", "config.worktree");
  symlinkSync(path.join(f.dir, "absent-config"), configFile);
  blocked(f.scan("health"), "WORKTREE_CONFIG_REQUIRES_REVIEW");
  blocked(f.install(), "WORKTREE_CONFIG_REQUIRES_REVIEW");
});
test("unverifiable linked admin directory objects block install and health", (t) => {
  const f = fixture(t);
  f.good("config", "extensions.worktreeConfig", "true");
  const linked = path.join(f.repo, ".git", "worktrees");
  const elsewhere = path.join(f.dir, "synthetic-admin-root");
  mkdirSync(elsewhere);
  symlinkSync(elsewhere, linked);
  blocked(f.scan("health"), "WORKTREE_ADMIN_UNVERIFIABLE");
  blocked(f.install(), "WORKTREE_ADMIN_UNVERIFIABLE");
  rmSync(linked);
  mkdirSync(linked);
  symlinkSync(elsewhere, path.join(linked, "synthetic-admin"));
  blocked(f.scan("health"), "WORKTREE_ADMIN_UNVERIFIABLE");
  blocked(f.install(), "WORKTREE_ADMIN_UNVERIFIABLE");
});
