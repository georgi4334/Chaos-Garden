import { Module } from '@nestjs/common';
import { GardensModule } from '../gardens/gardens.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { RulesController } from './rules.controller.js';
import { RulesService } from './rules.service.js';

@Module({
  imports: [GardensModule, TargetsModule],
  controllers: [RulesController],
  providers: [RulesService],
})
export class RulesModule {}
