import { createServer } from "node:http";

import type {
  CatalogDetail,
  CatalogId,
  CatalogPage,
  CatalogSummary,
  MediaId,
  PublicMedia,
} from "@moya/contracts";
import type { ServerResponse } from "node:http";

const host = "127.0.0.1";
const port = 3101;
const baseUrl = `http://${host}:${port}`;

const catalogId = (value: string) => value as CatalogId;
const mediaId = (value: string) => value as MediaId;

const publicMedia = (
  id: string,
  fileName: string,
  alt: string,
  width: number,
  height: number,
): PublicMedia => ({
  alt,
  height,
  id: mediaId(id),
  kind: "image",
  src: `${baseUrl}/media/${fileName}`,
  width,
});

const inscriptionFront = publicMedia(
  "runtime-inscription-front",
  "inscription-front.svg",
  "运行时多图碑刻正面",
  1200,
  1600,
);
const inscriptionDetail = publicMedia(
  "runtime-inscription-detail",
  "inscription-detail.svg",
  "运行时多图碑刻局部",
  1600,
  900,
);
const calligraphyLeaf = publicMedia(
  "runtime-calligraphy-leaf",
  "calligraphy-leaf.svg",
  "运行时书帖册页",
  1400,
  1000,
);

const summaries: readonly CatalogSummary[] = [
  {
    aliases: ["无图运行记录"],
    id: catalogId("runtime-inscription-no-media"),
    kind: "inscription",
    periodLabel: "唐",
    summary: "用于验证真实无图记录不会获得演示图像。",
    title: "运行时无图碑刻",
  },
  {
    aliases: ["多图运行记录"],
    id: catalogId("runtime-inscription-multi-media"),
    kind: "inscription",
    periodLabel: "北魏",
    representativeMedia: inscriptionFront,
    summary: "用于验证多媒体与响应式连续性。",
    title: "运行时多图碑刻",
  },
  {
    aliases: [],
    id: catalogId("runtime-identity-mismatch"),
    kind: "inscription",
    summary: "用于验证错误身份不会替代所选资源。",
    title: "运行时身份校验条目",
  },
  {
    aliases: ["运行时册页"],
    id: catalogId("runtime-calligraphy"),
    kind: "calligraphy",
    periodLabel: "宋",
    representativeMedia: calligraphyLeaf,
    summary: "用于验证书帖运行时身份。",
    title: "运行时书帖",
  },
];

const details = new Map<string, CatalogDetail>([
  [
    "runtime-inscription-no-media",
    {
      aliases: ["无图运行记录"],
      description: "此记录有真实文字资料，但没有任何公开媒体。",
      dynasty: "唐",
      id: catalogId("runtime-inscription-no-media"),
      kind: "inscription",
      media: [],
      periodLabel: "唐",
      sourceCitations: [{ label: "测试公开资料" }],
      summary: "用于验证真实无图记录不会获得演示图像。",
      title: "运行时无图碑刻",
    },
  ],
  [
    "runtime-inscription-multi-media",
    {
      aliases: ["多图运行记录"],
      currentLocation: "测试陈列区",
      description:
        "此记录提供两张公开图像，并用于验证详情独立纵向滚动与历史恢复。".repeat(
          24,
        ),
      dynasty: "北魏",
      id: catalogId("runtime-inscription-multi-media"),
      kind: "inscription",
      media: [inscriptionFront, inscriptionDetail],
      periodLabel: "北魏",
      representativeMedia: inscriptionFront,
      sourceCitations: [{ label: "测试公开资料" }],
      summary: "用于验证多媒体与响应式连续性。",
      title: "运行时多图碑刻",
    },
  ],
  [
    "runtime-calligraphy",
    {
      aliases: ["运行时册页"],
      description: "此记录验证书帖使用真实运行时身份。",
      dynasty: "宋",
      id: catalogId("runtime-calligraphy"),
      kind: "calligraphy",
      media: [calligraphyLeaf],
      periodLabel: "宋",
      representativeMedia: calligraphyLeaf,
      sourceCitations: [{ label: "测试公开资料" }],
      summary: "用于验证书帖运行时身份。",
      title: "运行时书帖",
    },
  ],
]);

const mismatchedDetail: CatalogDetail = {
  aliases: [],
  id: catalogId("wrong-runtime-resource"),
  kind: "inscription",
  media: [],
  sourceCitations: [],
  title: "错误替代资源",
};

const mediaAssets = new Map([
  ["/media/inscription-front.svg", "#655044"],
  ["/media/inscription-detail.svg", "#8b735f"],
  ["/media/calligraphy-leaf.svg", "#5f6f58"],
]);

const sendJson = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
};

const sendSvg = (response: ServerResponse, color: string) => {
  response.writeHead(200, { "Content-Type": "image/svg+xml" });
  response.end(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><rect width="160" height="120" fill="${color}"/></svg>`,
  );
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", baseUrl);

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end();
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (url.pathname === "/v1/catalog") {
    const kind = url.searchParams.get("kind");
    const items = summaries.filter(
      (item) => kind === null || item.kind === kind,
    );
    const page: CatalogPage = {
      items: [...items],
      page: 1,
      pageSize: 20,
      total: items.length,
      totalPages: items.length === 0 ? 0 : 1,
    };
    sendJson(response, 200, page);
    return;
  }

  const catalogDetailMatch = url.pathname.match(/^\/v1\/catalog\/([^/]+)$/);
  if (catalogDetailMatch) {
    const requestedId = decodeURIComponent(catalogDetailMatch[1] ?? "");
    if (requestedId === "runtime-identity-mismatch") {
      sendJson(response, 200, mismatchedDetail);
      return;
    }
    const detail = details.get(requestedId);
    if (detail) {
      sendJson(response, 200, detail);
      return;
    }
    response.writeHead(404);
    response.end();
    return;
  }

  const color = mediaAssets.get(url.pathname);
  if (color) {
    sendSvg(response, color);
    return;
  }

  response.writeHead(404);
  response.end();
});

server.listen(port, host);
