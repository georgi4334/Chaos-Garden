import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { LogsQueryService } from '../logs/logs-query.service.js';
import { InternalKeyGuard } from './internal-key.guard.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function intParam(value: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestException(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function targetParam(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!UUID_RE.test(value)) throw new BadRequestException('targetId must be a UUID');
  return value;
}

/** Read API for the control API, which checks the garden's admin token before calling it. */
@Controller('internal/gardens/:gardenId')
@UseGuards(InternalKeyGuard)
export class InternalController {
  constructor(private readonly logs: LogsQueryService) {}

  @Get('requests')
  requests(
    @Param('gardenId', ParseUUIDPipe) gardenId: string,
    @Query('limit') limit?: string,
    @Query('targetId') targetId?: string,
    @Query('before') before?: string,
  ) {
    let beforeDate: Date | undefined;
    if (before) {
      beforeDate = new Date(before);
      if (Number.isNaN(beforeDate.getTime())) throw new BadRequestException('before must be a date');
    }
    return this.logs.recent(gardenId, {
      limit: intParam(limit, 'limit', 50, 1, 200),
      targetId: targetParam(targetId),
      before: beforeDate,
    });
  }

  @Get('stats')
  stats(
    @Param('gardenId', ParseUUIDPipe) gardenId: string,
    @Query('minutes') minutes?: string,
    @Query('targetId') targetId?: string,
  ) {
    return this.logs.stats(gardenId, {
      minutes: intParam(minutes, 'minutes', 60, 1, 1440),
      targetId: targetParam(targetId),
    });
  }
}
