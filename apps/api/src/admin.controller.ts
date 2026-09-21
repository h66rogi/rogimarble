import {
  BadRequestException,
  Body,
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";
import type {
  AdminLoginResponse,
  AdminRole,
  ChannelPermission,
} from "../../../packages/contracts/src/index.ts";
import { pool, transaction } from "../../../packages/database/src/index.ts";
import { verifyPassword } from "../../../packages/database/src/password.ts";
import {
  AdminCsrfGuard,
  adminCookieValue,
  adminCsrf,
  AdminGuard,
  type AdminRequest,
  clearAdminCookie,
  newAdminCredential,
  parseAdminCookie,
  setAdminCookie,
} from "./admin-auth.ts";
import { hash } from "./auth-core.ts";
import { AdminService } from "./admin.service.ts";

const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  SUBJECT = /^[A-Za-z0-9_-]{43}$/,
  USERNAME = /^[a-z0-9][a-z0-9._-]{2,63}$/,
  CHANNEL = /^[a-z0-9][a-z0-9_-]{1,63}$/;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Request body must be an object");
  return value as Record<string, unknown>;
}
function exact(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some((key) => !keys.includes(key)))
    throw new BadRequestException("Unknown request field");
}
function text(value: unknown, name: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`Invalid ${name}`);
  return value.trim();
}
function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new BadRequestException(`Invalid ${name}`);
  return value;
}
function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 256)
    throw new BadRequestException("Password must contain 12-256 characters");
  return value;
}
function role(value: unknown): AdminRole {
  if (!["admin", "operator", "viewer"].includes(value as string))
    throw new BadRequestException("Invalid role");
  return value as AdminRole;
}
function permission(value: unknown): ChannelPermission {
  if (!["manage", "operate", "view"].includes(value as string))
    throw new BadRequestException("Invalid permission");
  return value as ChannelPermission;
}

@Injectable()
class AdminNoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader("Cache-Control", "no-store");
    return next.handle();
  }
}

@Controller("/v1/admin")
@UseInterceptors(AdminNoStoreInterceptor)
export class AdminController {
  constructor(private readonly service: AdminService) {}
  @Post("/auth/login")
  @HttpCode(200)
  async login(
    @Body() value: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminLoginResponse> {
    if (request.header("origin") !== process.env.WEB_ORIGIN)
      throw new HttpException(
        "Invalid admin login origin",
        HttpStatus.FORBIDDEN,
      );
    const body = object(value);
    exact(body, ["username", "password"]);
    const username = text(body.username, "username", 64).toLowerCase();
    if (!USERNAME.test(username))
      throw new BadRequestException("Invalid username");
    const supplied = password(body.password);
    const identityHash = hash(`admin|${username}|${request.ip}`);
    const attempt = await pool().query<{
      failed_count: number;
      blocked_until: Date | null;
    }>(
      "SELECT failed_count,blocked_until FROM admin_login_attempts WHERE identity_hash=$1",
      [identityHash],
    );
    if (
      attempt.rows[0]?.blocked_until &&
      attempt.rows[0].blocked_until > new Date()
    )
      throw new HttpException(
        "Admin login temporarily blocked",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const token = newAdminCredential(),
      csrf = adminCsrf(token),
      expires = new Date(Date.now() + 4 * 60 * 60_000);
    const authenticated = await transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1)", [734925102]);
      const found = await client.query<{
        id: string;
        username: string;
        password_hash: string;
      }>(
        "SELECT id,username,password_hash FROM operators WHERE username=$1 AND role='admin' AND disabled_at IS NULL FOR SHARE",
        [username],
      );
      if (
        !found.rowCount ||
        !(await verifyPassword(supplied, found.rows[0].password_hash))
      )
        return null;
      await client.query(
        "DELETE FROM admin_login_attempts WHERE identity_hash=$1",
        [identityHash],
      );
      await client.query(
        "INSERT INTO admin_sessions(id_hash,operator_id,csrf_hash,expires_at) VALUES($1,$2,$3,$4)",
        [hash(token), found.rows[0].id, hash(csrf), expires],
      );
      return { id: found.rows[0].id, username: found.rows[0].username };
    });
    if (!authenticated) {
      await pool().query(
        `INSERT INTO admin_login_attempts(identity_hash,failed_count,blocked_until) VALUES($1,1,NULL) ON CONFLICT(identity_hash) DO UPDATE SET failed_count=CASE WHEN admin_login_attempts.blocked_until IS NOT NULL AND admin_login_attempts.blocked_until<=now() THEN 1 ELSE admin_login_attempts.failed_count+1 END,blocked_until=CASE WHEN admin_login_attempts.blocked_until IS NOT NULL AND admin_login_attempts.blocked_until<=now() THEN NULL WHEN admin_login_attempts.failed_count+1>=5 THEN now()+interval '15 minutes' ELSE NULL END,updated_at=now()`,
        [identityHash],
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      throw new UnauthorizedException("Invalid admin credentials");
    }
    setAdminCookie(response, adminCookieValue(token), expires);
    return {
      admin: authenticated,
      csrfToken: csrf,
    };
  }
  @Get("/auth/session")
  @UseGuards(AdminGuard)
  session(@Req() request: AdminRequest): AdminLoginResponse {
    return {
      admin: { id: request.admin!.id, username: request.admin!.username },
      csrfToken: adminCsrf(request.adminToken!),
    };
  }
  @Post("/auth/logout")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  @HttpCode(204)
  async logout(
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = parseAdminCookie(request.headers.cookie);
    if (token)
      await pool().query("DELETE FROM admin_sessions WHERE id_hash=$1", [
        hash(token),
      ]);
    clearAdminCookie(response);
  }
  @Post("/auth/password")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  @HttpCode(204)
  async changePassword(
    @Req() request: AdminRequest,
    @Body() value: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const body = object(value);
    exact(body, ["currentPassword", "newPassword"]);
    await this.service.changeOwnPassword(
      request.admin!,
      password(body.currentPassword),
      password(body.newPassword),
    );
    clearAdminCookie(response);
  }
  @Get("/operators") @UseGuards(AdminGuard) operators() {
    return this.service.operators();
  }
  @Post("/operators")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  createOperator(@Req() req: AdminRequest, @Body() value: unknown) {
    const body = object(value);
    exact(body, ["username", "password", "role"]);
    const username = text(body.username, "username", 64).toLowerCase();
    if (!USERNAME.test(username))
      throw new BadRequestException("Invalid username");
    return this.service.createOperator(req.admin!, {
      username,
      password: password(body.password),
      role: role(body.role),
    });
  }
  @Patch("/operators/:id")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  updateOperator(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() value: unknown,
  ) {
    uuid(id, "operator id");
    const body = object(value);
    exact(body, ["role", "disabled"]);
    if (!Object.keys(body).length)
      throw new BadRequestException("No operator changes supplied");
    if (body.disabled !== undefined && typeof body.disabled !== "boolean")
      throw new BadRequestException("Invalid disabled");
    return this.service.updateOperator(req.admin!, id, {
      ...(body.role !== undefined ? { role: role(body.role) } : {}),
      ...(body.disabled !== undefined ? { disabled: body.disabled } : {}),
    });
  }
  @Post("/operators/:id/reset-password")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  @HttpCode(204)
  resetPassword(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() value: unknown,
  ) {
    uuid(id, "operator id");
    const body = object(value);
    exact(body, ["password"]);
    return this.service.resetPassword(req.admin!, id, password(body.password));
  }
  @Get("/channels") @UseGuards(AdminGuard) channels() {
    return this.service.channels();
  }
  @Post("/channels")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  createChannel(@Req() req: AdminRequest, @Body() value: unknown) {
    const body = object(value);
    exact(body, ["id", "displayName", "ownerOperatorId"]);
    const id = text(body.id, "channel id", 64);
    if (!CHANNEL.test(id)) throw new BadRequestException("Invalid channel id");
    return this.service.createChannel(req.admin!, {
      id,
      displayName: text(body.displayName, "display name"),
      ownerOperatorId: uuid(body.ownerOperatorId, "owner operator id"),
    });
  }
  @Patch("/channels/:id")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  @HttpCode(204)
  renameChannel(
    @Req() req: AdminRequest,
    @Param("id") id: string,
    @Body() value: unknown,
  ) {
    if (!CHANNEL.test(id)) throw new BadRequestException("Invalid channel id");
    const body = object(value);
    exact(body, ["displayName"]);
    return this.service.renameChannel(
      req.admin!,
      id,
      text(body.displayName, "display name"),
    );
  }
  @Put("/channels/:channelId/members/:operatorId")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  @HttpCode(204)
  putMember(
    @Req() req: AdminRequest,
    @Param("channelId") channelId: string,
    @Param("operatorId") operatorId: string,
    @Body() value: unknown,
  ) {
    if (!CHANNEL.test(channelId))
      throw new BadRequestException("Invalid channel id");
    uuid(operatorId, "operator id");
    const body = object(value);
    exact(body, ["permission"]);
    return this.service.putMember(
      req.admin!,
      channelId,
      operatorId,
      permission(body.permission),
    );
  }
  @Delete("/channels/:channelId/members/:operatorId")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  @HttpCode(204)
  deleteMember(
    @Req() req: AdminRequest,
    @Param("channelId") channelId: string,
    @Param("operatorId") operatorId: string,
  ) {
    if (!CHANNEL.test(channelId))
      throw new BadRequestException("Invalid channel id");
    uuid(operatorId, "operator id");
    return this.service.deleteMember(req.admin!, channelId, operatorId);
  }
  @Get("/external-bindings") @UseGuards(AdminGuard) bindings() {
    return this.service.bindings();
  }
  @Post("/external-bindings")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  createBinding(@Req() req: AdminRequest, @Body() value: unknown) {
    const body = object(value);
    exact(body, ["issuer", "subject", "operatorId"]);
    if (
      body.issuer !== "rogichat" ||
      typeof body.subject !== "string" ||
      !SUBJECT.test(body.subject)
    )
      throw new BadRequestException("Invalid external binding");
    return this.service.createBinding(req.admin!, {
      issuer: "rogichat",
      subject: body.subject,
      operatorId: uuid(body.operatorId, "operator id"),
    });
  }
  @Delete("/external-bindings/:issuer/:subject")
  @UseGuards(AdminGuard, AdminCsrfGuard)
  @HttpCode(204)
  deleteBinding(
    @Req() req: AdminRequest,
    @Param("issuer") issuer: string,
    @Param("subject") subject: string,
  ) {
    if (issuer !== "rogichat" || !SUBJECT.test(subject))
      throw new BadRequestException("Invalid external binding");
    return this.service.deleteBinding(req.admin!, issuer, subject);
  }
  @Get("/audit")
  @UseGuards(AdminGuard)
  audit(
    @Query("limit") rawLimit?: string,
    @Query("cursor") rawCursor?: string,
  ) {
    const limit = rawLimit === undefined ? 100 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      throw new BadRequestException("Invalid audit limit");
    let cursor: { createdAt: Date; id: string } | null = null;
    if (rawCursor) {
      let decoded = "";
      try {
        decoded = Buffer.from(rawCursor, "base64url").toString("utf8");
      } catch {
        throw new BadRequestException("Invalid audit cursor");
      }
      const separator = decoded.lastIndexOf("|");
      const createdAt = new Date(decoded.slice(0, separator));
      const id = decoded.slice(separator + 1);
      if (separator < 1 || Number.isNaN(createdAt.getTime()) || !UUID.test(id))
        throw new BadRequestException("Invalid audit cursor");
      cursor = { createdAt, id };
    }
    return this.service.auditLog(limit, cursor);
  }
}
