import { Module } from '@nestjs/common';
import { AppController } from './app.controller.ts';
import { ApiService } from './api.service.ts';
import { CsrfGuard, SessionGuard } from './auth.ts';
import { ConfigurationService } from './configuration.service.ts';

@Module({ controllers:[AppController], providers:[ApiService,ConfigurationService,SessionGuard,CsrfGuard] })
export class AppModule {}
