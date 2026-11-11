import { Module } from '@nestjs/common';
import { GardensModule } from '../gardens/gardens.module.js';
import { TargetsController } from './targets.controller.js';
import { TargetsService } from './targets.service.js';

@Module({
  imports: [GardensModule],
  controllers: [TargetsController],
  providers: [TargetsService],
  exports: [TargetsService],
})
export class TargetsModule {}
