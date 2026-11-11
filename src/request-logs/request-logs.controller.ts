import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AdminTokenGuard } from '../auth/admin-token.guard.js';
import { IngestClient } from './ingest.client.js';
import { RequestsQueryDto, StatsQueryDto } from './request-logs.dto.js';

/** Request logs and stats for a garden, read from the ingest service. */
@Controller('gardens/:gardenId')
@ApiBearerAuth()
@UseGuards(AdminTokenGuard)
export class RequestLogsController {
  constructor(private readonly ingest: IngestClient) {}

  /** Recent requests through the proxy, newest first. */
  @Get('requests')
  requests(@Param('gardenId') gardenId: string, @Query() query: RequestsQueryDto) {
    return this.ingest.get(`/internal/gardens/${gardenId}/requests`, {
      limit: query.limit,
      targetId: query.targetId,
      before: query.before,
    });
  }

  /** Per-minute counts by outcome for the last `minutes` minutes (default 60). */
  @Get('stats')
  stats(@Param('gardenId') gardenId: string, @Query() query: StatsQueryDto) {
    return this.ingest.get(`/internal/gardens/${gardenId}/stats`, {
      minutes: query.minutes,
      targetId: query.targetId,
    });
  }
}
