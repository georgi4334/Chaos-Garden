import { Module } from '@nestjs/common';
import { AdminTokenGuard } from '../auth/admin-token.guard.js';
import { GardensController } from './gardens.controller.js';
import { GardensService } from './gardens.service.js';

@Module({
  controllers: [GardensController],
  providers: [GardensService, AdminTokenGuard],
  exports: [AdminTokenGuard],
})
export class GardensModule {}
