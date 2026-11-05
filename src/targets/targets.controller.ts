import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AdminTokenGuard } from '../auth/admin-token.guard.js';
import { CreateTargetDto, UpdateTargetDto } from './targets.dto.js';
import { TargetsService } from './targets.service.js';

@Controller('gardens/:gardenId/targets')
@ApiBearerAuth()
@UseGuards(AdminTokenGuard)
export class TargetsController {
  constructor(private readonly targets: TargetsService) {}

  @Post()
  create(@Param('gardenId') gardenId: string, @Body() dto: CreateTargetDto) {
    return this.targets.create(gardenId, dto.name, dto.baseUrl);
  }

  @Get()
  list(@Param('gardenId') gardenId: string) {
    return this.targets.list(gardenId);
  }

  @Get(':targetId')
  get(
    @Param('gardenId') gardenId: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.targets.get(gardenId, targetId);
  }

  @Patch(':targetId')
  update(
    @Param('gardenId') gardenId: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: UpdateTargetDto,
  ) {
    return this.targets.update(gardenId, targetId, dto.name, dto.baseUrl);
  }

  @Delete(':targetId')
  @HttpCode(204)
  remove(
    @Param('gardenId') gardenId: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.targets.remove(gardenId, targetId);
  }
}
