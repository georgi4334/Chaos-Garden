import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

/**
 * Limits how many gardens one IP address can create: a fixed window counter.
 *
 * Kept in this process's memory on purpose (simple, no extra infrastructure).
 * With several control API instances each one counts separately, so the real
 * limit is N times this; moving the counter to Redis would fix that.
 * Behind a reverse proxy, set TRUST_PROXY=true so req.ip is the client's address.
 */
@Injectable()
export class CreationRateGuard implements CanActivate {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const limit = Number(this.config.get('GARDEN_CREATE_LIMIT') ?? 10);
    const windowMs = Number(this.config.get('GARDEN_CREATE_WINDOW_MS') ?? 3_600_000);
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    let window = this.windows.get(key);
    if (!window || now - window.start >= windowMs) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
      if (this.windows.size > 10_000) this.evict(now, windowMs);
    }

    if (window.count >= limit) {
      const retryAfter = Math.ceil((window.start + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        { statusCode: 429, message: `Too many gardens created from this address. Try again in ${retryAfter} seconds.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    window.count++;
    return true;
  }

  private evict(now: number, windowMs: number) {
    for (const [key, w] of this.windows) if (now - w.start >= windowMs) this.windows.delete(key);
  }
}
