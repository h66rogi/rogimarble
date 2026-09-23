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
import { PawnAssetsController } from './pawn-assets.controller.ts';
import { PawnAssetService } from './pawn-assets.ts';
import { OverlayLayoutService } from './overlay-layout.ts';
import { OverlayRealtimeService } from './overlay-realtime.ts';
import { OperatorFeedRealtimeService } from './operator-feed-realtime.ts';

@Module({ controllers:[AppController,AccessTokenController,CollectorController,PawnAssetsController], providers:[ApiService,ConfigurationService,SessionGuard,CsrfGuard,AccessTokenService,CollectorService,DonationIngestionService,PawnAssetService,OverlayLayoutService,OverlayRealtimeService,OperatorFeedRealtimeService] })
export class AppModule {}
