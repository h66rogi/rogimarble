import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { pool } from "../../../packages/database/src/index.ts";
import { hash, localCsrfToken, validCsrf } from "./auth-core.ts";
export { hash, localCsrfToken } from "./auth-core.ts";

export interface AuthenticatedRequest extends Request {
  operator?: {
    id: string;
    username: string;
    role: "admin" | "operator" | "viewer";
    csrfHash: string;
  };
  authMode?: "local" | "token";
  csrfToken?: string;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || Buffer.byteLength(value) < 32)
    throw new Error("SESSION_SECRET must contain at least 32 bytes");
  return value;
}
const sign = (token: string): string =>
  createHmac("sha256", secret()).update(token).digest("base64url");

export function sessionCookieValue(token: string): string {
  return `${token}.${sign(token)}`;
}
const SESSION_COOKIE_PREFIX = "rogimarble_session=";
function cookieValues(header: string | undefined, name: string): string[] {
  const prefix = `${name}=`;
  return (header ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(prefix))
    .map((v) => v.slice(prefix.length));
}
export function parseSessionCookie(header: string | undefined): string | null {
  const matches = cookieValues(header, SESSION_COOKIE_PREFIX.slice(0, -1));
  if (matches.length !== 1) return null;
  const encoded = matches[0];
  if (!encoded) return null;
  const parts = encoded.split(".");
  if (parts.length !== 2) return null;
  const [token, signature] = parts;
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    return null;
  if (!timingSafeEqual(Buffer.from(sign(token)), Buffer.from(signature)))
    return null;
  return token;
}
export function readSessionCookie(request: Request): string | null {
  return parseSessionCookie(request.headers.cookie);
}
export function setSessionCookie(
  response: Response,
  value: string,
  expires: Date,
): void {
  const secure = process.env.COOKIE_SECURE !== "false";
  response.cookie("rogimarble_session", value, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    expires,
  });
}
export function clearSessionCookie(response: Response): void {
  response.clearCookie("rogimarble_session", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE !== "false",
    path: "/",
  });
}
export function newCredential(): string {
  return randomBytes(32).toString("base64url");
}
@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request);
    if (!token) throw new UnauthorizedException("Login required");
    const result = await pool().query<{
      id: string;
      username: string;
      role: "admin" | "operator" | "viewer";
      csrf_hash: string;
      access_token_id: string | null;
    }>(
      `SELECT o.id,o.username,o.role,s.csrf_hash,s.access_token_id FROM auth_sessions s JOIN operators o ON o.id=s.operator_id
       LEFT JOIN operator_access_tokens t ON t.id=s.access_token_id
       WHERE s.id_hash=$1 AND s.expires_at>now() AND o.disabled_at IS NULL
         AND (s.access_token_id IS NULL OR (t.revoked_at IS NULL AND t.expires_at>now()))`,
      [hash(token)],
    );
    if (!result.rowCount) throw new UnauthorizedException("Session expired");
    request.operator = {
      ...result.rows[0],
      csrfHash: result.rows[0].csrf_hash,
    };
    request.authMode = result.rows[0].access_token_id ? "token" : "local";
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.header("x-csrf-token");
    if (
      !request.operator ||
      !validCsrf(
        request.operator.csrfHash,
        token,
        request.authMode,
        request.header("origin"),
        process.env.WEB_ORIGIN,
      )
    )
      throw new ForbiddenException("Invalid CSRF token");
    return true;
  }
}
