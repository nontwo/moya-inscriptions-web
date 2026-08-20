import {
  methodNotAllowed,
  serveT02File,
} from "../../../../../lib/t02-static-files";

export const runtime = "nodejs";

export const GET = () =>
  serveT02File({ kind: "design-tokens", segments: ["theme.css"] }, "GET");
export const HEAD = () =>
  serveT02File({ kind: "design-tokens", segments: ["theme.css"] }, "HEAD");
export const POST = methodNotAllowed;
