import { createHash, createHmac, randomBytes } from "node:crypto";

export const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export const ACCESS_TOKEN_PATTERN = /^rma_[A-Za-z0-9_-]{43}$/;
export const newAccessToken = () =>
  `rma_${randomBytes(32).toString("base64url")}`;
export function validAccessToken(value: unknown): value is string {
  return typeof value === "string" && ACCESS_TOKEN_PATTERN.test(value);
}
function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || Buffer.byteLength(value) < 32)
    throw new Error("SESSION_SECRET must contain at least 32 bytes");
  return value;
}
export function localCsrfToken(sessionToken: string): string {
  return createHmac("sha256", secret())
    .update(`local\0${sessionToken}`)
    .digest("base64url");
}
export function validCsrf(
  storedHash: string | undefined,
  token: string | undefined,
  mode: "local" | "token" | undefined,
  origin: string | undefined,
  expectedOrigin: string | undefined,
): boolean {
  return (
    !!storedHash &&
    !!token &&
    hash(token) === storedHash &&
    (!expectedOrigin || origin === expectedOrigin)
  );
}
