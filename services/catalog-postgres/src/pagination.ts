export const catalogPageOffset = (page: number, pageSize: number): bigint =>
  (BigInt(page) - 1n) * BigInt(pageSize);
