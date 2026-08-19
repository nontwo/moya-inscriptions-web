import {
  methodNotAllowed,
  readT02Document,
} from "../../../../lib/t02-static-files";

export const runtime = "nodejs";

export const GET = () => readT02Document("GET");
export const HEAD = () => readT02Document("HEAD");
export const POST = methodNotAllowed;
