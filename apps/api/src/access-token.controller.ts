import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { Response } from "express";
import type {
  IssueAccessTokenRequest,
  TokenLoginRequest,
} from "../../../packages/contracts/src/index.ts";
import { AccessTokenService } from "./access-token.service.ts";
import {
  AuthenticatedRequest,
  CsrfGuard,
  SessionGuard,
  setSessionCookie,
} from "./auth.ts";

@Controller("/v1/auth")
export class AccessTokenController {
  constructor(private readonly tokens: AccessTokenService) {}
  @Post("/token")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async exchange(
    @Body() body: TokenLoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (
      process.env.WEB_ORIGIN &&
      request.header("origin") !== process.env.WEB_ORIGIN
    )
      throw new ForbiddenException("Invalid login origin");
    const result = await this.tokens.exchange(body?.token);
    setSessionCookie(response, result.cookie, result.expires);
    return result.body;
  }
  @Get("/tokens")
  @UseGuards(SessionGuard)
  @Header("Cache-Control", "no-store")
  list(@Req() request: AuthenticatedRequest) {
    return this.tokens.list(request.operator!.id);
  }
  @Post("/tokens") @Header("Cache-Control", "no-store") @UseGuards(SessionGuard, CsrfGuard) issue(
    @Req() request: AuthenticatedRequest,
    @Body() body: IssueAccessTokenRequest,
  ) {
    return this.tokens.issue(
      request.operator!.id,
      body?.label,
      body?.expiresAt,
    );
  }
  @Delete("/tokens/:id")
  @UseGuards(SessionGuard, CsrfGuard)
  @HttpCode(204)
  revoke(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.tokens.revoke(request.operator!.id, id);
  }
}
