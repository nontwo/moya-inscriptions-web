export type TransportQueryValue = string | readonly string[];

/** Preserves duplicate values so strict shared schemas can reject them. */
export const collectTransportQuery = (
  searchParams: URLSearchParams,
): Record<string, TransportQueryValue> => {
  const query: Record<string, TransportQueryValue> = {};

  for (const [key, value] of searchParams) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (typeof existing === "string") {
      query[key] = [existing, value];
    } else {
      query[key] = [...existing, value];
    }
  }

  return query;
};
