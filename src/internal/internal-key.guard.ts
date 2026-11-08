import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Service-to-service auth: other Chaos Garden services (the proxy) present the
 * shared INTERNAL_API_KEY in the `x-internal-key` header. If the key is not
 * configured, every request is rejected (fail closed).
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_API_KEY');
    const req = context.switchToHttp().getRequest<Request>();
    const presented = req.headers['x-internal-key'];

    if (!expected || typeof presented !== 'string') {
      throw new UnauthorizedException('Invalid internal key');
    }
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid internal key');
    }
    return true;
  }
}
