import OpenCC from "opencc";
import type {
  CatalogContributor,
  CatalogDetail,
  CatalogSearchMatchKind,
} from "@moya/contracts";

/** Fixed evaluated conversion, exclusively for rebuildable backend search data. */
export const SEARCH_NORMALIZATION_VERSION = "opencc-1.4.1-t2s-v1";
if (OpenCC.version !== "1.4.1")
  throw new Error("Search normalization version mismatch");
const converter = new OpenCC("t2s.json");
export const normalizeSearchText = (text: string): string =>
  converter.convertSync(text);

export const projectCatalogSearchDocument = (
  source: Pick<
    CatalogDetail,
    | "title"
    | "aliases"
    | "summary"
    | "periodLabel"
    | "dynasty"
    | "dateText"
    | "scriptStyle"
    | "province"
    | "prefecture"
    | "county"
    | "currentLocation"
    | "currentCustodian"
    | "description"
    | "transcription"
  > & { readonly contributors?: readonly Pick<CatalogContributor, "name">[] },
) => {
  const normalizedTitle = normalizeSearchText(source.title);
  const aliases = [...source.aliases];
  const normalizedAliases = aliases.map(normalizeSearchText);
  const titleAliasText = [normalizedTitle, ...normalizedAliases].join("\n");
  const structuredText = normalizeSearchText(
    [
      ...(source.contributors ?? []).map(({ name }) => name),
      source.periodLabel,
      source.dynasty,
      source.dateText,
      source.scriptStyle,
      source.province,
      source.prefecture,
      source.county,
      source.currentLocation,
      source.currentCustodian,
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n"),
  );
  const body = normalizeSearchText(
    [source.summary, source.description, source.transcription]
      .filter((value): value is string => value !== undefined)
      .join("\n"),
  );
  return {
    title: source.title,
    aliases,
    normalizedTitle,
    normalizedAliases,
    titleAliasText,
    structuredText,
    body,
    combinedText: [titleAliasText, structuredText, body].join("\n"),
    normalizationVersion: SEARCH_NORMALIZATION_VERSION,
  };
};

/** Development fixture / regression oracle; production ordering is in SQL. */
export const matchCatalogSearchDocument = (
  document: ReturnType<typeof projectCatalogSearchDocument>,
  q: string,
): CatalogSearchMatchKind | null => {
  const raw = q.trim();
  if (!raw) return null;
  const normalized = normalizeSearchText(raw);
  const parts = normalized.split(/\s+/u).filter(Boolean);
  if (!parts.every((part) => document.combinedText.includes(part))) return null;
  if (document.title === raw) return "title-exact";
  if (document.aliases.includes(raw)) return "alias-exact";
  if (
    document.normalizedTitle === normalized ||
    document.normalizedAliases.includes(normalized)
  )
    return "normalized-exact";
  if (parts.every((part) => document.titleAliasText.includes(part)))
    return "title-alias-partial";
  const structured = [document.titleAliasText, document.structuredText].join(
    "\n",
  );
  return parts.every((part) => structured.includes(part))
    ? "structured"
    : "body";
};
