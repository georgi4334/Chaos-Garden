import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { INGEST_CONFIG, type IngestConfig } from '../config/ingest-config.js';

/** Only other Chaos Garden services (the control API) may read logs. Fails closed if no key is set. */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(@Inject(INGEST_CONFIG) private readonly config: IngestConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.internalApiKey;
    const presented = context.switchToHttp().getRequest<Request>().headers['x-internal-key'];
    if (!expected || typeof presented !== 'string') throw new UnauthorizedException('Invalid internal key');
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid internal key');
    return true;
  }
}
