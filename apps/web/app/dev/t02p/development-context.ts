import { headers } from "next/headers";

import {
  detectDeviceClass,
  resolvePresentationPlatform,
} from "../../../features/shell/device-platform";

import type { PresentationPlatform } from "../../../features/shell/device-platform";

const readSingleHeaderValue = (value: string | null, name: string): string => {
  if (value === null) throw new TypeError(`Missing ${name} header`);
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (values.length !== 1) throw new TypeError(`Invalid ${name} header`);
  return values[0]!;
};

const readViewportWidth = (
  requestHeaders: Headers,
  deviceClass: "phone" | "tablet" | "desktop",
) => {
  const value =
    requestHeaders.get("sec-ch-viewport-width") ??
    requestHeaders.get("viewport-width");
  if (value !== null) {
    const width = Number(value);
    if (Number.isFinite(width) && width > 0) return width;
  }
  if (deviceClass === "phone") return 390;
  if (deviceClass === "tablet") return 768;
  return 896;
};

export interface DevelopmentRequestContext {
  readonly initialPlatform: PresentationPlatform;
  readonly mediaOrigin: string;
}

export const readDevelopmentRequestContext =
  async (): Promise<DevelopmentRequestContext> => {
    const requestHeaders = await headers();
    const host = readSingleHeaderValue(requestHeaders.get("host"), "Host");
    const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
    const protocol =
      forwardedProtocol === null
        ? "http"
        : readSingleHeaderValue(forwardedProtocol, "X-Forwarded-Proto");
    if (protocol !== "http" && protocol !== "https") {
      throw new TypeError("Invalid X-Forwarded-Proto header");
    }

    const origin = new URL(`${protocol}://${host}`);
    if (origin.host !== host || origin.pathname !== "/") {
      throw new TypeError("Invalid Host header");
    }

    const deviceClass = detectDeviceClass({
      userAgent: requestHeaders.get("user-agent"),
    });
    const initialPlatform = resolvePresentationPlatform(
      deviceClass,
      readViewportWidth(requestHeaders, deviceClass),
    );

    return { initialPlatform, mediaOrigin: origin.origin };
  };
