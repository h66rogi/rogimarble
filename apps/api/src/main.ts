import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadSecret } from './runtime-secrets.ts';
import { AppModule } from './app.module.ts';
import { loadCollectorConfig } from './collector-config.ts';

loadSecret('DATABASE_URL');loadSecret('SESSION_SECRET');
loadCollectorConfig();
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL or DATABASE_URL_FILE is required');
if(!process.env.SESSION_SECRET||Buffer.byteLength(process.env.SESSION_SECRET)<32) throw new Error('SESSION_SECRET must contain at least 32 bytes');
if(process.env.AUTH_MODE&&!['local','token'].includes(process.env.AUTH_MODE))throw new Error('AUTH_MODE must be token or local');
const app=await NestFactory.create(AppModule,{cors:false});
if(process.env.WEB_ORIGIN)app.enableCors({origin:process.env.WEB_ORIGIN,credentials:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token','Authorization'],maxAge:600});
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT??4000),'0.0.0.0');
