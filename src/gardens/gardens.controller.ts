import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AdminTokenGuard } from '../auth/admin-token.guard.js';
import { CreateGardenDto, UpdateGardenDto } from './gardens.dto.js';
import { GardensService } from './gardens.service.js';

@Controller('gardens')
export class GardensController {
  constructor(private readonly gardens: GardensService) {}

  /** Public: anyone can plant a garden. The admin token is returned once. */
  @Post()
  create(@Body() dto: CreateGardenDto) {
    return this.gardens.create(dto.name);
  }

  @Get(':gardenId')
  @ApiBearerAuth()
  @UseGuards(AdminTokenGuard)
  get(@Param('gardenId') id: string) {
    return this.gardens.get(id);
  }

  @Patch(':gardenId')
  @ApiBearerAuth()
  @UseGuards(AdminTokenGuard)
  rename(@Param('gardenId') id: string, @Body() dto: UpdateGardenDto) {
    return this.gardens.rename(id, dto.name);
  }

  @Delete(':gardenId')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(AdminTokenGuard)
  remove(@Param('gardenId') id: string) {
    return this.gardens.remove(id);
  }
}
