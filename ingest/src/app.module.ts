import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INGEST_CONFIG, loadIngestConfig } from './config/ingest-config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { InternalKeyGuard } from './internal/internal-key.guard.js';
import { InternalController } from './internal/internal.controller.js';
import { LogWriter } from './logs/log-writer.js';
import { LogsQueryService } from './logs/logs-query.service.js';
import { RetentionService } from './retention/retention.service.js';
import { redisProviders } from './stream/redis.providers.js';
import { StreamConsumer } from './stream/stream-consumer.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  controllers: [HealthController, InternalController],
  providers: [
    { provide: INGEST_CONFIG, inject: [ConfigService], useFactory: loadIngestConfig },
    ...redisProviders,
    LogWriter,
    StreamConsumer,
    LogsQueryService,
    RetentionService,
    InternalKeyGuard,
  ],
})
export class AppModule {}
