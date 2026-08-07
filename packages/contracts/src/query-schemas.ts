import { z } from "zod";

const positiveIntegerQueryStringSchema = z.string().regex(/^[1-9][0-9]*$/);
const sortOrderSchema = z.enum(["asc", "desc"]);
const listSortSchema = z.enum(["title", "period"]);
const searchSortSchema = z.enum(["relevance", "title", "period"]);

export const paginationQuerySchema = z.strictObject({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const siteListTransportQuerySchema = z.strictObject({
  period: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  province: z.string().min(1).optional(),
  page: positiveIntegerQueryStringSchema.optional(),
  pageSize: positiveIntegerQueryStringSchema.optional(),
  sortBy: listSortSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const siteSearchTransportQuerySchema = z.strictObject({
  keyword: z.string().min(1),
  period: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  province: z.string().min(1).optional(),
  page: positiveIntegerQueryStringSchema.optional(),
  pageSize: positiveIntegerQueryStringSchema.optional(),
  sortBy: searchSortSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const siteListQuerySchema = z.strictObject({
  period: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  province: z.string().min(1).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: listSortSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

export const siteSearchQuerySchema = z.strictObject({
  keyword: z.string().min(1),
  period: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  province: z.string().min(1).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: searchSortSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

const toNumber = (value: string | undefined): number | undefined =>
  value === undefined ? undefined : Number(value);

export const parseSiteListQuery = (input: unknown) => {
  const transport = siteListTransportQuerySchema.parse(input);
  return siteListQuerySchema.parse({
    ...transport,
    page: toNumber(transport.page),
    pageSize: toNumber(transport.pageSize),
  });
};

export const parseSiteSearchQuery = (input: unknown) => {
  const transport = siteSearchTransportQuerySchema.parse(input);
  return siteSearchQuerySchema.parse({
    ...transport,
    page: toNumber(transport.page),
    pageSize: toNumber(transport.pageSize),
  });
};
