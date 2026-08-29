import { headers } from "next/headers";

import {
  detectDeviceClass,
  resolvePresentationPlatform,
} from "../features/shell/device-platform";

import type {
  DeviceClass,
  PresentationPlatform,
} from "../features/shell/device-platform";

const fallbackViewportWidths: Readonly<Record<DeviceClass, number>> = {
  desktop: 896,
  phone: 390,
  tablet: 768,
};

const readViewportWidth = (
  requestHeaders: Pick<Headers, "get">,
  deviceClass: DeviceClass,
) => {
  const value =
    requestHeaders.get("sec-ch-viewport-width") ??
    requestHeaders.get("viewport-width");
  if (value !== null) {
    const width = Number(value);
    if (Number.isFinite(width) && width > 0) return width;
  }
  return fallbackViewportWidths[deviceClass];
};

export interface FormalRequestContext {
  readonly initialPlatform: PresentationPlatform;
}

export const readFormalRequestContext =
  async (): Promise<FormalRequestContext> => {
    const requestHeaders = await headers();
    const deviceClass = detectDeviceClass({
      userAgent: requestHeaders.get("user-agent"),
    });

    return {
      initialPlatform: resolvePresentationPlatform(
        deviceClass,
        readViewportWidth(requestHeaders, deviceClass),
      ),
    };
  };
