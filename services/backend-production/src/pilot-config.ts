import { readFile } from "node:fs/promises";

import {
  createPilotPool,
  parsePilotScope,
  readPilotMedia,
} from "@moya/catalog-importer";
import { PilotCosStorage } from "./storage/pilot-cos.js";
import type { PilotScope } from "@moya/catalog-importer";
import type { RuntimeEnvironment } from "@moya/backend-runtime";

const required = (environment: RuntimeEnvironment, key: string): string => {
  const value = environment[key];
  if (!value) throw new Error(`Pilot configuration missing: ${key}`);
  return value;
};

export const loadPilotConfiguration = async (
  environment: RuntimeEnvironment,
) => {
  const scopeFile = required(environment, "MOYA_PILOT_SCOPE_FILE");
  const manifestFile = required(environment, "MOYA_PILOT_MEDIA_FILE");
  const scope = parsePilotScope(JSON.parse(await readFile(scopeFile, "utf8")));
  const media = await readPilotMedia(manifestFile, scope);
  const storage = new PilotCosStorage({
    ...scope.cos,
    objects: media,
    credentials: async () => ({
      secretId: required(environment, "COS_SECRET_ID"),
      secretKey: required(environment, "COS_SECRET_KEY"),
      ...(environment.COS_SECURITY_TOKEN
        ? {
            securityToken: environment.COS_SECURITY_TOKEN,
            expiresAt: Number(
              required(environment, "COS_CREDENTIAL_EXPIRES_AT"),
            ),
          }
        : {}),
    }),
  });
  return { scope, manifestFile, storage };
};

export const openPilotPool = (
  environment: RuntimeEnvironment,
  scope: PilotScope,
) => createPilotPool(required(environment, "DATABASE_URL"), scope);
