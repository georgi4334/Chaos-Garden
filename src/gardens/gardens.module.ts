import { Module } from '@nestjs/common';
import { AdminTokenGuard } from '../auth/admin-token.guard.js';
import { CreationRateGuard } from './creation-rate.guard.js';
import { GardensController } from './gardens.controller.js';
import { GardensService } from './gardens.service.js';

@Module({
  controllers: [GardensController],
  providers: [GardensService, AdminTokenGuard, CreationRateGuard],
  exports: [AdminTokenGuard],
})
export class GardensModule {}
