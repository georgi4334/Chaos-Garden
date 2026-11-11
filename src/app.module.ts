import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { GardensModule } from './gardens/gardens.module.js';
import { HealthController } from './health/health.controller.js';
import { MetricsController } from './observability/metrics.controller.js';
import { InternalModule } from './internal/internal.module.js';
import { RequestLogsModule } from './request-logs/request-logs.module.js';
import { RulesModule } from './rules/rules.module.js';
import { TargetsModule } from './targets/targets.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    GardensModule,
    TargetsModule,
    RulesModule,
    InternalModule,
    RequestLogsModule,
  ],
  controllers: [HealthController, MetricsController],
})
export class AppModule {}
