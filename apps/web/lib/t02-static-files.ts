import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(process.cwd(), "../..");
const prototypeRoot = resolve(repositoryRoot, "docs/prototypes/mobile-preview");
const demoAssetRoot = resolve(repositoryRoot, "docs/design-system/assets");
const designTokensRoot = resolve(repositoryRoot, "packages/design-tokens/src");
const uiStylesRoot = resolve(repositoryRoot, "packages/ui/src");
const uiAssetsRoot = resolve(uiStylesRoot, "assets");

export type DiscoverTitle = { id: string; title: string };

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
  discoverTitles: readonly DiscoverTitle[] = [],
): Promise<Response> => {
  const filePath = join(prototypeRoot, "index.html");
  try {
    const source = await readFile(filePath, "utf8");
    const documentWithBase = source.replace(
      /<head>/i,
      '<head>\n    <base href="/docs/prototypes/mobile-preview/" />',
    );
    const document = applyDiscoverTitles(documentWithBase, discoverTitles);
    const headers = { "Content-Type": contentTypes[".html"]! };
    return method === "HEAD"
      ? new Response(null, { status: 200, headers })
      : new Response(document, { status: 200, headers });
  } catch {
    return new Response(null, { status: 404 });
  }
};

export const applyDiscoverTitles = (
  document: string,
  discoverTitles: readonly DiscoverTitle[],
): string => {
  if (discoverTitles.length === 0) return document;

  return document.replace(
    /(<div\s+class="app-masonry"\s+data-feed-grid="discover">)([\s\S]*?)(<\/div>)/,
    (_match, opening: string, content: string, closing: string) => {
      const cards = content.match(
        /<button\b[^>]*data-open-detail[^>]*>[\s\S]*?<\/button>/g,
      );
      if (!cards || cards.length === 0) return `${opening}${content}${closing}`;

      const updateTitle = (card: string, title: string): string =>
        card.replace(
          /(<span\s+class="app-card__title">)[\s\S]*?(<\/span>)/,
          `$1${escapeHtml(title)}$2`,
        );

      const visibleCardCount = Math.min(cards.length, discoverTitles.length);
      const visibleCards = cards
        .slice(0, visibleCardCount)
        .map((card, index) => updateTitle(card, discoverTitles[index]!.title));

      const overflowCards = discoverTitles
        .slice(cards.length)
        .map((item, index) =>
          updateTitle(cards[index % cards.length]!, item.title),
        );

      const remainingCards = cards.slice(discoverTitles.length);

      return `${opening}${[
        ...visibleCards,
        ...overflowCards,
        ...remainingCards,
      ].join("\n")}${closing}`;
    },
  );
};

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
