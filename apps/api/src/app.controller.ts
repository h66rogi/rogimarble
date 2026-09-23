import { Body, Controller, Delete, Get, Header, Headers, HttpCode, HttpException, HttpStatus, Param, Patch, Post, Put, Query, Req, Res, ServiceUnavailableException, Sse, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthConfigResponse, AuthSessionResponse, CreateSessionRequest, LoginRequest, LoginResponse, SessionCommandRequest } from '../../../packages/contracts/src/index.ts';
import { pool, transaction } from '../../../packages/database/src/index.ts';
import { hashPassword, verifyPassword } from '../../../packages/database/src/password.ts';
import { ApiService } from './api.service.ts';
import { ConfigurationService } from './configuration.service.ts';
import { AuthenticatedRequest, clearSessionCookie, CsrfGuard, hash, localCsrfToken, newCredential, readSessionCookie, SessionGuard, sessionCookieValue, setSessionCookie } from './auth.ts';
import { OverlayLayoutService } from './overlay-layout.ts';
import { OperatorFeedRealtimeService } from './operator-feed-realtime.ts';

@Controller()
export class AppController {
  constructor(private readonly api: ApiService,private readonly configuration:ConfigurationService,private readonly overlayLayout:OverlayLayoutService,private readonly feedRealtime:OperatorFeedRealtimeService) {}
  @Get('/health') health() { return { status: 'ok' }; }
  @Get('/ready') async ready() {
    try { const result=await pool().query('SELECT 1 FROM schema_migrations WHERE version=$1', ['017_home_actions_history.sql']);
      if(!result.rowCount)throw new Error('required migration missing');
      await pool().query('SELECT 1 FROM collector_donation_inbox LIMIT 0');await pool().query('SELECT 1 FROM pawn_assets LIMIT 0');await pool().query('SELECT style_id FROM channel_pawn_appearances LIMIT 0');await pool().query('SELECT 1 FROM channel_live_overlay_layouts LIMIT 0');await pool().query('SELECT token_value FROM obs_access_tokens LIMIT 0'); return { status:'ready',schemaVersion:'017_home_actions_history.sql' }; }
    catch { throw new ServiceUnavailableException('Database or migrations are not ready'); }
  }
  @Post('/v1/auth/login') @HttpCode(200) @Header('Cache-Control','no-store')
  async login(@Body() body:LoginRequest,@Req() request:Request,@Res({passthrough:true}) response:Response):Promise<LoginResponse>{
    if(process.env.PASSWORD_RECOVERY_ENABLED!=='true')throw new HttpException('Password recovery login is disabled',HttpStatus.FORBIDDEN);
    if(process.env.WEB_ORIGIN && request.header('origin')!==process.env.WEB_ORIGIN)throw new HttpException('Invalid login origin',HttpStatus.FORBIDDEN);
    if(typeof body?.username!=='string'||typeof body?.password!=='string'||body.username.length>80||body.password.length>1024)throw new UnauthorizedException('Invalid credentials');
    const username=body.username.trim().toLowerCase();
    const identityHash=hash(`${username}|${request.ip}`);
    const result=await transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`login:${identityHash}`]);
      const attempt=await client.query<{failed_count:number;blocked_until:Date|null}>('SELECT failed_count,blocked_until FROM login_attempts WHERE identity_hash=$1',[identityHash]);
      if(attempt.rows[0]?.blocked_until&&attempt.rows[0].blocked_until>new Date())return {failure:429 as const};
      const found=await client.query<{id:string;username:string;password_hash:string;role:'admin'|'operator'|'viewer'}>('SELECT id,username,password_hash,role FROM operators WHERE username=$1 AND disabled_at IS NULL FOR UPDATE',[username]);
      if(!found.rowCount||found.rows[0].role!=='admin'||!await verifyPassword(body.password,found.rows[0].password_hash)){
        await client.query(`INSERT INTO login_attempts(identity_hash,failed_count,blocked_until) VALUES($1,1,NULL)
          ON CONFLICT(identity_hash) DO UPDATE SET
          failed_count=CASE WHEN login_attempts.blocked_until<now() THEN 1 ELSE login_attempts.failed_count+1 END,
          blocked_until=CASE WHEN login_attempts.blocked_until<now() THEN NULL WHEN login_attempts.failed_count+1>=5 THEN now()+interval '15 minutes' ELSE NULL END,updated_at=now()`,[identityHash]);
        return {failure:401 as const};
      }
      await client.query('DELETE FROM login_attempts WHERE identity_hash=$1',[identityHash]);
      const token=newCredential(),csrf=localCsrfToken(token),expires=new Date(Date.now()+8*60*60_000);
      await client.query('INSERT INTO auth_sessions(id_hash,operator_id,csrf_hash,expires_at) VALUES($1,$2,$3,$4)',[hash(token),found.rows[0].id,hash(csrf),expires]);
      return {token,csrf,expires,operator:{id:found.rows[0].id,username:found.rows[0].username,role:found.rows[0].role}};
    });
    if('failure'in result){if(result.failure===429)throw new HttpException('Login temporarily blocked',HttpStatus.TOO_MANY_REQUESTS);await new Promise(resolve=>setTimeout(resolve,250));throw new UnauthorizedException('Invalid credentials');}
    setSessionCookie(response,sessionCookieValue(result.token),result.expires);
    return {operator:result.operator,csrfToken:result.csrf,authMode:'local'};
  }
  @Get('/v1/auth/config') config():AuthConfigResponse{return{mode:'token',loginUrl:null,localLoginEnabled:false};}
  @Get('/v1/auth/session') @UseGuards(SessionGuard) @Header('Cache-Control','no-store') @Header('Pragma','no-cache')
  async authSession(@Req() request:AuthenticatedRequest):Promise<AuthSessionResponse>{
    let csrfToken=request.csrfToken;
    if(request.authMode==='local'||request.authMode==='token'){const token=readSessionCookie(request);if(!token)throw new UnauthorizedException('Login required');csrfToken=localCsrfToken(token);if(request.operator!.csrfHash!==hash(csrfToken))await pool().query('UPDATE auth_sessions SET csrf_hash=$2 WHERE id_hash=$1',[hash(token),hash(csrfToken)]);}
    return{operator:{id:request.operator!.id,username:request.operator!.username,role:request.operator!.role},csrfToken:csrfToken!,authMode:request.authMode};
  }
  @Post('/v1/auth/logout') @UseGuards(SessionGuard,CsrfGuard) @HttpCode(204)
  async logout(@Req() request:AuthenticatedRequest,@Res({passthrough:true}) response:Response):Promise<void>{const token=readSessionCookie(request);if(token)await pool().query('DELETE FROM auth_sessions WHERE id_hash=$1',[hash(token)]);clearSessionCookie(response);}
  @Post('/v1/auth/password') @UseGuards(SessionGuard,CsrfGuard) @HttpCode(200)
  async password(@Req() request:AuthenticatedRequest,@Body() body:{currentPassword?:unknown;newPassword?:unknown}) {
    if(request.authMode!=='local')throw new HttpException('비밀번호 변경은 관리자 복구 세션에서만 사용할 수 있습니다.',HttpStatus.CONFLICT);
    if(typeof body?.currentPassword!=='string'||typeof body?.newPassword!=='string'||body.newPassword.length<12||body.newPassword.length>128||body.currentPassword.length>1024)
      throw new HttpException('새 비밀번호는 12~128자로 입력하세요.',HttpStatus.BAD_REQUEST);
    const currentPassword=body.currentPassword,nextPassword=body.newPassword;
    const identityHash=hash(`password-change|${request.operator!.id}`);
    const attempt=await pool().query<{blocked_until:Date|null}>('SELECT blocked_until FROM login_attempts WHERE identity_hash=$1',[identityHash]);
    if(attempt.rows[0]?.blocked_until&&attempt.rows[0].blocked_until>new Date())throw new HttpException('잠시 후 다시 시도하세요.',HttpStatus.TOO_MANY_REQUESTS);
    const token=readSessionCookie(request)!;
    const changed=await transaction(async client=>{
      const account=await client.query<{password_hash:string}>('SELECT password_hash FROM operators WHERE id=$1 AND disabled_at IS NULL FOR UPDATE',[request.operator!.id]);
      if(!account.rowCount||!await verifyPassword(currentPassword,account.rows[0].password_hash))return false;
      await client.query('UPDATE operators SET password_hash=$2 WHERE id=$1',[request.operator!.id,await hashPassword(nextPassword)]);
      await client.query('DELETE FROM auth_sessions WHERE operator_id=$1 AND id_hash<>$2',[request.operator!.id,hash(token)]);
      return true;
    });
    if(!changed){
      await pool().query(`INSERT INTO login_attempts(identity_hash,failed_count,blocked_until) VALUES($1,1,NULL)
        ON CONFLICT(identity_hash) DO UPDATE SET failed_count=login_attempts.failed_count+1,
        blocked_until=CASE WHEN login_attempts.failed_count+1>=5 THEN now()+interval '15 minutes' ELSE NULL END,updated_at=now()`,[identityHash]);
      throw new UnauthorizedException('현재 비밀번호를 확인하세요.');
    }
    await pool().query('DELETE FROM login_attempts WHERE identity_hash=$1',[identityHash]);
    return {changed:true};
  }
  @Get('/v1/channels/:channelId/operator-state') @UseGuards(SessionGuard)
  state(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string){return this.api.state(req.operator!,channelId);}
  @Get('/v1/channels/:channelId/overlay-layout/live') @UseGuards(SessionGuard) @Header('Cache-Control','no-store')
  liveOverlayLayout(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string){return this.overlayLayout.get(req.operator!,channelId);}
  @Put('/v1/channels/:channelId/overlay-layout/live') @UseGuards(SessionGuard,CsrfGuard) @Header('Cache-Control','no-store')
  putLiveOverlayLayout(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Body() body:unknown){return this.overlayLayout.put(req.operator!,channelId,body);}
  @Get('/v1/channels/:channelId/board-versions/runnable') @UseGuards(SessionGuard)
  boards(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string){return this.api.runnableBoards(req.operator!,channelId);}
  @Post('/v1/channels/:channelId/sessions') @UseGuards(SessionGuard,CsrfGuard)
  create(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Body() body:CreateSessionRequest){return this.api.createSession(req.operator!,channelId,body);}
  @Post('/v1/channels/:channelId/sessions/:sessionId/commands') @UseGuards(SessionGuard,CsrfGuard)
  command(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('sessionId') sessionId:string,@Body() body:SessionCommandRequest){return this.api.command(req.operator!,channelId,sessionId,body);}
  @Get('/v1/channels/:channelId/sessions/:sessionId/inventory-ledger') @UseGuards(SessionGuard)
  inventoryLedger(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('sessionId') sessionId:string){return this.api.inventoryLedger(req.operator!,channelId,sessionId);}
  @Get('/v1/channels/:channelId/sessions/:sessionId/history') @UseGuards(SessionGuard)
  sessionHistory(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('sessionId') sessionId:string,@Query() query:unknown){return this.api.sessionHistory(req.operator!,channelId,sessionId,query);}
  @Get('/v1/channels/:channelId/sessions/:sessionId/missions') @UseGuards(SessionGuard)
  missions(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('sessionId') sessionId:string){return this.api.missions(req.operator!,channelId,sessionId);}
  @Get('/v1/channels/:channelId/commands/:commandId') @UseGuards(SessionGuard)
  getCommand(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('commandId') commandId:string){return this.api.getCommand(req.operator!,channelId,commandId);}
  @Get('/v1/channels/:channelId/config/:kind') @UseGuards(SessionGuard)
  configState(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('kind') kind:string){return this.configuration.state(req.operator!,channelId,kind);}
  @Post('/v1/channels/:channelId/config/:kind') @UseGuards(SessionGuard,CsrfGuard)
  createConfig(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('kind') kind:string,@Body() body:unknown){return this.configuration.create(req.operator!,channelId,kind,body);}
  @Put('/v1/channels/:channelId/config/:kind/:versionId') @UseGuards(SessionGuard,CsrfGuard)
  updateConfig(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('kind') kind:string,@Param('versionId') id:string,@Body() body:unknown){return this.configuration.update(req.operator!,channelId,kind,id,body);}
  @Post('/v1/channels/:channelId/config/:kind/:versionId/validate') @UseGuards(SessionGuard,CsrfGuard)
  validateConfig(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('kind') kind:string,@Param('versionId') id:string,@Body() body:unknown){return this.configuration.validate(req.operator!,channelId,kind,id,body);}
  @Post('/v1/channels/:channelId/config/:kind/:versionId/publish') @UseGuards(SessionGuard,CsrfGuard)
  publishConfig(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('kind') kind:string,@Param('versionId') id:string,@Body() body:unknown){return this.configuration.publish(req.operator!,channelId,kind,id,body);}
  @Get('/v1/channels/:channelId/donations') @UseGuards(SessionGuard)
  donations(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Query() query:unknown){return this.configuration.donations(req.operator!,channelId,query);}
  @Get('/v1/channels/:channelId/chats') @UseGuards(SessionGuard) @Header('Cache-Control','no-store')
  chats(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Query() query:unknown){return this.configuration.chats(req.operator!,channelId,query);}
  @Sse('/v1/channels/:channelId/feed/events') @UseGuards(SessionGuard) @Header('Cache-Control','no-store')
  async feedEvents(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string){await this.configuration.access(req.operator!,channelId);return this.feedRealtime.stream(channelId);}
  @Get('/v1/channels/:channelId/operations') @UseGuards(SessionGuard)
  operations(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Query() query:unknown){return this.configuration.operations(req.operator!,channelId,query);}
  @Get('/v1/channels/:channelId/overlay-token') @UseGuards(SessionGuard) @Header('Cache-Control','no-store')
  overlayToken(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string){return this.configuration.overlayToken(req.operator!,channelId);}
  @Patch('/v1/channels/:channelId/overlay-token/rotate') @UseGuards(SessionGuard,CsrfGuard) @Header('Cache-Control','no-store')
  rotateOverlayToken(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Body() body:{expectedTokenId?:unknown}){return this.configuration.rotateOverlayToken(req.operator!,channelId,body);}
  @Get('/v1/overlay/state') @Header('Cache-Control','no-store')
  overlayState(@Headers('authorization') authorization:string|undefined){return this.configuration.overlay(authorization);}
}
