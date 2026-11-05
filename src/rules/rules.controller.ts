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
import { CreateRuleDto, UpdateRuleDto } from './rules.dto.js';
import { RulesService } from './rules.service.js';

@Controller('gardens/:gardenId/targets/:targetId/rules')
@ApiBearerAuth()
@UseGuards(AdminTokenGuard)
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Post()
  create(
    @Param('gardenId') gardenId: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: CreateRuleDto,
  ) {
    return this.rules.create(gardenId, targetId, dto);
  }

  @Get()
  list(
    @Param('gardenId') gardenId: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.rules.list(gardenId, targetId);
  }

  @Get(':ruleId')
  get(
    @Param('gardenId') gardenId: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ) {
    return this.rules.get(gardenId, targetId, ruleId);
  }

  @Patch(':ruleId')
  update(
    @Param('gardenId') gardenId: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.rules.update(gardenId, targetId, ruleId, dto);
  }

  @Delete(':ruleId')
  @HttpCode(204)
  remove(
    @Param('gardenId') gardenId: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
  ) {
    return this.rules.remove(gardenId, targetId, ruleId);
  }
}
