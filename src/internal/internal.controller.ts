import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalKeyGuard } from './internal-key.guard.js';
import { InternalService } from './internal.service.js';

/** Not part of the public API, so it is hidden from the Swagger docs. */
@ApiExcludeController()
@Controller('internal')
@UseGuards(InternalKeyGuard)
export class InternalController {
  constructor(private readonly internal: InternalService) {}

  @Get('gardens/:gardenId/config')
  config(@Param('gardenId', ParseUUIDPipe) gardenId: string) {
    return this.internal.getGardenConfig(gardenId);
  }
}
