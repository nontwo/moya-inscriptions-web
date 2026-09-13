import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { classifyTask } from "./ci-task-scope.mjs";

export function assertTaskGate(plan, needs) {
  if (!needs || needs.classify_e2e?.result !== "success")
    throw new Error("Task classification did not succeed");
  if (!plan || !isDeepStrictEqual(plan, classifyTask(plan.paths, plan.event)))
    throw new Error("Missing or inconsistent task plan");
  const required = {
    lightweight: true,
    browser_gate: true,
    lint: plan.web,
    typecheck: plan.web,
    test: plan.web,
    build: plan.web,
    cms: plan.cms,
    contracts: plan.contracts,
    apple: plan.apple,
  };
  const lines = [];
  for (const [job, applies] of Object.entries(required)) {
    const expected = applies ? "success" : "skipped";
    if (needs[job]?.result !== expected)
      throw new Error(
        `${job}: expected ${expected}, received ${needs[job]?.result ?? "missing"}`,
      );
    lines.push(
      `${job}: ${applies ? "executed successfully" : "N/A (not run)"}`,
    );
  }
  return lines.join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      assertTaskGate(
        JSON.parse(process.env.PLAN),
        JSON.parse(process.env.NEEDS_JSON),
      ),
    );
  } catch (error) {
    console.error(`Task gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
