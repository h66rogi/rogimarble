import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
@Controller() class GatewayController { @Get('/health') health(){return{status:'ok',realtime:'not_implemented'};} }
@Module({controllers:[GatewayController]}) class GatewayModule{}
const app=await NestFactory.create(GatewayModule,{cors:false});
await app.listen(Number(process.env.GATEWAY_PORT??4001),'0.0.0.0');
