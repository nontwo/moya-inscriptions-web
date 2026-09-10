import { createHash, randomUUID } from "node:crypto";
import { getFileKey } from "@payloadcms/plugin-cloud-storage/utilities";
import {
  editorialDraftSchema,
  editorialMediaSchema,
} from "@moya/contracts/internal/editorial";

import {
  APIError,
  type Access,
  type CollectionConfig,
  type PayloadRequest,
} from "payload";
import sharp from "sharp";
import { createLocalPublishedMediaReadAccess } from "./local-read";

const MIME_FORMATS = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export const MAX_MEDIA_BYTES = 40 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 80_000_000;
const immutableFields = [
  "mediaId",
  "catalogId",
  "objectKey",
  "sha256",
  "origin",
  "prefix",
  "filename",
  "mimeType",
  "filesize",
  "width",
  "height",
  "rights",
  "orderConfidence",
] as const;
const controlledFields = [
  "url",
  "thumbnailURL",
  "sizes",
  "focalX",
  "focalY",
] as const;
function fail(code: string): never {
  throw new APIError(code, 400);
}
const validKey = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 2048 &&
  value === value.trim() &&
  !value.includes("\u0000");

function assertAdapterPreservesKey(
  objectKey: string,
  prefix: string,
  filename: string,
): void {
  let actual: string;
  try {
    actual = getFileKey({ docPrefix: prefix, filename }).fileKey;
  } catch {
    fail("MEDIA_OBJECT_KEY_REQUIRES_ADAPTER_EXTENSION");
  }
  if (actual !== objectKey) fail("MEDIA_OBJECT_KEY_REQUIRES_ADAPTER_EXTENSION");
}

type MediaAccess = {
  read: Access;
  canWrite: (
    req: PayloadRequest,
    catalogId: string,
  ) => boolean | Promise<boolean>;
  canRegister: (req: PayloadRequest) => boolean | Promise<boolean>;
  localDirectory: string;
};

/** Native Payload uploads retain bytes; never configure global Payload `sharp`. */
export function createMediaCollection(options: MediaAccess): CollectionConfig {
  return {
    slug: "media",
    admin: {
      useAsTitle: "alt",
      defaultColumns: ["alt", "mimeType", "width", "height", "orderConfidence"],
      description:
        "Original media. Replacement and deletion are disabled; use a new MediaId for new bytes.",
    },
    disableDuplicate: true,
    disableBulkDelete: true,
    access: {
      read: createLocalPublishedMediaReadAccess(options.read),
      create: async ({ req, data }) =>
        typeof data?.catalogId === "string" &&
        options.canWrite(req, data.catalogId),
      update: options.read,
      delete: () => false,
    },
    upload: {
      staticDir: options.localDirectory,
      mimeTypes: Object.keys(MIME_FORMATS),
      filesRequiredOnCreate: false,
      pasteURL: false,
      crop: false,
      focalPoint: false,
      bulkUpload: true,
      modifyResponseHeaders: ({ headers }) => {
        headers.set("Cache-Control", "private, no-store, max-age=0");
        headers.set("Vary", "Cookie, Authorization");
        return headers;
      },
    },
    fields: [
      {
        name: "mediaId",
        type: "text",
        defaultValue: () => `media-${randomUUID()}`,
        admin: { readOnly: true, hidden: true },
        required: true,
        unique: true,
        index: true,
      },
      {
        name: "catalogId",
        type: "text",
        label: "所属目录",
        required: true,
        index: true,
        admin: {
          components: {
            Field: "./src/media/CatalogOwnershipField#CatalogOwnershipField",
          },
        },
      },
      {
        name: "origin",
        type: "select",
        required: true,
        defaultValue: "upload",
        options: ["upload", "existing"],
      },
      {
        name: "objectKey",
        type: "text",
        maxLength: 2048,
        required: true,
        unique: true,
        admin: { readOnly: true, hidden: true },
      },
      {
        name: "sha256",
        type: "text",
        required: true,
        admin: { readOnly: true, hidden: true },
      },
      { name: "alt", type: "text", required: true, maxLength: 2000 },
      {
        name: "rights",
        type: "textarea",
        label: "原始权利说明",
        maxLength: 2000,
        admin: {
          components: {
            Field: "./src/media/OriginalMediaMetadataField#OriginalRightsField",
          },
          description: "创建时填写并保留原始声明；之后不可修改。",
        },
      },
      {
        name: "orderConfidence",
        type: "select",
        options: ["HIGH", "LOW"],
        admin: {
          components: {
            Field:
              "./src/media/OriginalMediaMetadataField#OriginalOrderConfidenceField",
          },
          description: "保留原始排序可信度；LOW 警告不可自动提升或删除。",
        },
      },
    ],
    hooks: {
      beforeOperation: [
        async ({ args, operation, req }) => {
          if (operation === "delete") fail("MEDIA_DELETE_DISABLED");
          if (operation !== "create" && operation !== "update") return;
          if (!("data" in args) || !args.data || typeof args.data !== "object")
            fail("MEDIA_INPUT_INVALID");
          const data = args.data as Record<string, unknown>;
          if (
            ("duplicateFromID" in args && args.duplicateFromID) ||
            req.query?.uploadEdits
          )
            fail("MEDIA_TRANSFORM_DISABLED");
          if (
            controlledFields.some(
              (key) => data[key] !== undefined && data[key] !== null,
            )
          )
            fail("MEDIA_TRANSFORM_DISABLED");
          if (operation === "update") {
            if (req.file) fail("MEDIA_REPLACEMENT_DISABLED");
            return;
          }
          if (
            !editorialMediaSchema.shape.mediaId.safeParse(data.mediaId)
              .success ||
            !editorialDraftSchema.shape.catalogId.safeParse(data.catalogId)
              .success
          )
            fail("MEDIA_IDENTITY_INVALID");
          if (!(await options.canWrite(req, String(data.catalogId))))
            throw new APIError("MEDIA_FORBIDDEN", 403);
          const found = await req.payload.find({
            collection: "media",
            where: { mediaId: { equals: data.mediaId } },
            limit: 1,
            depth: 0,
            req,
            overrideAccess: true,
          });
          if (found.docs.length)
            throw new APIError("MEDIA_IDENTITY_EXISTS", 409);
          if (data.origin === "existing") {
            if (!(await options.canRegister(req)) || req.file)
              throw new APIError("MEDIA_REGISTRATION_FORBIDDEN", 403);
            if (
              !validKey(data.objectKey) ||
              !/^[a-f0-9]{64}$/.test(String(data.sha256))
            )
              fail("MEDIA_REGISTRATION_INVALID");
            if (
              !(String(data.mimeType) in MIME_FORMATS) ||
              !Number.isSafeInteger(data.filesize) ||
              Number(data.filesize) <= 0 ||
              !Number.isSafeInteger(data.width) ||
              !Number.isSafeInteger(data.height) ||
              Number(data.width) <= 0 ||
              Number(data.height) <= 0
            )
              fail("MEDIA_REGISTRATION_INVALID");
            const segments = data.objectKey.split("/");
            data.filename = segments.pop();
            data.prefix = segments.join("/");
            assertAdapterPreservesKey(
              data.objectKey,
              String(data.prefix),
              String(data.filename),
            );
            // Payload indexes filename globally, while object storage scopes it
            // by prefix. Never rename an approved legacy key to fit this model.
            const sameFilename = await req.payload.find({
              collection: "media",
              where: { filename: { equals: data.filename } },
              limit: 1,
              depth: 0,
              req,
              overrideAccess: true,
            });
            if (
              sameFilename.docs.some(
                (document) => document.objectKey !== data.objectKey,
              )
            )
              fail("MEDIA_OBJECT_KEY_REQUIRES_ADAPTER_EXTENSION");
            return;
          }
          if (data.origin !== undefined && data.origin !== "upload")
            fail("MEDIA_ORIGIN_INVALID");
          const file = req.file;
          if (
            !file ||
            file.tempFilePath ||
            !Buffer.isBuffer(file.data) ||
            file.size !== file.data.length ||
            file.size <= 0 ||
            file.size > MAX_MEDIA_BYTES ||
            !(file.mimetype in MIME_FORMATS)
          )
            fail("MEDIA_FILE_INVALID");
          if (typeof req.payload.config.sharp === "function")
            fail("MEDIA_ORIGINAL_BYTES_CONFIGURATION_REQUIRED");
          let width: number | undefined;
          let height: number | undefined;
          try {
            const probe = sharp(file.data, {
              limitInputPixels: MAX_MEDIA_PIXELS,
            });
            const info = await probe.metadata();
            if (
              info.format !==
                MIME_FORMATS[file.mimetype as keyof typeof MIME_FORMATS] ||
              (info.pages ?? 1) > 1 ||
              !info.width ||
              !info.height ||
              info.width * info.height > MAX_MEDIA_PIXELS
            )
              fail("MEDIA_FILE_INVALID");
            await probe.stats();
            width = info.width;
            height = info.height;
          } catch {
            fail("MEDIA_FILE_INVALID");
          }
          const digest = createHash("sha256").update(file.data).digest("hex");
          const extension =
            file.mimetype === "image/jpeg"
              ? "jpg"
              : MIME_FORMATS[file.mimetype as keyof typeof MIME_FORMATS];
          const mediaKey = createHash("sha256")
            .update(String(data.mediaId))
            .digest("hex");
          const catalogKey = createHash("sha256")
            .update(String(data.catalogId))
            .digest("hex");
          file.name = `${mediaKey}-${digest}.${extension}`;
          data.origin = "upload";
          data.sha256 = digest;
          data.width = width;
          data.height = height;
          data.prefix = `editorial/${catalogKey}`;
          data.objectKey = `${String(data.prefix)}/${file.name}`;
        },
      ],
      beforeChange: [
        async ({ data, originalDoc, operation, req }) => {
          if (operation === "update") {
            if (!(await options.canWrite(req, String(originalDoc.catalogId))))
              throw new APIError("MEDIA_FORBIDDEN", 403);
            for (const field of immutableFields) {
              if (
                data[field] !== undefined &&
                (data[field] ?? undefined) !== (originalDoc[field] ?? undefined)
              )
                fail("MEDIA_IDENTITY_IMMUTABLE");
              data[field] = originalDoc[field];
            }
          }
          if (
            !validKey(data.objectKey) ||
            data.objectKey !==
              `${data.prefix ? `${String(data.prefix)}/` : ""}${String(data.filename)}`
          )
            fail("MEDIA_OBJECT_KEY_MISMATCH");
          assertAdapterPreservesKey(
            data.objectKey,
            String(data.prefix ?? ""),
            String(data.filename),
          );
          return data;
        },
      ],
      beforeDelete: [() => fail("MEDIA_DELETE_DISABLED")],
    },
  };
}

export { validateCatalogMedia } from "./validation";
