import { createHmac, randomBytes } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { pool } from "../../../packages/database/src/index.ts";
import { hash } from "./auth-core.ts";

const COOKIE = "rogimarble_admin_session";
function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || Buffer.byteLength(value) < 32)
    throw new Error("SESSION_SECRET must contain at least 32 bytes");
  return value;
}
const sign = (token: string) =>
  createHmac("sha256", secret()).update(`admin\0${token}`).digest("base64url");
export const adminCsrf = (token: string) =>
  createHmac("sha256", secret())
    .update(`admin-csrf\0${token}`)
    .digest("base64url");
export function adminCookieValue(token: string): string {
  return `${token}.${sign(token)}`;
}
export function parseAdminCookie(header: string | undefined): string | null {
  const prefix = `${COOKIE}=`;
  const values = (header ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(prefix))
    .map((v) => v.slice(prefix.length));
  if (values.length !== 1) return null;
  const [token, signature, ...rest] = values[0].split(".");
  return token && signature && !rest.length && sign(token) === signature
    ? token
    : null;
}
export function setAdminCookie(
  response: Response,
  value: string,
  expires: Date,
) {
  response.cookie(COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE !== "false",
    path: "/",
    expires,
  });
}
export function clearAdminCookie(response: Response) {
  response.clearCookie(COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE !== "false",
    path: "/",
  });
}
export const newAdminCredential = () => randomBytes(32).toString("base64url");
export interface AdminRequest extends Request {
  admin?: { id: string; username: string; csrfHash: string };
  adminToken?: string;
}

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = parseAdminCookie(request.headers.cookie);
    if (!token) throw new UnauthorizedException("Admin login required");
    const found = await pool().query<{
      id: string;
      username: string;
      csrf_hash: string;
    }>(
      `SELECT o.id,o.username,s.csrf_hash FROM admin_sessions s JOIN operators o ON o.id=s.operator_id WHERE s.id_hash=$1 AND s.expires_at>now() AND o.role='admin' AND o.disabled_at IS NULL`,
      [hash(token)],
    );
    if (!found.rowCount)
      throw new UnauthorizedException("Admin session expired");
    request.admin = {
      id: found.rows[0].id,
      username: found.rows[0].username,
      csrfHash: found.rows[0].csrf_hash,
    };
    request.adminToken = token;
    return true;
  }
}
@Injectable()
export class AdminCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = request.header("x-csrf-token");
    if (
      !request.admin ||
      !token ||
      hash(token) !== request.admin.csrfHash ||
      request.header("origin") !== process.env.WEB_ORIGIN
    )
      throw new ForbiddenException("Invalid admin CSRF token");
    return true;
  }
}
