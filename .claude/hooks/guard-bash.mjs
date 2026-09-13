/**
 * Claude Code PreToolUse guard for Bash commands.
 *
 * Permission rules in .claude/settings.json already deny the usual spellings
 * of destructive Git, GitHub, container and database operations. Rules match
 * one subcommand at a time, so this hook re-checks the whole command text —
 * pipes, `&&` chains, subshells and loops included — for the same shapes and
 * denies them with the reason. It never allows anything: a command it does not
 * recognise falls through to the normal permission flow.
 *
 * Input: the hook JSON on stdin ({ tool_name, tool_input: { command } }).
 * Output: a PreToolUse deny decision on stdout, or nothing.
 */
import process from "node:process";
import { pathToFileURL } from "node:url";

const rules = [
  [
    /\bgit\s+push\b[^\n;&|]*(?:\s--force(?:-with-lease)?\b|\s-f\b|\s-[a-zA-Z]*f[a-zA-Z]*\b)/u,
    "force push is prohibited",
  ],
  [
    /\bgit\s+push\b[^\n;&|]*\s(?:origin\s+)?(?:main|HEAD:main|:main)(?:\s|$)/u,
    "direct push to main is prohibited; deliver through a PR",
  ],
  [
    /\bgit\s+(?:reset\s+--hard|clean\b|filter-branch\b|filter-repo\b)/u,
    "history rewrite or blanket cleanup is prohibited",
  ],
  [
    /\bgit\s+worktree\s+(?:remove|prune)\b/u,
    "worktree removal or pruning needs the Owner's explicit instruction",
  ],
  [
    /\bgit\s+branch\s+(?:-D|--delete\s+--force|-[a-zA-Z]*D)\b/u,
    "forced branch deletion is prohibited",
  ],
  [/\bgit\s+update-ref\s+-d\b/u, "reference deletion is prohibited"],
  [
    /\b(?:git\s+(?:commit|push)|gh\s+pr\s+create)\b[^\n;&|]*--no-verify\b/u,
    "hooks cannot be bypassed",
  ],
  [
    /\bgh\s+pr\s+(?:merge|ready)\b/u,
    "Ready transition and merge need the task's explicit delivery authorization",
  ],
  [
    /\bgh\s+(?:repo\s+(?:delete|edit|archive)|api\b[^\n;&|]*(?:-X|--method)\s*DELETE|api\b[^\n;&|]*rulesets|ruleset\b)/u,
    "repository settings, protections and deletions are outside this workflow",
  ],
  [
    /\bdocker\s+(?:compose\b[^\n;&|]*\bdown\b[^\n;&|]*(?:\s-v\b|\s--volumes\b)|volume\s+(?:rm|prune)\b|system\s+prune\b)/u,
    "deleting volumes or pruning containers destroys persistent data",
  ],
  [
    /\b(?:dropdb\b|DROP\s+DATABASE\b)/iu,
    "dropping a database is outside this workflow",
  ],
  [
    /\byoyi_dev\b[^\n]*\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b|\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b[^\n]*\byoyi_dev\b/iu,
    "yoyi_dev is the live Development database; never treat it as test data",
  ],
  [
    /\brm\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*r[a-zA-Z]*\s+(?:-[a-zA-Z]+\s+)*(?:"?(?:\/|~|\$HOME|\$\{HOME\}|\.\.|\.git|\*)(?:\/[^\s"]*)?"?(?:\s|$)|"?\.(?:\s|$)|[^\s]*(?:worktrees|artifacts|_migration)[^\s]*)/u,
    "recursive deletion of repositories, worktrees, artifacts or the home directory is prohibited",
  ],
];

export function guardDecision(command) {
  if (typeof command !== "string" || command.trim() === "") return null;
  for (const [pattern, reason] of rules) {
    if (pattern.test(command)) return reason;
  }
  return null;
}

export function hookOutput(input) {
  const command =
    input?.tool_name === "Bash" ? input?.tool_input?.command : undefined;
  const reason = guardDecision(command);
  if (reason === null || reason === undefined) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `yoyi guard: ${reason}. Ask the Owner for the exact operation instead.`,
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      // Unreadable input: no decision, normal permission flow applies.
      process.exit(0);
    }
    const output = hookOutput(input);
    if (output) process.stdout.write(JSON.stringify(output));
    process.exit(0);
  });
}
