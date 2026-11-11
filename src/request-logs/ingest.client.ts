import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { currentRequestId, REQUEST_ID_HEADER } from '../observability/request-context.js';

/**
 * Talks to the ingest service, which owns request logs and stats. The control
 * API sits in front of it so the dashboard keeps one API and one kind of auth
 * (the garden's admin token); this hop uses the shared internal key.
 */
@Injectable()
export class IngestClient {
  private readonly logger = new Logger(IngestClient.name);

  constructor(private readonly config: ConfigService) {}

  async get<T>(path: string, query: Record<string, string | number | undefined>): Promise<T> {
    const base = (this.config.get<string>('INGEST_URL') ?? 'http://localhost:3200').replace(/\/+$/, '');
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();

    let res: Response;
    try {
      res = await fetch(`${base}${path}${qs ? `?${qs}` : ''}`, {
        headers: {
          'x-internal-key': this.config.get<string>('INTERNAL_API_KEY') ?? '',
          [REQUEST_ID_HEADER]: currentRequestId() ?? '',
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.warn(`Ingest service unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Request logs are unavailable right now.');
    }
    if (!res.ok) {
      this.logger.warn(`Ingest service returned ${res.status} for ${path}`);
      throw new ServiceUnavailableException('Request logs are unavailable right now.');
    }
    return (await res.json()) as T;
  }
}
