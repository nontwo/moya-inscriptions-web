import { asPostgresOperationError } from "./availability.js";
import { catalogPageOffset } from "./pagination.js";
import {
  countCatalogEntriesSql,
  findCatalogEntrySql,
  listCatalogAliasesSql,
  listCatalogCitationsSql,
  listCatalogEntriesSql,
  listCatalogMediaSql,
  listRepresentativeCatalogMediaSql,
} from "./queries.js";
import {
  mapAliasRows,
  mapCatalogDetailRow,
  mapCatalogEntryRow,
  mapCatalogMediaRows,
  mapCitationRows,
  mapRepresentativeMediaRows,
} from "./row-mapper.js";

import type {
  CatalogAliasRow,
  CatalogCitationRow,
  CatalogEntryRow,
  CatalogMediaRow,
} from "./row-mapper.js";
import type {
  CatalogListPageProjection,
  CatalogListQuery,
  CatalogQueryPort,
} from "@moya/api";
import type { CatalogId } from "@moya/contracts";
import type { Pool, PoolClient, QueryResultRow } from "pg";

interface CatalogCountRow extends QueryResultRow {
  readonly total: unknown;
}

export const parseCatalogCount = (value: unknown): number => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("Invalid PostgreSQL Catalog count");
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count)) {
    throw new Error("PostgreSQL Catalog count exceeds the Public contract");
  }
  return count;
};

const withReadTransaction = async <Result>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> => {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw asPostgresOperationError(error, "connect");
  }

  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the originating failure; release removes the broken client.
    }
    throw asPostgresOperationError(error, "query");
  } finally {
    client.release();
  }
};

/** PostgreSQL infrastructure implementation of the frozen Catalog read port. */
export class PostgresCatalogQueryAdapter implements CatalogQueryPort {
  constructor(private readonly pool: Pool) {}

  async list({
    kind,
    page,
    pageSize,
  }: CatalogListQuery): Promise<CatalogListPageProjection> {
    return withReadTransaction(this.pool, async (client) => {
      const countResult = await client.query<CatalogCountRow>(
        countCatalogEntriesSql,
        [kind ?? null],
      );
      const total = parseCatalogCount(countResult.rows[0]?.total);
      const entriesResult = await client.query<CatalogEntryRow>(
        listCatalogEntriesSql,
        [kind ?? null, pageSize, catalogPageOffset(page, pageSize).toString()],
      );
      const catalogIds = entriesResult.rows.map((row) =>
        String(row.catalog_id),
      );
      const [aliasesResult, representativeMediaResult] =
        catalogIds.length === 0
          ? [
              { rows: [] as CatalogAliasRow[] },
              { rows: [] as CatalogMediaRow[] },
            ]
          : await Promise.all([
              client.query<CatalogAliasRow>(listCatalogAliasesSql, [
                catalogIds,
              ]),
              client.query<CatalogMediaRow>(listRepresentativeCatalogMediaSql, [
                catalogIds,
              ]),
            ]);
      const aliases = mapAliasRows(aliasesResult.rows);
      const representativeMedia = mapRepresentativeMediaRows(
        representativeMediaResult.rows,
      );

      return {
        items: entriesResult.rows.map((row) =>
          mapCatalogEntryRow(
            row,
            aliases.get(String(row.catalog_id)) ?? [],
            representativeMedia.get(String(row.catalog_id)),
          ),
        ),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      };
    });
  }

  async getById(id: CatalogId) {
    return withReadTransaction(this.pool, async (client) => {
      const entryResult = await client.query<CatalogEntryRow>(
        findCatalogEntrySql,
        [id],
      );
      const entry = entryResult.rows[0];
      if (entry === undefined) return null;

      const [aliasesResult, citationsResult, mediaResult] = await Promise.all([
        client.query<CatalogAliasRow>(listCatalogAliasesSql, [[id]]),
        client.query<CatalogCitationRow>(listCatalogCitationsSql, [id]),
        client.query<CatalogMediaRow>(listCatalogMediaSql, [id]),
      ]);
      const aliases = mapAliasRows(aliasesResult.rows);

      return mapCatalogDetailRow(
        entry,
        aliases.get(id) ?? [],
        mapCitationRows(citationsResult.rows),
        mapCatalogMediaRows(mediaResult.rows),
      );
    });
  }
}
