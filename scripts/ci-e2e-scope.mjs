import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Only known documentation can omit browser checks. Every runtime/unknown or
// mixed change runs daily smoke; full coverage is explicitly dispatched.
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
  return "smoke";
};

export const classifyE2eScope = (paths, eventName = "pull_request") => {
  if (eventName === "workflow_dispatch") return "full";
  if (
    !["pull_request", "push"].includes(eventName) ||
    !Array.isArray(paths) ||
    paths.length === 0 ||
    !paths.every(validPath)
  )
    throw new Error("Cannot classify daily browser scope");
  const scopes = new Set(paths.map(scopeForPath));
  return scopes.size === 1 ? [...scopes][0] : "smoke";
};

export const classifyGitDiff = (
  eventName,
  base,
  head,
  runGit = (...args) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
) => {
  if (eventName === "workflow_dispatch") return "full";
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
      throw new Error("Invalid event or comparison SHA");
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
    if (typeof output !== "string" || !output.endsWith("\0"))
      throw new Error("Missing NUL-delimited changed paths");
    return classifyE2eScope(output.slice(0, -1).split("\0"), eventName);
  } catch (error) {
    throw new Error(
      "Changed-path comparison failed; daily acceptance cannot pass",
      { cause: error },
    );
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
