const nodeEnvironments = ["development", "test", "production"] as const;

export type NodeEnvironment = (typeof nodeEnvironments)[number];

declare const configuredPort: unique symbol;

/** A validated external PORT value. Unlike internal listen ports, this cannot be 0. */
export type ConfiguredPort = number & {
  readonly [configuredPort]: true;
};

export interface RuntimeConfig {
  readonly host: string;
  readonly nodeEnv: NodeEnvironment;
  readonly port: ConfiguredPort;
}

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const isNodeEnvironment = (value: string): value is NodeEnvironment =>
  nodeEnvironments.some((candidate) => candidate === value);

const parseHost = (value: string | undefined, required: boolean): string => {
  if (value === undefined) {
    if (required) throw new Error("HOST is required in production");
    return "127.0.0.1";
  }

  if (value === "" || value.trim() !== value || /\s/.test(value)) {
    throw new Error("HOST must be a non-empty value without whitespace");
  }

  return value;
};

const parsePort = (
  value: string | undefined,
  required: boolean,
): ConfiguredPort => {
  if (value === undefined) {
    if (required) throw new Error("PORT is required in production");
    return 3001 as ConfiguredPort;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("PORT must be a decimal integer from 1 to 65535");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error("PORT must be a decimal integer from 1 to 65535");
  }

  return port as ConfiguredPort;
};

export const parseRuntimeConfig = (
  environment: RuntimeEnvironment,
): RuntimeConfig => {
  const nodeEnvValue = environment.NODE_ENV ?? "development";
  if (!isNodeEnvironment(nodeEnvValue)) {
    throw new Error("NODE_ENV must be one of development, test, or production");
  }

  const production = nodeEnvValue === "production";
  return Object.freeze({
    host: parseHost(environment.HOST, production),
    nodeEnv: nodeEnvValue,
    port: parsePort(environment.PORT, production),
  });
};
