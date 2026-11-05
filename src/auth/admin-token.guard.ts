import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DB, type Database } from '../database/database.module.js';
import { gardens } from '../database/schema.js';
import { verifyAdminToken } from './admin-token.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Requires `Authorization: Bearer <adminToken>` where the token belongs to the
 * garden named by the `:gardenId` route param. A token for garden A can never
 * act on garden B.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const gardenId = req.params.gardenId as string;

    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    if (!UUID_RE.test(gardenId)) {
      throw new NotFoundException('Garden not found');
    }

    const [garden] = await this.db
      .select({ hash: gardens.adminTokenHash })
      .from(gardens)
      .where(eq(gardens.id, gardenId));

    // Same response for unknown garden and wrong token: don't leak which exists.
    if (!garden || !verifyAdminToken(token, garden.hash)) {
      throw new UnauthorizedException('Invalid token');
    }
    return true;
  }
}
