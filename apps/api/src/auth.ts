import { createHmac, randomBytes } from 'node:crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pool } from '../../../packages/database/src/index.ts';
import { AuthCoreError, hash, localCsrfToken, resolveSharedCore, validCsrf, type OperatorIdentity } from './auth-core.ts';
export { hash, localCsrfToken } from './auth-core.ts';

export interface AuthenticatedRequest extends Request {
  operator?: { id: string; username: string; role: 'admin' | 'operator' | 'viewer'; csrfHash: string };
  authMode?: 'local'|'shared';
  csrfToken?: string;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes');
  return value;
}
const sign = (token: string): string => createHmac('sha256', secret()).update(token).digest('base64url');

export function sessionCookieValue(token: string): string { return `${token}.${sign(token)}`; }
const SESSION_COOKIE_PREFIX='rogimarble_session=';
function cookieValues(header:string|undefined,name:string):string[]{const prefix=`${name}=`;return (header??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(prefix)).map(v=>v.slice(prefix.length));}
export function parseSessionCookie(header:string|undefined):string|null{
  const matches=cookieValues(header,SESSION_COOKIE_PREFIX.slice(0,-1));if(matches.length!==1)return null;const encoded=matches[0];
  if(!encoded)return null;
  const [token,signature]=encoded.split('.');
  if(!token||!signature||sign(token)!==signature)return null;
  return token;
}
export function readSessionCookie(request: Request): string | null {
  return parseSessionCookie(request.headers.cookie);
}
export function setSessionCookie(response: Response, value: string, expires: Date): void {
  const secure = process.env.COOKIE_SECURE !== 'false';
  response.cookie('rogimarble_session', value, { httpOnly: true, sameSite: 'strict', secure, path: '/', expires });
}
export function clearSessionCookie(response: Response): void {
  response.clearCookie('rogimarble_session', { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE !== 'false', path: '/' });
}
export function newCredential(): string { return randomBytes(32).toString('base64url'); }
export function authMode(): 'local'|'shared'{return process.env.AUTH_MODE==='rogichat_shared_cookie'?'shared':'local';}
type IdentityLookup=(subject:string)=>Promise<OperatorIdentity|null>;
function sharedConfig(){const cookieName=process.env.ROGICHAT_COOKIE_NAME;const sessionUrl=process.env.ROGICHAT_SESSION_URL;
  if(!cookieName||!/^__Secure-[A-Za-z0-9_-]+$/.test(cookieName))throw new Error('ROGICHAT_COOKIE_NAME must be an explicit __Secure- cookie name');
  if(sessionUrl!=='https://api.rogi.chat/v1/auth/session')throw new Error('ROGICHAT_SESSION_URL must be the approved HTTPS session endpoint');
  return{cookieName,sessionUrl};}
async function databaseLookup(subject:string):Promise<OperatorIdentity|null>{const result=await pool().query<OperatorIdentity>(`SELECT o.id,o.username,o.role FROM external_auth_bindings b JOIN operators o ON o.id=b.operator_id
  WHERE b.issuer='rogichat' AND b.subject=$1 AND o.disabled_at IS NULL`,[subject]);return result.rows[0]??null;}
export async function resolveSharedIdentity(cookieHeader:string|undefined,fetcher:typeof fetch=fetch,lookup:IdentityLookup=databaseLookup):Promise<{operator:OperatorIdentity;csrfToken:string}>{
  sharedConfig();try{return await resolveSharedCore(cookieHeader,fetcher,lookup);}catch(error){if(error instanceof AuthCoreError){if(error.kind==='forbidden')throw new ForbiddenException(error.message);throw new UnauthorizedException(error.message);}throw error;}
}

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if(authMode()==='shared'){const identity=await resolveSharedIdentity(request.headers.cookie);request.operator={...identity.operator,csrfHash:hash(identity.csrfToken)};request.authMode='shared';request.csrfToken=identity.csrfToken;return true;}
    const token = readSessionCookie(request);
    if (!token) throw new UnauthorizedException('Login required');
    const result = await pool().query<{ id: string; username: string; role: 'admin'|'operator'|'viewer'; csrf_hash: string }>(
      `SELECT o.id,o.username,o.role,s.csrf_hash FROM auth_sessions s JOIN operators o ON o.id=s.operator_id
       WHERE s.id_hash=$1 AND s.expires_at>now() AND o.disabled_at IS NULL`, [hash(token)]);
    if (!result.rowCount) throw new UnauthorizedException('Session expired');
    request.operator = { ...result.rows[0], csrfHash: result.rows[0].csrf_hash };
    request.authMode='local';
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.header('x-csrf-token');
    if (!request.operator || !validCsrf(request.operator.csrfHash,token,request.authMode,request.header('origin'),process.env.WEB_ORIGIN)) throw new ForbiddenException('Invalid CSRF token');
    return true;
  }
}
