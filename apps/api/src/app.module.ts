import { Module } from '@nestjs/common';
import { AppController } from './app.controller.ts';
import { ApiService } from './api.service.ts';
import { CsrfGuard, SessionGuard } from './auth.ts';
import { ConfigurationService } from './configuration.service.ts';
import { AccessTokenController } from './access-token.controller.ts';
import { AccessTokenService } from './access-token.service.ts';
import { CollectorController } from './collector.controller.ts';
import { CollectorService } from './collector.service.ts';
import { DonationIngestionService } from './donation-ingestion.service.ts';

@Module({ controllers:[AppController,AccessTokenController,CollectorController], providers:[ApiService,ConfigurationService,SessionGuard,CsrfGuard,AccessTokenService,CollectorService,DonationIngestionService] })
export class AppModule {}
