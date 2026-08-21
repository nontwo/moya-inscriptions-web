import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(process.cwd(), "../..");
const prototypeRoot = resolve(repositoryRoot, "docs/prototypes/mobile-preview");
const demoAssetRoot = resolve(repositoryRoot, "docs/design-system/assets");
const designTokensRoot = resolve(repositoryRoot, "packages/design-tokens/src");
const uiStylesRoot = resolve(repositoryRoot, "packages/ui/src");
const uiAssetsRoot = resolve(uiStylesRoot, "assets");

export type BrowseItem = {
  id: string;
  kind?: "inscription" | "calligraphy";
  title: string;
  aliases?: readonly string[];
  summary?: string;
  periodLabel?: string;
  representativeMedia?: {
    alt: string;
    height: number;
    id: string;
    kind: "image";
    src: string;
    width: number;
  };
};

export type BrowseItems = {
  calligraphy?: readonly BrowseItem[];
  discover?: readonly BrowseItem[];
  inscriptions?: readonly BrowseItem[];
};

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

type FileAccess =
  | { kind: "prototype"; segments: readonly string[] }
  | { kind: "demo-assets"; segments: readonly string[] }
  | { kind: "design-tokens"; segments: readonly ["theme.css"] }
  | { kind: "ui-styles"; segments: readonly ["styles.css"] }
  | { kind: "ui-assets"; segments: readonly string[] };

const rootFor = (access: FileAccess): string => {
  switch (access.kind) {
    case "prototype":
      return prototypeRoot;
    case "demo-assets":
      return demoAssetRoot;
    case "design-tokens":
      return designTokensRoot;
    case "ui-styles":
      return uiStylesRoot;
    case "ui-assets":
      return uiAssetsRoot;
  }
};

const safeRelativePath = (segments: readonly string[]): string | undefined => {
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\"),
    )
  ) {
    return undefined;
  }
  const path = segments.join("/");
  if (isAbsolute(path)) return undefined;
  return path;
};

const containedPath = (root: string, path: string): string | undefined => {
  const candidate = resolve(root, path);
  const containment = relative(root, candidate);
  if (
    containment === "" ||
    containment.startsWith("..") ||
    isAbsolute(containment)
  )
    return undefined;
  return candidate;
};

const responseFor = async (filePath: string, method: "GET" | "HEAD") => {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return new Response(null, { status: 404 });
    const headers = {
      "Content-Type":
        contentTypes[extname(filePath).toLowerCase()] ??
        "application/octet-stream",
    };
    if (method === "HEAD") return new Response(null, { status: 200, headers });
    return new Response(await readFile(filePath), { status: 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
};

export const serveT02File = async (
  access: FileAccess,
  method: "GET" | "HEAD",
) => {
  const relativePath = safeRelativePath(access.segments);
  if (relativePath === undefined) return new Response(null, { status: 404 });
  const filePath = containedPath(rootFor(access), relativePath);
  if (filePath === undefined) return new Response(null, { status: 404 });
  return responseFor(filePath, method);
};

export const readT02Document = async (
  method: "GET" | "HEAD" = "GET",
  browseItems: BrowseItems = {},
): Promise<Response> => {
  const filePath = join(prototypeRoot, "index.html");
  try {
    const source = await readFile(filePath, "utf8");
    const documentWithBase = source.replace(
      /<head>/i,
      '<head>\n    <base href="/docs/prototypes/mobile-preview/" />',
    );
    const documentWithDevelopmentDetail =
      process.env.NODE_ENV === "production"
        ? documentWithBase
        : ensureDevelopmentTranscriptionSection(documentWithBase);
    const documentWithCards = appendCalligraphyItems(
      appendInscriptionItems(
        appendDiscoverItems(
          documentWithDevelopmentDetail,
          browseItems.discover ?? [],
        ),
        browseItems.inscriptions ?? [],
      ),
      browseItems.calligraphy ?? [],
    );
    const document = injectRuntimeCatalogRecords(documentWithCards, browseItems);
    const headers = { "Content-Type": contentTypes[".html"]! };
    return method === "HEAD"
      ? new Response(null, { status: 200, headers })
      : new Response(document, { status: 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
};

/**
 * Development/Owner-QA keeps the complete approved Detail structure visible even
 * before a formal transcription contract exists. This is presentation-only and
 * is deliberately omitted when NODE_ENV=production.
 */
export const ensureDevelopmentTranscriptionSection = (document: string): string => {
  if (document.includes("data-detail-transcription")) return document;

  const summarySection =
    /(<section\s+class="app-detail__section app-detail__reading"\s+data-detail-summary\s+hidden>[\s\S]*?<\/section>)/;

  return document.replace(
    summarySection,
    `$1\n              <section\n                class="app-detail__section app-detail__reading"\n                data-detail-transcription\n              >\n                <h2>释文</h2>\n                <p data-detail-transcription-text>内容待接入</p>\n              </section>`,
  );
};

export const appendDiscoverItems = (
  document: string,
  items: readonly BrowseItem[],
): string => {
  if (items.length === 0) return document;

  return appendCardsInSection(
    document,
    /(<div\s+class="app-masonry"\s+data-feed-grid="discover">)([\s\S]*?)(<\/div>)/,
    items.map(renderDiscoverCard),
  );
};

export const appendInscriptionItems = (
  document: string,
  items: readonly BrowseItem[],
): string => {
  if (items.length === 0) return document;

  return appendCardsInSection(
    document,
    /(<main\s+class="app-scroll"\s+data-scroll-view="inscriptions">[\s\S]*?<div\s+class="app-list">)([\s\S]*?)(<\/div>)/,
    items.map(renderInscriptionCard),
  );
};

export const appendCalligraphyItems = (
  document: string,
  items: readonly BrowseItem[],
): string => {
  if (items.length === 0) return document;

  return appendCardsInSection(
    document,
    /(<div\s+class="app-masonry\s+app-calligraphy-grid">)([\s\S]*?)(<\/div>)/,
    items.map(renderCalligraphyCard),
  );
};

const appendCardsInSection = (
  document: string,
  sectionPattern: RegExp,
  cards: readonly string[],
): string =>
  document.replace(
    sectionPattern,
    (_match, opening: string, content: string, closing: string) =>
      `${opening}${content}\n${cards.join("\n")}${closing}`,
  );

const allRuntimeItems = (browseItems: BrowseItems): BrowseItem[] => {
  const items = [
    ...(browseItems.discover ?? []),
    ...(browseItems.inscriptions ?? []),
    ...(browseItems.calligraphy ?? []),
  ];
  const unique = new Map<string, BrowseItem>();
  for (const item of items) unique.set(item.id, item);
  return [...unique.values()];
};

/**
 * Real browse cards must resolve to their own real CatalogSummary-shaped record.
 * This prevents a real title from opening a synthetic QA record with unrelated
 * media/facts while still leaving the QA fixture records intact and independent.
 */
export const injectRuntimeCatalogRecords = (
  document: string,
  browseItems: BrowseItems,
): string => {
  const items = allRuntimeItems(browseItems);
  if (items.length === 0) return document;

  const records = Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        aliases: [...(item.aliases ?? [])],
        id: item.id,
        kind: item.kind ?? "inscription",
        media: item.representativeMedia ? [item.representativeMedia] : [],
        periodLabel: item.periodLabel,
        representativeMedia: item.representativeMedia,
        sourceCitations: [],
        summary: item.summary,
        title: item.title,
      },
    ]),
  );
  const payload = JSON.stringify(records).replace(/</g, "\\u003c");
  const bridge = `<script data-runtime-catalog-bridge>\n(() => {\n  const fixture = globalThis.YOYI_CATALOG_DETAIL_PLACEHOLDER ?? { records: {}, version: \"runtime-bridge\" };\n  fixture.records = { ...(fixture.records ?? {}), ...${payload} };\n  globalThis.YOYI_CATALOG_DETAIL_PLACEHOLDER = fixture;\n})();\n</script>`;
  const previewScript = /(<script(?:\s+type="module")?\s+src="\.\/preview\.js(?:\?[^"]*)?"><\/script>)/;
  return document.replace(previewScript, `${bridge}\n$1`);
};

const renderMedia = (item: BrowseItem): string => {
  const media = item.representativeMedia;
  if (!media) return "";
  return `<img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt)}" width="${media.width}" height="${media.height}" />`;
};

const runtimeCardAttributes = (item: BrowseItem): string => {
  const image = item.representativeMedia?.src;
  return [
    'data-record-origin="runtime"',
    `data-content-id="${escapeHtml(item.id)}"`,
    "data-open-detail",
    image ? `data-image="${escapeHtml(image)}"` : "",
    `data-title="${escapeHtml(item.title)}"`,
    'type="button"',
  ]
    .filter(Boolean)
    .join(" ");
};

const searchableText = (item: BrowseItem): string =>
  [item.title, item.summary, item.periodLabel].filter(Boolean).join(" ");

const renderDiscoverCard = (item: BrowseItem): string =>
  `<button class="app-card" ${runtimeCardAttributes(item)}>\n${renderMedia(item)}\n<span class="app-card__title">${escapeHtml(item.title)}</span>\n</button>`;

const renderInscriptionCard = (item: BrowseItem): string =>
  `<button class="app-inscription-card" data-search-text="${escapeHtml(searchableText(item))}" ${runtimeCardAttributes(item)}>\n${renderMedia(item)}\n<span class="app-inscription-card__body">\n<span class="app-inscription-card__title">${escapeHtml(item.title)}</span>\n${item.periodLabel ? `<span class="app-inscription-card__meta">碑刻 · ${escapeHtml(item.periodLabel)}</span>` : '<span class="app-inscription-card__meta">碑刻</span>'}\n</span>\n<span class="yoyi-icon yoyi-icon--sm app-inscription-card__arrow" data-icon="next" aria-hidden="true"></span>\n</button>`;

const renderCalligraphyCard = (item: BrowseItem): string =>
  `<button class="app-card" data-category="all" data-calligraphy-filter-text="${escapeHtml(searchableText(item))}" ${runtimeCardAttributes(item)}>\n${renderMedia(item)}\n<span class="app-card__caption">\n<span class="app-card__title">${escapeHtml(item.title)}</span>\n${item.periodLabel ? `<span class="app-card__meta">${escapeHtml(item.periodLabel)}</span>` : ""}\n</span>\n</button>`;

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export const methodNotAllowed = () =>
  new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
