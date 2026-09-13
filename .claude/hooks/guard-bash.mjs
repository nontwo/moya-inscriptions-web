/**
 * Claude Code PreToolUse guard for Bash commands.
 *
 * .claude/settings.json holds the native rules: allow for routine work, ask for
 * delivery and notable operations, deny for fixed leading spellings. Those
 * rules match command text with globs, so they cannot tell a flag from a quoted
 * commit message, and they miss flags written after operands or bundled with
 * other short options (`git push origin <branch> -f`, `git commit -nm <msg>`).
 * This hook covers exactly that gap. It splits the command the way the shell
 * does (quotes, escapes, heredocs, `$( )`, backticks, `bash -c`) and reads the
 * argument vector of each simple command:
 *
 * 1. `git … push`: force (`-f` in any short-option bundle, `--force…`, a `+`
 *    refspec), `--mirror`, `--prune`, `--all`, `--branches`, `--no-verify`, a
 *    destination of `main`, or a `HEAD`/implicit push while `main` is checked
 *    out → deny; remote branch deletion (`--delete`, `-d`, `:<branch>`),
 *    `--tags`, or a pushed ref that is only known at run time → ask;
 * 2. `git … commit` with `--no-verify` or `-n` in a short-option bundle → deny;
 * 3. `git -c core.hooksPath=…` (also `--config-env`, `GIT_CONFIG*`) → deny;
 * 4. `psql`/`pgcli` naming the live Development database `yoyi_dev` with DROP,
 *    TRUNCATE or DELETE FROM in its arguments, heredoc or piped input → deny.
 *
 * Commit messages, search patterns and printed examples are arguments, not
 * commands, so they never match. Allow rules and this hook are enabled together
 * (an allow rule never applies where the hook does not run), so a command an
 * allow rule would run without a prompt is always read here first. The hook
 * never allows; a command it does not recognise falls through to the native
 * rules, and one it cannot analyse (for example absurdly deep nesting) asks. It is not a sandbox: a SQL file, a shell alias, a Git alias or a
 * variable expanded at run time is not inspected.
 *
 * Input: the hook JSON on stdin ({ tool_name, tool_input: { command }, cwd }).
 * Output: a PreToolUse deny or ask decision on stdout, or nothing; exit 0.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Marks text that only exists at run time ($VAR, $( ), backticks).
const DYNAMIC = "\u0000";

const REASON = {
  force: "force pushes rewrite reviewed task history and are prohibited",
  main: "direct pushes to main are prohibited; main changes only through a reviewed PR",
  refs: "--all, --branches, --mirror and --prune push or delete refs beyond the task branch and are prohibited",
  hooks:
    "skipping the core-credential hooks (--no-verify, -n, core.hooksPath) is prohibited",
  devDatabase:
    "yoyi_dev is the live Development database; never run destructive SQL against it",
  deleteBranch:
    "deleting a remote branch closes its PR; confirm the exact branch",
  tags: "pushing tags publishes milestones; confirm the Owner asked for it",
  runtime:
    "the pushed ref or a git option is only known at run time; confirm it is not main and not a bypass",
  unanalysable: "the guard could not analyse this command",
  unknownBranch:
    "the pushed branch depends on the checkout after a directory change; confirm it is not main",
};

// ---------------------------------------------------------------------------
// Shell splitting

function newCommand() {
  return { words: [], data: [] };
}

/**
 * Splits shell source into pipelines of simple commands. `words` is the argv
 * after quote removal; `data` holds heredoc bodies and here-strings. Commands
 * inside `$( )`, `<( )` and backticks are added as their own pipelines.
 * Unterminated quotes or substitutions end at the end of the input.
 */
export function parseShell(source) {
  const pipelines = [];
  parseInto(source, 0, 0, pipelines);
  return pipelines;
}

function skipParameter(s, j) {
  if (s[j + 1] === "{") {
    const end = s.indexOf("}", j + 2);
    return end === -1 ? s.length : end + 1;
  }
  const name = /^[A-Za-z_][A-Za-z0-9_]*/u.exec(s.slice(j + 1));
  return j + 1 + (name ? name[0].length : 1);
}

function backtick(s, i, out, level) {
  let j = i + 1;
  let text = "";
  while (j < s.length && s[j] !== "`") {
    if (s[j] === "\\" && "`\\$".includes(s[j + 1] ?? "")) {
      text += s[j + 1];
      j += 2;
    } else {
      text += s[j];
      j += 1;
    }
  }
  parseInto(text, 0, level + 1, out, false);
  return Math.min(j + 1, s.length);
}

// `level` is the substitution depth; `closes` is true inside `$( )`, where an
// unmatched `)` ends the substitution.
function parseInto(s, start, level, out, closes = level > 0) {
  if (level > 64) throw new Error("nesting too deep");
  let i = start;
  let depth = 0;
  let pipeline = [];
  let command = newCommand();
  let word = null;
  let target = null; // "redirect" | "herestring" | { stripTabs } for a heredoc delimiter
  const heredocs = [];

  const endWord = () => {
    if (word === null) return;
    if (target === "herestring") command.data.push(word);
    else if (target !== null && target !== "redirect")
      heredocs.push({ delimiter: word, stripTabs: target.stripTabs, command });
    else if (target === null) command.words.push(word);
    target = null;
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (command.words.length > 0 || command.data.length > 0)
      pipeline.push(command);
    command = newCommand();
  };
  const endPipeline = () => {
    endCommand();
    if (pipeline.length > 0) out.push(pipeline);
    pipeline = [];
  };
  const readHeredocs = () => {
    for (const heredoc of heredocs.splice(0)) {
      const lines = [];
      while (i < s.length) {
        let end = s.indexOf("\n", i);
        if (end === -1) end = s.length;
        const line = s.slice(i, end);
        i = Math.min(end + 1, s.length);
        const bare = heredoc.stripTabs ? line.replace(/^\t+/u, "") : line;
        if (bare === heredoc.delimiter) break;
        lines.push(line);
      }
      heredoc.command.data.push(lines.join("\n"));
    }
  };
  const append = (text) => {
    word = (word ?? "") + text;
  };

  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === "\n") {
      endPipeline();
      i += 1;
      readHeredocs();
    } else if (c === " " || c === "\t" || c === "\r") {
      endWord();
      i += 1;
    } else if (c === "#" && word === null) {
      const end = s.indexOf("\n", i);
      i = end === -1 ? s.length : end;
    } else if (c === "\\") {
      if (next !== "\n") append(next ?? "");
      i += 2;
    } else if (c === "'") {
      let end = s.indexOf("'", i + 1);
      if (end === -1) end = s.length;
      append(s.slice(i + 1, end));
      i = end + 1;
    } else if (c === "$" && next === "'") {
      let j = i + 2;
      let text = "";
      while (j < s.length && s[j] !== "'") {
        if (s[j] === "\\") {
          // Escapes such as \x2d can spell a flag; treat them as unknown.
          text += s[j + 1] === "'" || s[j + 1] === "\\" ? s[j + 1] : DYNAMIC;
          j += 2;
        } else {
          text += s[j];
          j += 1;
        }
      }
      append(text);
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      let text = "";
      while (j < s.length && s[j] !== '"') {
        const d = s[j];
        if (d === "\\" && '"\\$`\n'.includes(s[j + 1] ?? "")) {
          if (s[j + 1] !== "\n") text += s[j + 1];
          j += 2;
        } else if (d === "$" && s[j + 1] === "(") {
          j = parseInto(s, j + 2, level + 1, out);
          text += DYNAMIC;
        } else if (d === "`") {
          j = backtick(s, j, out, level);
          text += DYNAMIC;
        } else if (d === "$" && /[A-Za-z_{0-9@*#?$!-]/u.test(s[j + 1] ?? "")) {
          j = skipParameter(s, j);
          text += DYNAMIC;
        } else {
          text += d;
          j += 1;
        }
      }
      append(text);
      i = j + 1;
    } else if (c === "$" && next === "(") {
      i = parseInto(s, i + 2, level + 1, out);
      append(DYNAMIC);
    } else if (c === "$" && /[A-Za-z_{0-9@*#?$!-]/u.test(next ?? "")) {
      i = skipParameter(s, i);
      append(DYNAMIC);
    } else if (c === "`") {
      i = backtick(s, i, out, level);
      append(DYNAMIC);
    } else if ((c === "<" || c === ">") && next === "(") {
      i = parseInto(s, i + 2, level + 1, out);
      append(DYNAMIC);
    } else if (c === ";") {
      endPipeline();
      i += 1;
    } else if (c === "&" && next === "&") {
      endPipeline();
      i += 2;
    } else if (c === "&" && next === ">") {
      endWord();
      target = "redirect";
      i += s[i + 2] === ">" ? 3 : 2;
    } else if (c === "&") {
      endPipeline();
      i += 1;
    } else if (c === "|" && next === "|") {
      endPipeline();
      i += 2;
    } else if (c === "|") {
      endCommand();
      i += next === "&" ? 2 : 1;
    } else if (c === "(") {
      endCommand();
      depth += 1;
      i += 1;
    } else if (c === ")") {
      if (closes && depth === 0) {
        endPipeline();
        return i + 1;
      }
      endCommand();
      depth = Math.max(0, depth - 1);
      i += 1;
    } else if (c === "<" || c === ">") {
      if (word !== null && /^\d+$/u.test(word)) word = null; // file descriptor
      endWord();
      if (s.startsWith("<<<", i)) {
        target = "herestring";
        i += 3;
      } else if (c === "<" && next === "<") {
        target = { stripTabs: s[i + 2] === "-" };
        i += s[i + 2] === "-" ? 3 : 2;
      } else {
        i += 1;
        if (">&|".includes(s[i] ?? "")) i += 1;
        const fd = /^(?:\d+|-)(?=[\s;&|)]|$)/u.exec(s.slice(i));
        if (s[i - 1] === "&" && fd) i += fd[0].length;
        else target = "redirect";
      }
    } else {
      append(c);
      i += 1;
    }
  }
  endPipeline();
  return s.length;
}

// ---------------------------------------------------------------------------
// Command analysis

const RESERVED = new Set(
  "! { } do done then else elif fi if while until time esac".split(" "),
);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/u;
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

/** Strips reserved words, assignments and transparent wrappers. */
function effectiveArgv(words) {
  const env = [];
  let k = 0;
  while (k < words.length) {
    const w = words[k];
    if (RESERVED.has(w)) k += 1;
    else if (ASSIGNMENT.test(w)) {
      env.push(w);
      k += 1;
    } else if (["command", "builtin", "exec", "nohup"].includes(w)) {
      k += 1;
      while (words[k]?.startsWith("-")) k += 1;
    } else if (w === "env") {
      k += 1;
      while (k < words.length && /^-|=/u.test(words[k])) {
        if (ASSIGNMENT.test(words[k])) env.push(words[k]);
        if (["-u", "-C", "-S"].includes(words[k])) k += 1;
        k += 1;
      }
    } else if (w === "nice") {
      k += words[k + 1] === "-n" ? 3 : /^-/u.test(words[k + 1] ?? "") ? 2 : 1;
    } else if (w === "timeout") {
      k += 1;
      while (words[k]?.startsWith("-")) {
        if (["-k", "-s", "--kill-after", "--signal"].includes(words[k])) k += 1;
        k += 1;
      }
      k += 1; // duration
    } else if (w === "xargs") {
      k += 1;
      while (words[k]?.startsWith("-")) {
        if (/^-[IiEedLlnPs]$/u.test(words[k])) k += 1;
        k += 1;
      }
    } else break;
  }
  return { env, argv: words.slice(k) };
}

/** Long option names including `no-` negations, resolved by unique prefix. */
function optionNames(names) {
  return names.flatMap((name) =>
    name.startsWith("no-") ? [name, name.slice(3)] : [name, `no-${name}`],
  );
}
function resolveLong(arg, names) {
  const name = arg.slice(2).split("=")[0];
  if (names.includes(name)) return name;
  const matches = names.filter((candidate) => candidate.startsWith(name));
  return matches.length === 1 ? matches[0] : null;
}

const PUSH_OPTIONS = optionNames(
  "all branches mirror delete tags follow-tags dry-run porcelain force force-with-lease force-if-includes recurse-submodules atomic verbose quiet progress prune no-verify set-upstream thin signed ipv4 ipv6 repo receive-pack exec push-option".split(
    " ",
  ),
);
const PUSH_WITH_VALUE = new Set(
  "repo receive-pack exec push-option recurse-submodules".split(" "),
);
const COMMIT_OPTIONS = optionNames(
  "quiet verbose file author date message reedit-message reuse-message fixup squash reset-author trailer signoff template edit cleanup status gpg-sign dry-run short branch ahead-behind porcelain long null amend no-post-rewrite untracked-files all include interactive patch only no-verify allow-empty allow-empty-message pathspec-from-file pathspec-file-nul".split(
    " ",
  ),
);
const COMMIT_WITH_VALUE = new Set(
  "file author date message reedit-message reuse-message fixup squash trailer template cleanup pathspec-from-file".split(
    " ",
  ),
);

const isMain = (ref) => ref.replace(/^refs\/heads\//u, "") === "main";

function defaultCurrentBranch(directory) {
  try {
    return (
      execFileSync(
        "git",
        ["-C", directory, "symbolic-ref", "--quiet", "--short", "HEAD"],
        {
          encoding: "utf8",
          timeout: 2_000,
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim() || null
    );
  } catch {
    return null; // detached HEAD or not a repository: git refuses the push itself
  }
}

function analyzePush(args, location, report) {
  const positional = [];
  let deleting = false;
  let explicitSet = false;
  for (let k = 0; k < args.length; k += 1) {
    const arg = args[k];
    if (arg === "--") {
      positional.push(...args.slice(k + 1));
      break;
    }
    if (arg.startsWith(DYNAMIC)) {
      report("ask", REASON.runtime);
    } else if (arg.startsWith("--")) {
      const name = resolveLong(arg, PUSH_OPTIONS);
      if (name !== null && PUSH_WITH_VALUE.has(name) && !arg.includes("="))
        k += 1;
      if (["force", "force-with-lease", "force-if-includes"].includes(name))
        report("deny", REASON.force);
      if (["all", "branches", "mirror", "prune"].includes(name))
        report("deny", REASON.refs);
      if (name === "no-verify") report("deny", REASON.hooks);
      if (name === "delete") deleting = true;
      if (name === "tags") report("ask", REASON.tags);
      if (["all", "branches", "mirror", "tags"].includes(name))
        explicitSet = true;
    } else if (arg.length > 1 && arg.startsWith("-")) {
      for (let p = 1; p < arg.length; p += 1) {
        if (arg[p] === "f") report("deny", REASON.force);
        if (arg[p] === "d") deleting = true;
        if (arg[p] === DYNAMIC) report("ask", REASON.runtime);
        if (arg[p] === "o") {
          if (p === arg.length - 1) k += 1;
          break;
        }
      }
    } else positional.push(arg);
  }

  const [remote, ...refspecs] = positional;
  if (remote?.includes(DYNAMIC)) report("ask", REASON.runtime);
  const current = () => {
    if (!location.known) return undefined;
    return location.currentBranch(location.directory);
  };
  const checkCurrent = () => {
    const branch = current();
    if (branch === undefined) report("ask", REASON.unknownBranch);
    else if (branch === "main") report("deny", REASON.main);
  };
  for (const refspec of refspecs) {
    if (refspec.includes(DYNAMIC)) {
      report("ask", REASON.runtime);
      continue;
    }
    let spec = refspec;
    if (spec.startsWith("+")) {
      report("deny", REASON.force);
      spec = spec.slice(1);
    }
    const colon = spec.indexOf(":");
    const source = colon === -1 ? spec : spec.slice(0, colon);
    const destination = colon === -1 ? spec : spec.slice(colon + 1);
    if (deleting || (colon !== -1 && source === "")) {
      report(
        isMain(destination) ? "deny" : "ask",
        REASON[isMain(destination) ? "main" : "deleteBranch"],
      );
    } else if (colon === -1 && (spec === "HEAD" || spec === "@")) {
      checkCurrent();
    } else if (isMain(destination)) {
      report("deny", REASON.main);
    }
  }
  if (refspecs.length === 0 && !explicitSet && !deleting) checkCurrent();
}

function analyzeCommit(args, report) {
  for (let k = 0; k < args.length; k += 1) {
    const arg = args[k];
    if (arg === "--") break;
    if (arg.startsWith(DYNAMIC)) {
      report("ask", REASON.runtime);
    } else if (arg.startsWith("--")) {
      const name = resolveLong(arg, COMMIT_OPTIONS);
      if (name === "no-verify") report("deny", REASON.hooks);
      if (name !== null && COMMIT_WITH_VALUE.has(name) && !arg.includes("="))
        k += 1;
    } else if (arg.length > 1 && arg.startsWith("-")) {
      for (let p = 1; p < arg.length; p += 1) {
        const flag = arg[p];
        if (flag === "n") report("deny", REASON.hooks);
        if (flag === DYNAMIC) report("ask", REASON.runtime);
        if ("mFcCt".includes(flag)) {
          if (p === arg.length - 1) k += 1; // the value is the next word
          break;
        }
        if ("Su".includes(flag)) break; // optional value attached to the flag
      }
    }
  }
}

const GIT_GLOBAL_WITH_VALUE = new Set(
  "-C -c --git-dir --work-tree --namespace --super-prefix --config-env".split(
    " ",
  ),
);

function analyzeGit(argv, env, context, report) {
  const location = {
    directory: context.cwd,
    known: typeof context.cwd === "string" && !context.changesDirectory,
    currentBranch: context.currentBranch,
  };
  if (env.some((a) => /^GIT_(?:DIR|WORK_TREE)=/u.test(a)))
    location.known = false;
  if (env.some((a) => /^GIT_CONFIG/u.test(a) && /hookspath/iu.test(a)))
    report("deny", REASON.hooks);
  let k = 1;
  while (k < argv.length && argv[k].startsWith("-")) {
    const [name, attached] = argv[k].startsWith("--")
      ? [
          argv[k].split("=")[0],
          argv[k].includes("=")
            ? argv[k].slice(argv[k].indexOf("=") + 1)
            : undefined,
        ]
      : [argv[k], undefined];
    let value = attached;
    if (value === undefined && GIT_GLOBAL_WITH_VALUE.has(name)) {
      k += 1;
      value = argv[k] ?? "";
    }
    if (
      (name === "-c" || name === "--config-env") &&
      /^core\.hookspath(?:=|$)/iu.test(value)
    )
      report("deny", REASON.hooks);
    if (name === "-C") {
      if (value.includes(DYNAMIC)) location.known = false;
      else if (location.directory !== undefined)
        location.directory = resolve(location.directory, value);
    }
    if (name === "--git-dir" || name === "--work-tree") location.known = false;
    k += 1;
  }
  if (argv[k] === "push") analyzePush(argv.slice(k + 1), location, report);
  if (argv[k] === "commit") analyzeCommit(argv.slice(k + 1), report);
}

function analyzeSource(source, context, report, depth) {
  if (depth > 4) return;
  const pipelines = parseShell(source);
  const commands = pipelines.flat();
  const changesDirectory = commands.some((command) =>
    ["cd", "pushd", "popd"].includes(effectiveArgv(command.words).argv[0]),
  );
  for (const pipeline of pipelines) {
    pipeline.forEach((command, index) => {
      const { env, argv } = effectiveArgv(command.words);
      if (argv.length === 0 || argv[0].includes(DYNAMIC)) return;
      const program = basename(argv[0]);
      if (program === "git")
        analyzeGit(argv, env, { ...context, changesDirectory }, report);
      if (program === "psql" || program === "pgcli") {
        // Only this client and the commands piping into it feed its input.
        const text = pipeline
          .slice(0, index + 1)
          .flatMap((c) => [...c.words, ...c.data])
          .join("\n");
        if (
          /\byoyi_dev\b/u.test(text) &&
          /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/iu.test(text)
        )
          report("deny", REASON.devDatabase);
      }
      if (SHELLS.has(program)) {
        const flag = argv.findIndex(
          (arg, i) => i > 0 && /^-[A-Za-z]*c[A-Za-z]*$/u.test(arg),
        );
        const inner = flag === -1 ? undefined : argv[flag + 1];
        if (inner !== undefined && !inner.includes(DYNAMIC))
          analyzeSource(
            inner,
            { ...context, cwd: changesDirectory ? undefined : context.cwd },
            report,
            depth + 1,
          );
      }
      if (program === "eval")
        analyzeSource(argv.slice(1).join(" "), context, report, depth + 1);
    });
  }
}

/**
 * Returns `{ decision: "deny" | "ask", reason }` or null. `cwd` is the hook
 * input's working directory; `currentBranch` is injectable for tests.
 */
export function guardDecision(
  command,
  { cwd, currentBranch = defaultCurrentBranch } = {},
) {
  if (typeof command !== "string" || command.trim() === "") return null;
  const findings = [];
  try {
    analyzeSource(
      command,
      { cwd, currentBranch },
      (decision, reason) => findings.push({ decision, reason }),
      0,
    );
  } catch {
    // Never block on a guard defect, but do not stay silent either.
    return { decision: "ask", reason: REASON.unanalysable };
  }
  return (
    findings.find((f) => f.decision === "deny") ??
    findings.find((f) => f.decision === "ask") ??
    null
  );
}

export function hookOutput(input, options = {}) {
  const command =
    input?.tool_name === "Bash" ? input?.tool_input?.command : undefined;
  const cwd = typeof input?.cwd === "string" ? input.cwd : undefined;
  const result = guardDecision(command, { cwd, ...options });
  if (result === null) return null;
  const next =
    result.decision === "deny"
      ? "Ask the Owner for the exact operation instead."
      : "Approve only if the Owner asked for this exact operation.";
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.decision,
      permissionDecisionReason: `yoyi guard: ${result.reason}. ${next}`,
    },
  };
}

function invokedDirectly() {
  try {
    return (
      process.argv[1] !== undefined &&
      realpathSync(process.argv[1]) ===
        realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const output = hookOutput(JSON.parse(raw));
      if (output) process.stdout.write(JSON.stringify(output));
    } catch {
      // Unreadable input: no decision, the normal permission flow applies.
    }
    process.exit(0);
  });
}
