import {
  createBackendApplication,
  installProcessShutdownHandlers,
  parseRuntimeConfig,
  startBackendProcess,
} from "./index.js";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown runtime error";

const main = async (): Promise<void> => {
  const config = parseRuntimeConfig(process.env);
  const requestListener = createBackendApplication({
    nodeEnv: config.nodeEnv,
  });
  const processHandle = await startBackendProcess({
    listen: config,
    requestListener,
  });

  installProcessShutdownHandlers(processHandle.shutdown);
  console.info(
    `[backend-runtime] listening on http://${processHandle.address.address}:${processHandle.address.port} (${config.nodeEnv})`,
  );
};

main().catch((error: unknown) => {
  console.error(`[backend-runtime] startup failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
