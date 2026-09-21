import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthCoreError, hash, localCsrfToken, resolveSharedCore, validCsrf } from '../src/auth-core.ts';

const prior={...process.env};
test.before(()=>{process.env.AUTH_MODE='rogichat_shared_cookie';process.env.ROGICHAT_COOKIE_NAME='__Secure-rogi_session';process.env.ROGICHAT_SESSION_URL='https://api.rogi.chat/v1/auth/session';process.env.WEB_ORIGIN='https://marble.rogi.chat';process.env.SESSION_SECRET='test-only-session-secret-longer-than-thirty-two-bytes';});
test.after(()=>{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);});
const opaque='a'.repeat(43),subject='b'.repeat(43),operator={id:'10000000-0000-4000-8000-000000000001',username:'bound',role:'operator' as const};

test('forwards only the opaque cookie to the fixed upstream and binds trusted subject',async()=>{
  let observed:any;
  const fetcher=async(input:any,init:any)=>{observed={input,init};return new Response(JSON.stringify({authenticated:true,accountPartition:subject,csrfToken:'ignored-upstream-token'}),{status:200,headers:{'content-type':'application/json'}});};
  const resolved=await resolveSharedCore(`noise=x; __Secure-rogi_session=${opaque}`,fetcher as typeof fetch,async value=>value===subject?operator:null);
  assert.deepEqual(resolved.operator,operator);assert.equal(observed.input,'https://api.rogi.chat/v1/auth/session');assert.equal(observed.init.redirect,'error');assert.equal(observed.init.headers.cookie,`__Host-rogi_session=${opaque}`);
  assert.equal(typeof resolved.csrfToken,'string');assert.ok(resolved.csrfToken.length>40);
});

test('duplicate and malformed shared cookies fail before upstream access',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return new Response('{}',{status:200});};
  await assert.rejects(resolveSharedCore(`__Secure-rogi_session=${opaque}; __Secure-rogi_session=${opaque}`,fetcher as typeof fetch,async()=>operator),AuthCoreError);
  await assert.rejects(resolveSharedCore('__Secure-rogi_session=not-valid',fetcher as typeof fetch,async()=>operator),AuthCoreError);assert.equal(calls,0);
});

test('network failure, unauthenticated response and missing local binding fail closed',async()=>{
  await assert.rejects(resolveSharedCore(`__Secure-rogi_session=${opaque}`,async()=>{throw new Error('offline');},async()=>operator),AuthCoreError);
  await assert.rejects(resolveSharedCore(`__Secure-rogi_session=${opaque}`,async()=>new Response(JSON.stringify({authenticated:false}),{status:200}),async()=>operator),AuthCoreError);
  await assert.rejects(resolveSharedCore(`__Secure-rogi_session=${opaque}`,async()=>new Response(JSON.stringify({authenticated:true,accountPartition:subject}),{status:200}),async()=>null),AuthCoreError);
});

test('shared CSRF requires both the session-bound token and exact marble origin',()=>{
  const token='csrf-token';
  assert.equal(validCsrf(hash(token),token,'shared','https://marble.rogi.chat','https://marble.rogi.chat'),true);
  assert.equal(validCsrf(hash(token),token,'shared','https://evil.invalid','https://marble.rogi.chat'),false);
  assert.equal(validCsrf(hash(token),'wrong','shared','https://marble.rogi.chat','https://marble.rogi.chat'),false);
});

test('local CSRF bootstrap is stable for the same browser session and differs across sessions',()=>{
  assert.equal(localCsrfToken('session-a'),localCsrfToken('session-a'));
  assert.notEqual(localCsrfToken('session-a'),localCsrfToken('session-b'));
});
