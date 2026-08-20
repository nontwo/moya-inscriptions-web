import {
  methodNotAllowed,
  serveT02File,
} from "../../../../../lib/t02-static-files";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path?: string[] }> };

export const GET = async (_request: Request, context: RouteContext) =>
  serveT02File(
    { kind: "demo-assets", segments: (await context.params).path ?? [] },
    "GET",
  );
export const HEAD = async (_request: Request, context: RouteContext) =>
  serveT02File(
    { kind: "demo-assets", segments: (await context.params).path ?? [] },
    "HEAD",
  );
export const POST = methodNotAllowed;
