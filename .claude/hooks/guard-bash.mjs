/**
 * Claude Code PreToolUse guard for Bash commands — the narrow remainder.
 *
 * The permission rules in .claude/settings.json are the primary control:
 * Claude Code matches them per subcommand, including inside `&&` chains,
 * subshells, command substitutions and loops, so force pushes, pushes to
 * main, history rewrites, worktree removal, `--no-verify`, repository settings
 * and volume deletion are denied there, and Ready/merge/creation operations
 * ask for confirmation there. This hook covers only two shapes those rules
 * cannot express, and it looks at how a program is invoked, never at quoted
 * text, search patterns or printed examples:
 *
 * 1. a PostgreSQL client (`psql`, `pgcli`) pointed at the live Development
 *    database `yoyi_dev` together with destructive SQL on its command line;
 * 2. `git` run with leading `-C`/`-c` options before `push`, the one spelling
 *    of a force push or push to main that a prefix rule does not see.
 *
 * It never allows anything: a command it does not recognise falls through to
 * the normal permission flow. It is not a sandbox and does not claim to cover
 * every possible spelling.
 *
 * Input: the hook JSON on stdin ({ tool_name, tool_input: { command } }).
 * Output: a PreToolUse deny decision on stdout, or nothing.
 */
import process from "node:process";
import { pathToFileURL } from "node:url";

const rules = [
  [
    // The program must start a command (line start or after a separator), so
    // the same words inside an echo, grep or printf argument never match.
    /(?:^|[;&|(`]\s*)(?:psql|pgcli)\b[^|;&\n]*\byoyi_dev\b[^|;&\n]*\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/iu,
    "yoyi_dev is the live Development database; never run destructive SQL against it",
  ],
  [
    /(?:^|[;&|(`]\s*)git\s+(?:-[Cc]\s+\S+\s+)+push\b[^|;&\n]*(?:--force(?:-with-lease)?\b|\s-f\b|\s(?:origin\s+)?(?:main|HEAD:main)(?:\s|$))/u,
    "force push or direct push to main is prohibited in every spelling",
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
