import { Module } from '@nestjs/common';
import { AppController } from './app.controller.ts';
import { ApiService } from './api.service.ts';
import { CsrfGuard, SessionGuard } from './auth.ts';
import { AdminController } from './admin.controller.ts';
import { AdminService } from './admin.service.ts';
import { AdminCsrfGuard,AdminGuard } from './admin-auth.ts';

@Module({ controllers:[AppController,AdminController], providers:[ApiService,AdminService,SessionGuard,CsrfGuard,AdminGuard,AdminCsrfGuard] })
export class AppModule {}
