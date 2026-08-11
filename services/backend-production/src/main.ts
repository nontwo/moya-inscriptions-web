import { installProcessShutdownHandlers } from "@moya/backend-runtime";

import { startProductionBackend } from "./composition.js";

const safeMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown production startup error";

const main = async (): Promise<void> => {
  const processHandle = await startProductionBackend(process.env);
  installProcessShutdownHandlers(processHandle.shutdown);
  console.info(
    `[backend-production] listening on http://${processHandle.address.address}:${processHandle.address.port} (production)`,
  );
};

main().catch((error: unknown) => {
  console.error(`[backend-production] startup failed: ${safeMessage(error)}`);
  process.exitCode = 1;
});
