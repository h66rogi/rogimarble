import { createHash, createHmac } from 'node:crypto';

export type OperatorIdentity={id:string;username:string;role:'admin'|'operator'|'viewer'};
export class AuthCoreError extends Error{constructor(readonly kind:'unauthorized'|'forbidden',message:string){super(message);}}
export const hash = (value:string):string=>createHash('sha256').update(value).digest('hex');
function secret():string{const value=process.env.SESSION_SECRET;if(!value||Buffer.byteLength(value)<32)throw new Error('SESSION_SECRET must contain at least 32 bytes');return value;}
export function localCsrfToken(sessionToken:string):string{return createHmac('sha256',secret()).update(`local\0${sessionToken}`).digest('base64url');}
export function validCsrf(storedHash:string|undefined,token:string|undefined,mode:'local'|'shared'|undefined,origin:string|undefined,expectedOrigin:string|undefined):boolean{
  return !!storedHash&&!!token&&hash(token)===storedHash&&((mode!=='shared'&&!expectedOrigin)||!!expectedOrigin&&origin===expectedOrigin);
}
const SUBJECT=/^[A-Za-z0-9_-]{43}$/,OPAQUE=/^[A-Za-z0-9_-]{43}$/;
function cookieValues(header:string|undefined,name:string):string[]{const prefix=`${name}=`;return (header??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(prefix)).map(v=>v.slice(prefix.length));}
export async function resolveSharedCore(cookieHeader:string|undefined,fetcher:typeof fetch,lookup:(subject:string)=>Promise<OperatorIdentity|null>):Promise<{operator:OperatorIdentity;csrfToken:string}>{
  const cookieName=process.env.ROGICHAT_COOKIE_NAME,sessionUrl=process.env.ROGICHAT_SESSION_URL;
  if(!cookieName||!/^__Secure-[A-Za-z0-9_-]+$/.test(cookieName)||sessionUrl!=='https://api.rogi.chat/v1/auth/session')throw new Error('Invalid shared authentication configuration');
  const values=cookieValues(cookieHeader,cookieName);if(values.length!==1||!OPAQUE.test(values[0]))throw new AuthCoreError('unauthorized','Shared session cookie is missing or malformed');
  const opaque=values[0],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);
  try{const response=await fetcher(sessionUrl,{method:'GET',headers:{accept:'application/json',cookie:`__Host-rogi_session=${opaque}`},redirect:'error',signal:controller.signal});
    if(!response.ok)throw new AuthCoreError('unauthorized','Shared session validation failed');const declared=Number(response.headers.get('content-length')??0);if(declared>8192)throw new AuthCoreError('unauthorized','Shared session response is invalid');
    const reader=response.body?.getReader();let total=0;const chunks:Uint8Array[]=[];if(!reader)throw new AuthCoreError('unauthorized','Shared session response is invalid');
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>8192){await reader.cancel();throw new AuthCoreError('unauthorized','Shared session response is invalid');}chunks.push(value);}
    let body:any;try{body=JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));}catch{throw new AuthCoreError('unauthorized','Shared session response is invalid');}
    if(body?.authenticated!==true||typeof body.accountPartition!=='string'||!SUBJECT.test(body.accountPartition))throw new AuthCoreError('unauthorized','Shared session is not authenticated');
    const operator=await lookup(body.accountPartition);if(!operator)throw new AuthCoreError('forbidden','Shared identity is not bound to an operator');
    return{operator,csrfToken:createHmac('sha256',secret()).update(`shared\0${opaque}\0${body.accountPartition}\0${operator.id}`).digest('base64url')};
  }catch(error){if(error instanceof AuthCoreError)throw error;throw new AuthCoreError('unauthorized','Shared session validation unavailable');}finally{clearTimeout(timer);}
}
