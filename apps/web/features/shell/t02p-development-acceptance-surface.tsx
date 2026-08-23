"use client";

import { useEffect, useState } from "react";

import {
  detectDeviceClass,
  resolvePresentationPlatform,
} from "./device-platform";
import { PrimaryNavigationPager } from "./primary-navigation-pager";

import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";

type PresentationPlatformMode = "auto" | PresentationPlatform;

const presentationPlatformLabels = {
  pc: "PC",
  phone: "Phone",
  tablet: "Tablet",
} as const satisfies Record<PresentationPlatform, string>;

const presentationPlatformModes = [
  ["auto", "Auto"],
  ["phone", presentationPlatformLabels.phone],
  ["tablet", presentationPlatformLabels.tablet],
  ["pc", presentationPlatformLabels.pc],
] as const satisfies readonly (readonly [PresentationPlatformMode, string])[];

type NavigatorWithUserAgentData = Navigator & {
  readonly userAgentData?: { readonly mobile?: boolean | null } | null;
};

const readRuntimePresentationPlatform = (): PresentationPlatform => {
  const runtimeNavigator = navigator as NavigatorWithUserAgentData;
  const userAgentData = runtimeNavigator.userAgentData;
  const deviceClass = detectDeviceClass({
    maxTouchPoints: runtimeNavigator.maxTouchPoints,
    userAgent: runtimeNavigator.userAgent,
    ...(userAgentData === undefined ? {} : { userAgentData }),
  });

  return resolvePresentationPlatform(deviceClass, window.innerWidth);
};

export const T02pDevelopmentAcceptanceSurface = () => {
  const [activeDestination, setActiveDestination] =
    useState<PrimaryDestination>("home");
  const [platformMode, setPlatformMode] =
    useState<PresentationPlatformMode>("auto");
  const [runtimePlatform, setRuntimePlatform] =
    useState<PresentationPlatform>("pc");
  const platform = platformMode === "auto" ? runtimePlatform : platformMode;

  useEffect(() => {
    const synchronizeRuntimePlatform = () => {
      setRuntimePlatform(readRuntimePresentationPlatform());
    };

    synchronizeRuntimePlatform();
    window.addEventListener("orientationchange", synchronizeRuntimePlatform);
    window.addEventListener("resize", synchronizeRuntimePlatform);

    return () => {
      window.removeEventListener(
        "orientationchange",
        synchronizeRuntimePlatform,
      );
      window.removeEventListener("resize", synchronizeRuntimePlatform);
    };
  }, []);

  return (
    <main
      data-t02p-development-acceptance=""
      data-active-destination={activeDestination}
      data-platform={platform}
    >
      <h1>T02P Development acceptance</h1>
      <p>QA-only structural shell acceptance surface.</p>

      <label htmlFor="t02p-qa-platform">QA presentation platform</label>
      <select
        id="t02p-qa-platform"
        data-qa-platform-selector=""
        value={platformMode}
        onChange={(event) => {
          const nextMode = presentationPlatformModes.find(
            ([candidate]) => candidate === event.currentTarget.value,
          )?.[0];

          if (nextMode !== undefined) {
            if (nextMode === "auto") {
              setRuntimePlatform(readRuntimePresentationPlatform());
            }
            setPlatformMode(nextMode);
          }
        }}
      >
        {presentationPlatformModes.map(([candidate, label]) => (
          <option key={candidate} value={candidate}>
            {label}
          </option>
        ))}
      </select>

      <p>
        Effective presentation platform:{" "}
        <output aria-live="polite" data-qa-effective-platform="">
          {presentationPlatformLabels[platform]}
        </output>
      </p>

      <PrimaryNavigationPager
        activeDestination={activeDestination}
        platform={platform}
        onDestinationChange={setActiveDestination}
        home={<section data-qa-panel="home">Home acceptance panel</section>}
        inscriptions={
          <section data-qa-panel="inscriptions">
            Inscription acceptance panel
          </section>
        }
        calligraphy={
          <section data-qa-panel="calligraphy">
            Calligraphy acceptance panel
          </section>
        }
      />
    </main>
  );
};
