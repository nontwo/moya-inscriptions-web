#!/usr/bin/env node
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  digest,
  git,
  INSTALL_DIR,
  INSTALLED_FILES,
  isEntryPoint,
  rejectConditionalConfig,
  rejectWorktreeConfig,
  Stop,
  VERSION,
} from "./confidentiality-scan.mjs";

function optional(args) {
  const result = spawnSync("git", ["config", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 1) return "";
  if (result.error || result.status !== 0)
    throw new Stop("CONFIG_UNVERIFIABLE");
  return result.stdout.trim();
}
function fileBytes(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024)
    throw new Stop("INSTALL_FILE_UNVERIFIABLE");
  return readFileSync(file);
}
function currentIdentity() {
  const name = optional(["--get", "user.name"]);
  const email = optional(["--get", "user.email"]);
  if (
    !name ||
    /[\r\n<>]/.test(name + email) ||
    !/^[A-Za-z0-9+._-]+@users\.noreply\.github\.com$/.test(email) ||
    optional(["--get", "user.useConfigOnly"]) !== "true"
  )
    throw new Stop("APPROVED_ANONYMOUS_IDENTITY_REQUIRED");
  for (const variable of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
    const ident = git(["var", variable]).trim();
    if (!ident.startsWith(name + " <" + email + "> "))
      throw new Stop("IDENTITY_OVERRIDE_PRESENT");
  }
  return { name, email };
}
function verifyExisting(directory, manifestSha) {
  if (
    lstatSync(directory).isSymbolicLink() ||
    !lstatSync(directory).isDirectory()
  )
    throw new Stop("INSTALL_DIRECTORY_CONFLICT");
  const bytes = fileBytes(path.join(directory, "manifest.json"));
  if (!manifestSha || digest(bytes) !== manifestSha)
    throw new Stop("INSTALL_MANIFEST_CHANGED");
  const manifest = JSON.parse(bytes);
  if (
    manifest.version !== VERSION ||
    JSON.stringify(Object.keys(manifest.files).sort()) !==
      JSON.stringify([...INSTALLED_FILES].sort()) ||
    readdirSync(directory).sort().join("\0") !==
      [...INSTALLED_FILES, "manifest.json"].sort().join("\0")
  )
    throw new Stop("INSTALL_CONTENT_CONFLICT");
  for (const file of INSTALLED_FILES) {
    const installedFile = path.join(directory, file);
    if (digest(fileBytes(installedFile)) !== manifest.files[file])
      throw new Stop("INSTALLED_FILE_CHANGED");
    if (
      file !== "confidentiality-scan.mjs" &&
      !(lstatSync(installedFile).mode & 0o111)
    )
      throw new Stop("HOOK_NOT_EXECUTABLE");
  }
  return bytes;
}
export function install(args) {
  if (
    args.some(
      (arg) =>
        !["--confirm-current-identity-approved", "--update"].includes(arg),
    )
  )
    throw new Stop("INSTALL_ARGUMENT_INVALID");
  const update = args.includes("--update");
  rejectConditionalConfig();
  const sourceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const common = realpathSync(
    git(["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim(),
  );
  const directory = path.join(common, INSTALL_DIR);
  const localHooks = optional(["--local", "--get", "core.hooksPath"]);
  const effectiveHooks = optional(["--get", "core.hooksPath"]);
  // An enabled extension without any configuration files does not change
  // worktree resolution. Every actual file or unverifiable admin still stops.
  rejectWorktreeConfig(common);
  if (
    (effectiveHooks && effectiveHooks !== directory) ||
    (localHooks && localHooks !== directory)
  )
    throw new Stop("EXISTING_HOOKS_PATH_CONFLICT");
  const defaultHooks = path.join(common, "hooks");
  if (existsSync(defaultHooks)) {
    if (lstatSync(defaultHooks).isSymbolicLink())
      throw new Stop("EXISTING_HOOKS_CONFLICT");
    if (readdirSync(defaultHooks).some((file) => !file.endsWith(".sample")))
      throw new Stop("EXISTING_HOOKS_CONFLICT");
  }
  const approved = currentIdentity();
  const oldName = optional([
    "--local",
    "--get",
    "confidentiality.approvedName",
  ]);
  const oldEmail = optional([
    "--local",
    "--get",
    "confidentiality.approvedEmail",
  ]);
  if (oldName || oldEmail) {
    if (oldName !== approved.name || oldEmail !== approved.email)
      throw new Stop("IDENTITY_POLICY_CONFLICT");
  } else if (!args.includes("--confirm-current-identity-approved"))
    throw new Stop("IDENTITY_APPROVAL_ACK_REQUIRED");
  const files = {};
  for (const file of INSTALLED_FILES)
    files[file] = fileBytes(
      path.join(
        sourceRoot,
        file === "confidentiality-scan.mjs" ? "scripts" : ".githooks",
        file,
      ),
    );
  const manifestBytes = Buffer.from(
    JSON.stringify(
      {
        version: VERSION,
        identitySha256: digest(
          Buffer.from(approved.name + "\0" + approved.email),
        ),
        files: Object.fromEntries(
          INSTALLED_FILES.map((file) => [file, digest(files[file])]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  let oldManifest;
  if (existsSync(directory)) {
    if (localHooks !== directory || effectiveHooks !== directory)
      throw new Stop("UNMANAGED_INSTALL_DIRECTORY");
    oldManifest = verifyExisting(
      directory,
      optional(["--local", "--get", "confidentiality.manifestSha256"]),
    );
    if (
      JSON.parse(oldManifest).identitySha256 !==
      digest(Buffer.from(approved.name + "\0" + approved.email))
    )
      throw new Stop("IDENTITY_POLICY_CONFLICT");
    if (oldManifest.equals(manifestBytes))
      return {
        ok: true,
        version: VERSION,
        manifestSha256: digest(manifestBytes),
        changed: false,
      };
    if (!update) throw new Stop("EXPLICIT_CONTROLLED_UPDATE_REQUIRED");
  } else if (
    localHooks ||
    oldName ||
    oldEmail ||
    optional(["--local", "--get", "confidentiality.manifestSha256"])
  )
    throw new Stop("INCOMPLETE_INSTALL_REQUIRES_REVIEW");
  // Prepare before changing any config. On an unexpected failure retain the
  // managed directory: hooks then fail closed until the installation is repaired.
  const prepared = mkdtempSync(path.join(common, ".confidentiality-install-"));
  chmodSync(prepared, 0o700);
  let backup;
  try {
    for (const file of INSTALLED_FILES)
      writeFileSync(path.join(prepared, file), files[file], {
        mode: file === "confidentiality-scan.mjs" ? 0o600 : 0o700,
        flag: "wx",
      });
    writeFileSync(path.join(prepared, "manifest.json"), manifestBytes, {
      mode: 0o600,
      flag: "wx",
    });
    if (oldManifest) {
      backup = mkdtempSync(path.join(common, ".confidentiality-backup-"));
      chmodSync(backup, 0o700);
      for (const file of [...INSTALLED_FILES, "manifest.json"]) {
        copyFileSync(path.join(directory, file), path.join(backup, file));
      }
    }
    if (oldManifest) {
      // Keep the active hook directory present throughout an update. Atomic
      // file replacements make mixed versions fail health instead of letting
      // Git silently skip a temporarily absent hook directory.
      for (const file of [...INSTALLED_FILES, "manifest.json"]) {
        renameSync(path.join(prepared, file), path.join(directory, file));
      }
    } else {
      renameSync(prepared, directory);
    }
    git(["config", "--local", "core.hooksPath", directory]);
    git(["config", "--local", "confidentiality.approvedName", approved.name]);
    git(["config", "--local", "confidentiality.approvedEmail", approved.email]);
    git([
      "config",
      "--local",
      "confidentiality.manifestSha256",
      digest(manifestBytes),
    ]);
    if (backup) rmSync(backup, { recursive: true });
    return {
      ok: true,
      version: VERSION,
      manifestSha256: digest(manifestBytes),
      changed: true,
    };
  } finally {
    if (existsSync(prepared)) rmSync(prepared, { recursive: true });
  }
}
if (isEntryPoint(import.meta.url)) {
  try {
    console.log(JSON.stringify(install(process.argv.slice(2))));
  } catch (error) {
    console.log(
      JSON.stringify({
        ok: false,
        findings: [
          {
            path: ".",
            category:
              error instanceof Stop ? error.category : "INSTALL_UNVERIFIABLE",
          },
        ],
      }),
    );
    process.exitCode = 1;
  }
}
