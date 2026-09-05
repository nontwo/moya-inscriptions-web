import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// A small allowlist, not a dependency graph. Everything unlisted is full.
const documentation = new Set([
  "AGENTS.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "LICENSE",
  "LICENSE-DATA",
  "NOTICE",
  ".github/pull_request_template.md",
  "docs/architecture.md",
  "docs/module-ownership.md",
  "docs/project-status.md",
]);
const validPath = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  !/[\\\s\x00-\x1f]/u.test(value) &&
  !value.startsWith("/") &&
  value
    .split("/")
    .every((part) => part !== "." && part !== ".." && part !== "");

const scopeForPath = (file) => {
  if (
    documentation.has(file) ||
    /^docs\/governance\/(?:[\w-]+\/)*[\w-]+\.md$/u.test(file)
  )
    return "none";
  // Importer-only implementation and backend-only tests are not browser inputs.
  // Their manifests/configuration and shared runtime packages are deliberately excluded.
  if (
    /^(?:services\/catalog-importer\/src\/|tests\/unit\/backend\/|tests\/integration\/postgres\/).+\.ts$/u.test(
      file,
    )
  )
    return "smoke";
  return "full";
};

export const classifyE2eScope = (paths, eventName = "pull_request") => {
  if (
    !["pull_request", "push"].includes(eventName) ||
    !Array.isArray(paths) ||
    paths.length === 0 ||
    !paths.every(validPath)
  )
    return "full";
  const scopes = new Set(paths.map(scopeForPath));
  return scopes.size === 1 ? [...scopes][0] : "full";
};

export const classifyGitDiff = (
  eventName,
  base,
  head,
  runGit = (...args) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
) => {
  try {
    if (
      !["pull_request", "push"].includes(eventName) ||
      ![base, head].every(
        (sha) =>
          typeof sha === "string" &&
          /^[a-f0-9]{40}$/u.test(sha) &&
          !/^0+$/u.test(sha),
      )
    )
      return "full";
    // PRs compare the merge base; main pushes compare the entire before..after span.
    const range =
      eventName === "pull_request" ? `${base}...${head}` : `${base}..${head}`;
    const output = runGit(
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      range,
      "--",
    );
    if (typeof output !== "string" || !output.endsWith("\0")) return "full";
    return classifyE2eScope(output.slice(0, -1).split("\0"), eventName);
  } catch {
    return "full";
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.stdout.write(
    `${classifyGitDiff(process.env.EVENT_NAME, process.env.BASE_SHA, process.env.HEAD_SHA)}\n`,
  );
}
