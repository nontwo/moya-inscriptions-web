/**
 * Opaque bearer credentials. The Backend stores only the SHA-256 digest; the
 * raw token exists in the sign-in response and the Web cookie, nowhere else.
 */

const sessionTokenBytes = 32;
const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export type RandomBytes = (length: number) => Uint8Array;

export const defaultRandomBytes: RandomBytes = (length) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length));

export const generateSessionToken = (
  randomBytes: RandomBytes = defaultRandomBytes,
): string => toBase64Url(randomBytes(sessionTokenBytes));

/** Opaque, platform-generated row identity; never a serial or a provider id. */
export const generateOpaqueId = (
  prefix: string,
  randomBytes: RandomBytes = defaultRandomBytes,
): string => `${prefix}-${toHex(randomBytes(16))}`;

export const generateSessionId = (
  randomBytes: RandomBytes = defaultRandomBytes,
): string => generateOpaqueId("session", randomBytes);

export const isSessionTokenShape = (token: string): boolean =>
  sessionTokenPattern.test(token);

export const hashSessionToken = async (token: string): Promise<string> =>
  toHex(
    new Uint8Array(
      await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      ),
    ),
  );
