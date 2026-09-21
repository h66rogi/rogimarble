import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { AppModule } from './app.module.ts';

function loadSecret(name:string):void{const fileName=`${name}_FILE`;if(process.env[name]&&process.env[fileName])throw new Error(`Set only one of ${name} or ${fileName}`);if(process.env[fileName])process.env[name]=readFileSync(process.env[fileName]!,'utf8').trim();}
loadSecret('DATABASE_URL');loadSecret('SESSION_SECRET');
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_FILE is required');
if(!process.env.SESSION_SECRET||Buffer.byteLength(process.env.SESSION_SECRET)<32) throw new Error('SESSION_SECRET must contain at least 32 bytes');
if(process.env.AUTH_MODE&&process.env.AUTH_MODE!=='local'&&process.env.AUTH_MODE!=='rogichat_shared_cookie')throw new Error('AUTH_MODE must be local or rogichat_shared_cookie');
if(process.env.AUTH_MODE==='rogichat_shared_cookie'){
  if(!process.env.ROGICHAT_COOKIE_NAME)throw new Error('ROGICHAT_COOKIE_NAME is required in shared mode');
  if(process.env.ROGICHAT_SESSION_URL!=='https://api.rogi.chat/v1/auth/session')throw new Error('ROGICHAT_SESSION_URL must be the approved HTTPS endpoint');
  if(process.env.WEB_ORIGIN!=='https://marble.rogi.chat')throw new Error('WEB_ORIGIN must be the approved marble web origin');
}
const app=await NestFactory.create(AppModule,{cors:false});
if(process.env.AUTH_MODE==='rogichat_shared_cookie')app.enableCors({origin:'https://marble.rogi.chat',credentials:true,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token','Authorization'],maxAge:600});
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT??4000),'0.0.0.0');
