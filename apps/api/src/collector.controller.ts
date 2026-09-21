import { Controller,Get,Param,Req,UseGuards } from '@nestjs/common';
import { SessionGuard,type AuthenticatedRequest } from './auth.ts';
import { ApiService } from './api.service.ts';
import { CollectorService } from './collector.service.ts';

@Controller()
export class CollectorController {
  constructor(private readonly collector:CollectorService,private readonly api:ApiService){}
  @Get('/v1/channels/:channelId/collector') @UseGuards(SessionGuard)
  async status(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string){
    await this.api.assertAccess(req.operator!,channelId);
    return this.collector.status(channelId);
  }
}
