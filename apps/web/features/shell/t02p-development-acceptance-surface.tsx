"use client";

import { useState } from "react";

import { PrimaryNavigationPager } from "./primary-navigation-pager";

import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";

const presentationPlatforms = [
  "phone",
  "tablet",
  "pc",
] as const satisfies readonly PresentationPlatform[];

export const T02pDevelopmentAcceptanceSurface = () => {
  const [activeDestination, setActiveDestination] =
    useState<PrimaryDestination>("home");
  const [platform, setPlatform] = useState<PresentationPlatform>("pc");

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
        value={platform}
        onChange={(event) => {
          const nextPlatform = presentationPlatforms.find(
            (candidate) => candidate === event.currentTarget.value,
          );

          if (nextPlatform !== undefined) {
            setPlatform(nextPlatform);
          }
        }}
      >
        {presentationPlatforms.map((candidate) => (
          <option key={candidate} value={candidate}>
            {candidate}
          </option>
        ))}
      </select>

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
