import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { CsrfGuard, SessionGuard, type AuthenticatedRequest } from "./auth.ts";
import { ApiService } from "./api.service.ts";
import { CollectorService } from "./collector.service.ts";

@Controller()
export class CollectorController {
  constructor(
    private readonly collector: CollectorService,
    private readonly api: ApiService,
  ) {}
  @Get("/v1/channels/:channelId/collector")
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard)
  async status(
    @Req() req: AuthenticatedRequest,
    @Param("channelId") channelId: string,
  ) {
    const permission = await this.api.assertAccess(req.operator!, channelId);
    const state = await this.collector.status(channelId);
    return {
      ...state,
      canCheckBroadcast:
        "collectorChannelId" in state &&
        req.operator!.role !== "viewer" &&
        permission !== "view",
    };
  }
  @Post("/v1/channels/:channelId/collector/broadcast-check")
  @Header("Cache-Control", "no-store")
  @UseGuards(SessionGuard, CsrfGuard)
  async check(
    @Req() req: AuthenticatedRequest,
    @Param("channelId") channelId: string,
    @Body() body: unknown,
  ) {
    await this.api.assertAccess(req.operator!, channelId, true);
    return this.collector.checkBroadcast(
      channelId,
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).targetChannelId
        : undefined,
    );
  }
}
