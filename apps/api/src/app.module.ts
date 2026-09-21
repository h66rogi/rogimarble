import { Module } from '@nestjs/common';
import { AppController } from './app.controller.ts';
import { ApiService } from './api.service.ts';
import { CsrfGuard, SessionGuard } from './auth.ts';

@Module({ controllers:[AppController], providers:[ApiService,SessionGuard,CsrfGuard] })
export class AppModule {}
