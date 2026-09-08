import { readFile } from "node:fs/promises";

// Controlled optional input. Never return source paths, operational IDs, notes,
// citations, media, or unselected fields. Do not serialize returned documents or
// query text into public evidence. The runner exports aggregate judgments only.
export async function loadPrivateInput(filename) {
  if (!filename) return { documents: [], queries: [], status: "not-supplied" };
  let input;
  try {
    input = JSON.parse(await readFile(filename, "utf8"));
  } catch {
    throw new Error("PRIVATE_INPUT_UNREADABLE");
  }
  if (!Array.isArray(input.catalogRows) || input.catalogRows.length !== 3)
    throw new Error("PRIVATE_INPUT_SHAPE");
  const allowed = [
    "kind",
    "title",
    "summary",
    "description",
    "periodLabel",
    "dynasty",
    "dateText",
    "scriptStyle",
    "province",
    "prefecture",
    "county",
    "currentLocation",
    "currentCustodian",
    "transcription",
  ];
  const documents = input.catalogRows.map((row, i) => ({
    ...Object.fromEntries(
      allowed
        .filter((field) => row[field] !== undefined)
        .map((field) => [field, row[field]]),
    ),
    id: `private-${i + 1}`,
    kind: row.catalogKind,
    visible: true,
    fictional: false,
    aliases: (input.aliasRows ?? [])
      .filter((alias) => alias.catalogImportId === row.catalogImportId)
      .map((alias) => alias.alias),
    contributors: (input.contributorRows ?? [])
      .filter((c) => c.catalogImportId === row.catalogImportId)
      .map((c) => ({ name: c.name })),
  }));
  const queries = [];
  for (const document of documents) {
    const probes = [["private-title", document.title]];
    if (document.aliases[0])
      probes.push(["private-alias", document.aliases[0]]);
    if (document.contributors[0])
      probes.push([
        "private-person-work",
        `${document.contributors[0].name} ${document.title}`,
      ]);
    const body =
      document.transcription?.state === "VALUE"
        ? document.transcription.value
        : "";
    const fragment =
      typeof body === "string"
        ? body.match(/[\p{Script=Han}]{6,12}/u)?.[0]
        : null;
    if (fragment) probes.push(["private-body-fragment", fragment]);
    for (const [category, query] of probes)
      queries.push({
        id: `private-query-${queries.length + 1}`,
        category,
        query,
        expectedIds: [document.id],
        acceptableTop1: [document.id],
        private: true,
      });
  }
  return {
    documents,
    queries,
    status: "three-authorized-input-records",
    labeling:
      "Title/alias/person-work probes use existing supplied fields. Body probes are contiguous supplied-text fragments; these are controlled retrieval probes, not scholarly relevance judgments.",
  };
}
