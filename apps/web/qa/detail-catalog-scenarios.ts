import { createVisualCatalogItems } from "./home-catalog-scenarios";

import type { CatalogDetail, MediaId, PublicMedia } from "@moya/contracts";

const additionalMedia = (
  origin: string,
  catalogId: string,
  index: number,
  fileName: string,
  width: number,
  height: number,
): PublicMedia => ({
  alt: `${catalogId} 合成详情图像 ${index}`,
  height,
  id: `${catalogId}-detail-media-${index}` as MediaId,
  kind: "image",
  src: new URL(`/docs/design-system/assets/demo/${fileName}`, origin).href,
  width,
});

export const createQaCatalogDetails = (
  mediaOrigin: string,
): readonly CatalogDetail[] => {
  const origin = new URL(mediaOrigin).origin;

  return createVisualCatalogItems(origin).map((summary) => {
    const baseMedia =
      summary.representativeMedia === undefined
        ? []
        : [summary.representativeMedia];
    const media =
      summary.id === "qa-visual-inscription-02"
        ? [
            ...baseMedia,
            additionalMedia(
              origin,
              summary.id,
              2,
              "rubbing-fragment.svg",
              360,
              480,
            ),
            additionalMedia(
              origin,
              summary.id,
              3,
              "inscription-rubbing.svg",
              600,
              420,
            ),
          ]
        : baseMedia;

    return {
      ...summary,
      ...(summary.id === "qa-visual-inscription-01"
        ? {
            county: "QA 合成县",
            currentCustodian: "QA 合成保管单位",
            currentLocation: "QA 合成现址",
            dateText: "QA 合成年代",
            description:
              "这是仅用于 Development QA 的当前 CatalogDetail Contract 长文本展示，不代表任何真实档案事实。",
            dynasty: "QA 合成朝代",
            prefecture: "QA 合成府",
            province: "QA 合成省",
            sourceCitations: [
              {
                citation: "Development QA current-Contract citation",
                label: "QA 合成来源",
              },
            ],
          }
        : summary.id === "qa-visual-inscription-02"
          ? {
              description:
                "这是用于检验详情独立纵向滚动与返回恢复的 Development QA 长文本。".repeat(
                  24,
                ),
              sourceCitations: [],
            }
          : { sourceCitations: [] }),
      media,
    } satisfies CatalogDetail;
  });
};
