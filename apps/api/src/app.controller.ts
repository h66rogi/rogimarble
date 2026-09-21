import { Body, Controller, Get, Header, HttpCode, HttpException, HttpStatus, Param, Post, Req, Res, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthConfigResponse, AuthSessionResponse, CreateSessionRequest, LoginRequest, LoginResponse, SessionCommandRequest } from '../../../packages/contracts/src/index.ts';
import { pool } from '../../../packages/database/src/index.ts';
import { verifyPassword } from '../../../packages/database/src/password.ts';
import { ApiService } from './api.service.ts';
import { authMode, AuthenticatedRequest, clearSessionCookie, CsrfGuard, hash, localCsrfToken, newCredential, readSessionCookie, SessionGuard, sessionCookieValue, setSessionCookie } from './auth.ts';

@Controller()
export class AppController {
  constructor(private readonly api: ApiService) {}
  @Get('/health') health() { return { status: 'ok' }; }
  @Get('/ready') async ready() {
    try { const result=await pool().query('SELECT 1 FROM schema_migrations WHERE version=$1', ['004_admin_console.sql']);
      if(!result.rowCount)throw new Error('required migration missing');
      await pool().query('SELECT id FROM admin_audit_log LIMIT 0'); return { status:'ready',schemaVersion:'004_admin_console.sql' }; }
    catch { throw new ServiceUnavailableException('Database or migrations are not ready'); }
  }
  @Post('/v1/auth/login') @HttpCode(200)
  async login(@Body() body:LoginRequest,@Req() request:Request,@Res({passthrough:true}) response:Response):Promise<LoginResponse>{
    if(authMode()==='shared')throw new HttpException('Password login is disabled in shared authentication mode',HttpStatus.FORBIDDEN);
    const username=typeof body?.username==='string'?body.username.trim().toLowerCase():'';
    const identityHash=hash(`${username}|${request.ip}`);
    const attempt=await pool().query<{failed_count:number;blocked_until:Date|null}>('SELECT failed_count,blocked_until FROM login_attempts WHERE identity_hash=$1',[identityHash]);
    if(attempt.rows[0]?.blocked_until&&attempt.rows[0].blocked_until>new Date()) throw new HttpException('Login temporarily blocked',HttpStatus.TOO_MANY_REQUESTS);
    const found=await pool().query<{id:string;username:string;password_hash:string;role:'admin'|'operator'|'viewer'}>('SELECT id,username,password_hash,role FROM operators WHERE username=$1 AND disabled_at IS NULL',[username]);
    const valid=found.rowCount?await verifyPassword(body?.password??'',found.rows[0].password_hash):false;
    if(!valid){const failures=(attempt.rows[0]?.failed_count??0)+1;const blocked=failures>=5?new Date(Date.now()+15*60_000):null;
      await pool().query(`INSERT INTO login_attempts(identity_hash,failed_count,blocked_until) VALUES($1,$2,$3)
        ON CONFLICT(identity_hash) DO UPDATE SET failed_count=$2,blocked_until=$3,updated_at=now()`,[identityHash,failures,blocked]);
      await new Promise(resolve=>setTimeout(resolve,250)); throw new UnauthorizedException('Invalid credentials');}
    await pool().query('DELETE FROM login_attempts WHERE identity_hash=$1',[identityHash]);
    const token=newCredential(),csrf=newCredential(),expires=new Date(Date.now()+8*60*60_000);
    await pool().query('INSERT INTO auth_sessions(id_hash,operator_id,csrf_hash,expires_at) VALUES($1,$2,$3,$4)',[hash(token),found.rows[0].id,hash(csrf),expires]);
    setSessionCookie(response,sessionCookieValue(token),expires);
    return {operator:{id:found.rows[0].id,username:found.rows[0].username,role:found.rows[0].role},csrfToken:csrf};
  }
  @Get('/v1/auth/config') config():AuthConfigResponse{if(authMode()==='shared'){const enabled=process.env.ROGICHAT_SHARED_LOGIN_READY==='true';return{mode:'shared',loginUrl:enabled?'https://rogi.chat':null,sharedCookieEnabled:enabled,message:enabled?null:'RogiChat shared login is being prepared'};}return{mode:'local',loginUrl:null,sharedCookieEnabled:false,message:null};}
  @Get('/v1/auth/session') @UseGuards(SessionGuard) @Header('Cache-Control','no-store') @Header('Pragma','no-cache')
  async authSession(@Req() request:AuthenticatedRequest):Promise<AuthSessionResponse>{
    let csrfToken=request.csrfToken;
    if(request.authMode==='local'){const token=readSessionCookie(request);if(!token)throw new UnauthorizedException('Login required');csrfToken=localCsrfToken(token);if(request.operator!.csrfHash!==hash(csrfToken))await pool().query('UPDATE auth_sessions SET csrf_hash=$2 WHERE id_hash=$1',[hash(token),hash(csrfToken)]);}
    return{operator:{id:request.operator!.id,username:request.operator!.username,role:request.operator!.role},csrfToken:csrfToken!};
  }
  @Post('/v1/auth/logout') @UseGuards(SessionGuard,CsrfGuard) @HttpCode(204)
  async logout(@Req() request:AuthenticatedRequest,@Res({passthrough:true}) response:Response):Promise<void>{if(request.authMode==='shared')throw new HttpException('Sign out at https://rogi.chat',HttpStatus.CONFLICT);const token=readSessionCookie(request);if(token)await pool().query('DELETE FROM auth_sessions WHERE id_hash=$1',[hash(token)]);clearSessionCookie(response);}
  @Get('/v1/channels/:channelId/operator-state') @UseGuards(SessionGuard)
  state(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string){return this.api.state(req.operator!,channelId);}
  @Get('/v1/channels/:channelId/board-versions/runnable') @UseGuards(SessionGuard)
  boards(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string){return this.api.runnableBoards(req.operator!,channelId);}
  @Post('/v1/channels/:channelId/sessions') @UseGuards(SessionGuard,CsrfGuard)
  create(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Body() body:CreateSessionRequest){return this.api.createSession(req.operator!,channelId,body);}
  @Post('/v1/channels/:channelId/sessions/:sessionId/commands') @UseGuards(SessionGuard,CsrfGuard)
  command(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('sessionId') sessionId:string,@Body() body:SessionCommandRequest){return this.api.command(req.operator!,channelId,sessionId,body);}
  @Get('/v1/channels/:channelId/sessions/:sessionId/inventory-ledger') @UseGuards(SessionGuard)
  inventoryLedger(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('sessionId') sessionId:string){return this.api.inventoryLedger(req.operator!,channelId,sessionId);}
  @Get('/v1/channels/:channelId/sessions/:sessionId/missions') @UseGuards(SessionGuard)
  missions(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('sessionId') sessionId:string){return this.api.missions(req.operator!,channelId,sessionId);}
  @Get('/v1/channels/:channelId/commands/:commandId') @UseGuards(SessionGuard)
  getCommand(@Req() req:AuthenticatedRequest,@Param('channelId') channelId:string,@Param('commandId') commandId:string){return this.api.getCommand(req.operator!,channelId,commandId);}
}
