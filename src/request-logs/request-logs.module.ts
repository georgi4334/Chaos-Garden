import { Module } from '@nestjs/common';
import { GardensModule } from '../gardens/gardens.module.js';
import { IngestClient } from './ingest.client.js';
import { RequestLogsController } from './request-logs.controller.js';

@Module({
  imports: [GardensModule],
  controllers: [RequestLogsController],
  providers: [IngestClient],
})
export class RequestLogsModule {}
