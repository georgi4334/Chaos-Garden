import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { faultRules, gardens, targets } from '../database/schema.js';

export interface GardenConfig {
  gardenId: string;
  /** Token bucket for the proxy: `rps` tokens per second, holding at most `burst`. */
  rateLimit: { rps: number; burst: number };
  targets: Array<{
    id: string;
    name: string;
    baseUrl: string;
    rules: Array<{
      id: string;
      method: string;
      pathPattern: string;
      type: 'latency' | 'error' | 'drop' | 'corrupt';
      probability: number;
      params: Record<string, unknown>;
    }>;
  }>;
}

@Injectable()
export class InternalService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Everything the proxy needs for one garden: targets and their enabled rules. */
  async getGardenConfig(gardenId: string): Promise<GardenConfig> {
    const [garden] = await this.db
      .select({ id: gardens.id, rps: gardens.rateLimitRps, burst: gardens.rateLimitBurst })
      .from(gardens)
      .where(eq(gardens.id, gardenId));
    if (!garden) throw new NotFoundException('Garden not found');

    const targetRows = await this.db
      .select()
      .from(targets)
      .where(eq(targets.gardenId, gardenId))
      .orderBy(asc(targets.createdAt));

    const ruleRows = targetRows.length
      ? await this.db
          .select()
          .from(faultRules)
          .where(
            and(
              inArray(faultRules.targetId, targetRows.map((t) => t.id)),
              eq(faultRules.enabled, true),
            ),
          )
          .orderBy(asc(faultRules.createdAt), asc(faultRules.id))
      : [];

    return {
      gardenId,
      rateLimit: { rps: garden.rps, burst: garden.burst },
      targets: targetRows.map((t) => ({
        id: t.id,
        name: t.name,
        baseUrl: t.baseUrl,
        rules: ruleRows
          .filter((r) => r.targetId === t.id)
          .map((r) => ({
            id: r.id,
            method: r.method,
            pathPattern: r.pathPattern,
            type: r.type,
            probability: Number(r.probability),
            params: r.params,
          })),
      })),
    };
  }
}
