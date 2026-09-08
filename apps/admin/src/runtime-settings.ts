export const requiredSetting = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing CMS setting: ${name}`);
  return value;
};
export const cmsDatabase = (): string => {
  const value = requiredSetting("CMS_DATABASE_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid CMS database configuration");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Invalid CMS database protocol");
  if (
    process.env.CMS_ENVIRONMENT === "synthetic" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("Synthetic CMS requires a loopback database");
  return value;
};

/** Fixed diagnostics only: never forward Pino args, messages, paths or values. */
export const cmsRuntimeLogFields = (args: readonly unknown[]) => {
  const allowedNames = new Set([
    "TypeError",
    "ReferenceError",
    "RangeError",
    "Error",
    "APIError",
    "ValidationError",
  ]);
  let error: unknown;
  for (const value of args) {
    if (!value || typeof value !== "object") continue;
    if (value instanceof Error) {
      error = value;
      break;
    }
    if ("err" in value && value.err && typeof value.err === "object") {
      error = value.err;
      break;
    }
    if ("error" in value && value.error && typeof value.error === "object") {
      error = value.error;
      break;
    }
  }
  const frames: { file: string; line: number; column: number }[] = [];
  let errorName: string | undefined;
  if (error && typeof error === "object") {
    if (
      "name" in error &&
      typeof error.name === "string" &&
      allowedNames.has(error.name)
    )
      errorName = error.name;
    if ("stack" in error && typeof error.stack === "string") {
      const framePattern =
        /[/\\]([A-Za-z0-9_.-]+\.(?:[cm]?[jt]sx?)):(\d+):(\d+)\)?(?:\n|$)/g;
      for (const frame of error.stack.matchAll(framePattern)) {
        frames.push({
          file: frame[1]!,
          line: Number(frame[2]),
          column: Number(frame[3]),
        });
        if (frames.length === 5) break;
      }
    }
  }
  return {
    category: "CMS_RUNTIME_EVENT",
    ...(errorName ? { errorName } : {}),
    ...(frames.length ? { frames } : {}),
  };
};
