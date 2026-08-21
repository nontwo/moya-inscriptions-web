import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

import type { CatalogSummary, PublicMedia } from "@moya/contracts";

const repositoryRoot = resolve(process.cwd(), "../..");
const prototypeRoot = resolve(repositoryRoot, "docs/prototypes/mobile-preview");
const demoAssetRoot = resolve(repositoryRoot, "docs/design-system/assets");
const designTokensRoot = resolve(repositoryRoot, "packages/design-tokens/src");
const uiStylesRoot = resolve(repositoryRoot, "packages/ui/src");
const uiAssetsRoot = resolve(uiStylesRoot, "assets");

export type CatalogCardSummary = Pick<
  CatalogSummary,
  "id" | "kind" | "title" | "periodLabel" | "representativeMedia"
>;
export type BrowseTitles = {
  calligraphy?: readonly CatalogCardSummary[];
  discover?: readonly CatalogCardSummary[];
  inscriptions?: readonly CatalogCardSummary[];
};

export interface T02DocumentOptions {
  catalogDetailQa?: boolean;
}

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
  browseTitles: BrowseTitles = {},
  options: T02DocumentOptions = {},
): Promise<Response> => {
  const filePath = join(prototypeRoot, "index.html");
  try {
    const source = await readFile(filePath, "utf8");
    const documentWithBase = source.replace(
      /<head>/i,
      '<head>\n    <base href="/docs/prototypes/mobile-preview/" />',
    );
    const documentWithQa = options.catalogDetailQa
      ? documentWithBase.replace(
          /<html\b/,
          '<html data-catalog-detail-qa="true"',
        )
      : documentWithBase;
    const document = applyCalligraphyCards(
      applyInscriptionCards(
        applyDiscoverCards(
          documentWithQa,
          browseTitles.discover ?? [],
          options,
        ),
        browseTitles.inscriptions ?? [],
        options,
      ),
      browseTitles.calligraphy ?? [],
      options,
    );
    const headers = { "Content-Type": contentTypes[".html"]! };
    return method === "HEAD"
      ? new Response(null, { status: 200, headers })
      : new Response(document, { status: 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
};

export const applyDiscoverCards = (
  document: string,
  cards: readonly CatalogCardSummary[],
  options: T02DocumentOptions = {},
): string => {
  if (cards.length === 0) return document;

  return applyCardsInSection(
    document,
    /(<div\s+class="app-masonry"\s+data-feed-grid="discover">)([\s\S]*?)(<\/div>)/,
    /<button\b[^>]*data-open-detail[^>]*>[\s\S]*?<\/button>/g,
    /(<span\s+class="app-card__title"\s*>)[\s\S]*?(<\/span\s*>)/,
    cards,
    "discover",
    options,
    true,
  );
};

export const applyInscriptionCards = (
  document: string,
  cards: readonly CatalogCardSummary[],
  options: T02DocumentOptions = {},
): string => {
  if (cards.length === 0) return document;

  return applyCardsPreservingContent(
    document,
    /(<main\s+class="app-scroll"\s+data-scroll-view="inscriptions">[\s\S]*?<div\s+class="app-list">)([\s\S]*?)(<\/div>)/,
    /<button\b[^>]*class="app-inscription-card"[^>]*>[\s\S]*?<\/button>/g,
    /(<span\s+class="app-inscription-card__title"\s*>)[\s\S]*?(<\/span\s*>)/,
    cards,
    "inscription",
    options,
  );
};

export const applyCalligraphyCards = (
  document: string,
  cards: readonly CatalogCardSummary[],
  options: T02DocumentOptions = {},
): string => {
  if (cards.length === 0) return document;

  return applyCardsInSection(
    document,
    /(<div\s+class="app-masonry\s+app-calligraphy-grid">)([\s\S]*?)(<\/div>)/,
    /<button\b[^>]*data-open-detail[^>]*>[\s\S]*?<\/button>/g,
    /(<span\s+class="app-card__title"\s*>)[\s\S]*?(<\/span\s*>)/,
    cards,
    "calligraphy",
    options,
  );
};

type CardRole = "calligraphy" | "discover" | "inscription";

const catalogKindLabel = (kind: CatalogSummary["kind"]): string =>
  kind === "calligraphy" ? "书帖" : "碑刻";

const cardMeta = (card: CatalogCardSummary, role: CardRole): string => {
  if (role === "discover") return "";
  const kind = catalogKindLabel(card.kind);
  const tokens =
    role === "calligraphy"
      ? [card.periodLabel, kind]
      : [kind, card.periodLabel];
  return tokens.filter(Boolean).join(" · ");
};

const setAttribute = (source: string, name: string, value: string): string => {
  const encoded = escapeHtml(value);
  const pattern = new RegExp(`(\\s${name}=)(["'])[\\s\\S]*?\\2`);
  if (pattern.test(source)) return source.replace(pattern, `$1"${encoded}"`);
  return source.replace(/^(<button\b[^>]*)(>)/, `$1 ${name}="${encoded}"$2`);
};

const removeAttribute = (source: string, name: string): string =>
  source.replace(new RegExp(`\\s${name}=(["'])[\\s\\S]*?\\1`), "");

const addClass = (source: string, className: string): string =>
  source.replace(
    /^(<button\b[^>]*\sclass=")([^"]*)(")/,
    (_match, opening: string, classes: string, closing: string) =>
      classes.split(/\s+/).includes(className)
        ? `${opening}${classes}${closing}`
        : `${opening}${classes} ${className}${closing}`,
  );

const removeClass = (source: string, className: string): string =>
  source.replace(
    /^(<button\b[^>]*\sclass=")([^"]*)(")/,
    (_match, opening: string, classes: string, closing: string) =>
      `${opening}${classes
        .split(/\s+/)
        .filter((value) => value && value !== className)
        .join(" ")}${closing}`,
  );

const publicImage = (media: PublicMedia): string =>
  `<img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt)}" width="${media.width}" height="${media.height}" loading="lazy" decoding="async" />`;

const missingImage = (title: string): string =>
  `<span class="app-card__media-fallback" role="img" aria-label="${escapeHtml(`暂无图像：${title}`)}"></span>`;

const replaceCardMedia = (
  source: string,
  card: CatalogCardSummary,
  qa: boolean,
): string => {
  const imagePattern = /<img\b[^>]*\/?\s*>/;
  if (card.representativeMedia) {
    const withImage = source.replace(
      imagePattern,
      publicImage(card.representativeMedia),
    );
    return setAttribute(
      setAttribute(
        removeClass(withImage, "is-media-missing"),
        "data-image",
        card.representativeMedia.src,
      ),
      "data-media-origin",
      "catalog",
    );
  }

  if (qa) {
    const qaAlt = `虚拟测试图，与真实记录无对应关系：${card.title}`;
    const withAlt = source.replace(imagePattern, (image) =>
      setAttribute(image, "alt", qaAlt),
    );
    return setAttribute(withAlt, "data-media-origin", "prototype-demo");
  }

  const withoutImageData = removeAttribute(source, "data-image");
  const withFallback = withoutImageData.replace(
    imagePattern,
    missingImage(card.title),
  );
  return setAttribute(
    addClass(withFallback, "is-media-missing"),
    "data-media-origin",
    "missing",
  );
};

const updateCard = (
  source: string,
  titlePattern: RegExp,
  card: CatalogCardSummary,
  role: CardRole,
  options: T02DocumentOptions,
): string => {
  let result = source.replace(titlePattern, `$1${escapeHtml(card.title)}$2`);
  result = setAttribute(result, "data-content-id", card.id);
  result = setAttribute(result, "data-title", card.title);
  result = setAttribute(result, "data-catalog-source", "public");
  result = replaceCardMedia(result, card, options.catalogDetailQa === true);

  const meta = cardMeta(card, role);
  if (role === "inscription") {
    result = setAttribute(
      result,
      "data-search-text",
      [card.title, catalogKindLabel(card.kind), card.periodLabel]
        .filter(Boolean)
        .join(" "),
    );
    result = result.replace(
      /(<span\s+class="app-inscription-card__meta"\s*>)[\s\S]*?(<\/span\s*>)/,
      `$1${escapeHtml(meta)}$2`,
    );
  } else if (role === "calligraphy") {
    result = setAttribute(result, "data-category", "all");
    result = setAttribute(
      result,
      "data-calligraphy-filter-text",
      [card.title, catalogKindLabel(card.kind), card.periodLabel]
        .filter(Boolean)
        .join(" "),
    );
    result = result.replace(
      /(<span\s+class="app-card__meta"\s*>)[\s\S]*?(<\/span\s*>)/,
      `$1${escapeHtml(meta)}$2`,
    );
  }
  return result;
};

const applyCardsInSection = (
  document: string,
  sectionPattern: RegExp,
  cardPattern: RegExp,
  titlePattern: RegExp,
  items: readonly CatalogCardSummary[],
  role: CardRole,
  options: T02DocumentOptions,
  allowOverflow = false,
): string =>
  document.replace(
    sectionPattern,
    (_match, opening: string, content: string, closing: string) => {
      const cards = content.match(cardPattern);
      if (!cards || cards.length === 0) return `${opening}${content}${closing}`;

      const visibleCardCount = Math.min(cards.length, items.length);
      const visibleCards = cards
        .slice(0, visibleCardCount)
        .map((card, index) =>
          updateCard(card, titlePattern, items[index]!, role, options),
        );

      const overflowCards = allowOverflow
        ? items
            .slice(cards.length)
            .map((item, index) =>
              updateCard(
                cards[index % cards.length]!,
                titlePattern,
                item,
                role,
                options,
              ),
            )
        : [];

      const remainingCards = cards.slice(visibleCardCount);

      return `${opening}${[
        ...visibleCards,
        ...overflowCards,
        ...remainingCards,
      ].join("\n")}${closing}`;
    },
  );

const applyCardsPreservingContent = (
  document: string,
  sectionPattern: RegExp,
  cardPattern: RegExp,
  titlePattern: RegExp,
  items: readonly CatalogCardSummary[],
  role: CardRole,
  options: T02DocumentOptions,
): string =>
  document.replace(
    sectionPattern,
    (_match, opening: string, content: string, closing: string) => {
      const cards = content.match(cardPattern);
      if (!cards || cards.length === 0) return `${opening}${content}${closing}`;

      let titleIndex = 0;
      const updatedContent = content.replace(cardPattern, (card: string) => {
        const item = items[titleIndex++];
        if (!item) return card;
        return updateCard(card, titlePattern, item, role, options);
      });

      return `${opening}${updatedContent}${closing}`;
    },
  );

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
