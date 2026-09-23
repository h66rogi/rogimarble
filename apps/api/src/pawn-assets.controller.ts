import { BadRequestException,Body,Controller,Delete,Get,Header,Param,Put,Query,Req,Res,UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PAWN_STYLE_IDS, type PawnAppearanceDto, type PawnStyleId } from '../../../packages/contracts/src/index.ts';
import { AuthenticatedRequest,CsrfGuard,SessionGuard } from './auth.ts';
import { normalizePawnImage,PawnAssetService,readImageBody } from './pawn-assets.ts';

@Controller()
export class PawnAssetsController {
  constructor(private readonly assets:PawnAssetService){}
  @Get('/v1/channels/:channelId/pawn-image') @UseGuards(SessionGuard)
  current(@Req() request:AuthenticatedRequest,@Param('channelId') channelId:string):Promise<PawnAppearanceDto>{return this.assets.current(request.operator!,channelId);}
  @Put('/v1/channels/:channelId/pawn-image') @UseGuards(SessionGuard,CsrfGuard)
  async upload(@Req() request:AuthenticatedRequest,@Param('channelId') channelId:string,@Query('expectedRevision') rawRevision:string|undefined):Promise<PawnAppearanceDto>{
    const expectedRevision=parseRevision(rawRevision);await this.assets.assertWrite(request.operator!,channelId);const contentType=(request.header('content-type')??'').split(';',1)[0].toLowerCase();
    return this.assets.upload(request.operator!,channelId,expectedRevision,await normalizePawnImage(await readImageBody(request),contentType));
  }
  @Delete('/v1/channels/:channelId/pawn-image') @UseGuards(SessionGuard,CsrfGuard)
  remove(@Req() request:AuthenticatedRequest,@Param('channelId') channelId:string,@Query('expectedRevision') rawRevision:string|undefined):Promise<PawnAppearanceDto>{return this.assets.remove(request.operator!,channelId,parseRevision(rawRevision));}
  @Put('/v1/channels/:channelId/pawn-style') @UseGuards(SessionGuard,CsrfGuard)
  selectStyle(@Req() request:AuthenticatedRequest,@Param('channelId') channelId:string,@Body() body:unknown):Promise<PawnAppearanceDto>{
    if(!body||typeof body!=='object'||Array.isArray(body))throw new BadRequestException('Pawn style selection is required');
    const input=body as Record<string,unknown>;
    if(!Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<0)throw new BadRequestException('expectedRevision must be a non-negative integer');
    if(!PAWN_STYLE_IDS.some(id=>id===input.styleId))throw new BadRequestException('Unknown pawn style');
    return this.assets.selectStyle(request.operator!,channelId,input.expectedRevision as number,input.styleId as PawnStyleId);
  }
  @Get('/v1/pawn-assets/:assetId') @Header('Cache-Control','public, max-age=0, must-revalidate') @Header('X-Content-Type-Options','nosniff')
  async image(@Param('assetId') assetId:string,@Res() response:Response):Promise<void>{const asset=await this.assets.bytes(assetId);response.type(asset.mimeType).send(asset.bytes);}
}
function parseRevision(value:string|undefined):number{const revision=Number(value);if(value===undefined||!Number.isSafeInteger(revision)||revision<0)throw new BadRequestException('expectedRevision must be a non-negative integer');return revision;}
