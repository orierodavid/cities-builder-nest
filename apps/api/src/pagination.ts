import type { Request } from "express";

export interface PageWindow {
  page: number;
  pageSize: number;
  from: number;
  to: number;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function getPageWindow(
  req: Pick<Request, "query">,
  defaultPageSize = 50,
  maximumPageSize = 100,
): PageWindow {
  const page = positiveInteger(req.query.page, 1, 1_000_000);
  const pageSize = positiveInteger(req.query.pageSize, defaultPageSize, maximumPageSize);
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize };
}

export function pageResult<T>(
  rows: readonly T[] | null,
  window: PageWindow,
): { items: T[]; pagination: { page: number; pageSize: number; hasMore: boolean; nextPage: number | null } } {
  const values = [...(rows ?? [])];
  const hasMore = values.length > window.pageSize;
  return {
    items: values.slice(0, window.pageSize),
    pagination: {
      page: window.page,
      pageSize: window.pageSize,
      hasMore,
      nextPage: hasMore ? window.page + 1 : null,
    },
  };
}
