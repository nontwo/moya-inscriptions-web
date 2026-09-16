/** Purposes of physically retained private publishing bytes. */
export type PublishingBlobPurpose =
  "original" | "standard_master" | "derivative";

/** Content types a publishing blob may carry (sources and derivatives). */
export type PublishingBlobContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "video/quicktime"
  | "video/mp4";

export interface PublishingMediaWriteOptions {
  /** Aborting stops the write promptly; no blob is left behind. */
  readonly signal?: AbortSignal;
  /** When true the stream must deliver exactly `maxBytes` bytes. */
  readonly requireExactSize?: boolean;
}

export interface PublishingMediaWriteResult {
  /** Sanitized opaque key `blobs/aa/bb/<32hex>`; never a filesystem path. */
  readonly storageKey: string;
  readonly byteSize: number;
  /** Lowercase hex SHA-256 of the bytes actually stored. */
  readonly sha256: string;
}

/**
 * Byte range resolved against the stored size: either an inclusive
 * `start`/`end` (open-ended when `end` is omitted) or the last `suffixLength`
 * bytes.
 */
export type PublishingMediaByteRange =
  | { readonly start: number; readonly end?: number }
  | { readonly suffixLength: number };

export type PublishingMediaReadResult =
  | {
      readonly status: "ok";
      /** Total stored size of the blob. */
      readonly byteSize: number;
      /** Inclusive first and last byte of `body`. */
      readonly start: number;
      readonly end: number;
      readonly contentLength: number;
      /** Single-use byte stream; consuming it to the end releases the file. */
      readonly body: AsyncIterable<Uint8Array>;
      /** Releases the underlying file when `body` is not fully consumed. */
      close(): Promise<void>;
    }
  | { readonly status: "range_not_satisfiable"; readonly byteSize: number };

export interface PublishingMediaBlobListOptions {
  /** Continue after this key (exclusive); omit or `null` to start. */
  readonly after?: string | null;
  /** Page size, 1..1000. */
  readonly limit: number;
}

export interface PublishingMediaBlobListing {
  /** Committed blobs in ascending key order. */
  readonly entries: readonly {
    readonly storageKey: string;
    readonly byteSize: number;
    /** Time the bytes were last written (before the blob was committed). */
    readonly modifiedAt: Date;
  }[];
  /**
   * Pass as `after` for the next page; `null` when the listing is complete.
   * A full page may be followed by an empty one.
   */
  readonly nextAfter: string | null;
}

/**
 * Content-free failure codes carried as `code` on errors thrown by adapters of
 * {@link PublishingMediaStorePort}. Unexpected storage failures surface as
 * `unavailable` (with at most a system error code such as `ENOSPC`, never a
 * path).
 */
export type PublishingMediaStoreFailureCode =
  | "invalid_argument"
  | "invalid_key"
  | "size_limit_exceeded"
  | "size_mismatch"
  | "empty_content"
  | "aborted"
  | "not_regular_file"
  | "unavailable";

/**
 * Private publishing byte storage (never PostgreSQL bytea, never public URLs).
 *
 * Commit order: `writeStream` commits the blob before the caller records it.
 * The caller inserts the `media_blobs` row for the returned key in its next
 * transaction and calls `remove` when that fails. A crash in between leaves
 * an unrecorded blob; `reconcile_capacity` pages through `listBlobs` and
 * removes keys that have no row and whose `modifiedAt` is older than a grace
 * period longer than any job lease or upload.
 */
export interface PublishingMediaStorePort {
  /**
   * Streams `source` into private storage, hashing and counting bytes. More
   * than `maxBytes` bytes aborts the write; nothing is committed on failure
   * and committed keys are never overwritten.
   */
  writeStream(
    ownerId: string,
    purpose: PublishingBlobPurpose,
    contentType: PublishingBlobContentType,
    maxBytes: number,
    source: AsyncIterable<Uint8Array>,
    options?: PublishingMediaWriteOptions,
  ): Promise<PublishingMediaWriteResult>;
  /** Resolves `null` when no blob exists for a well-formed key. */
  openRead(
    storageKey: string,
    range?: PublishingMediaByteRange,
  ): Promise<PublishingMediaReadResult | null>;
  /** Idempotent: removing an absent blob succeeds. */
  remove(storageKey: string): Promise<void>;
  /** Bounded, resumable listing of committed blobs for reconciliation. */
  listBlobs(
    options: PublishingMediaBlobListOptions,
  ): Promise<PublishingMediaBlobListing>;
}
