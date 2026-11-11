import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { faultRules } from '../database/schema.js';
import { TargetsService } from '../targets/targets.service.js';
import { validateRuleParams } from './rule-params.js';
import type { CreateRuleDto, UpdateRuleDto } from './rules.dto.js';

@Injectable()
export class RulesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly targets: TargetsService,
  ) {}

  async create(gardenId: string, targetId: string, dto: CreateRuleDto) {
    await this.targets.get(gardenId, targetId); // 404 unless target is in this garden
    const params = validateRuleParams(dto.type, dto.params);
    const [rule] = await this.db
      .insert(faultRules)
      .values({
        targetId,
        type: dto.type,
        params,
        ...(dto.method !== undefined && { method: dto.method }),
        ...(dto.pathPattern !== undefined && { pathPattern: dto.pathPattern }),
        ...(dto.probability !== undefined && { probability: String(dto.probability) }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      })
      .returning();
    return rule;
  }

  async list(gardenId: string, targetId: string) {
    await this.targets.get(gardenId, targetId);
    // Explicit order: without it Postgres returns rows in storage order, and an
    // UPDATE moves a row to the end, so toggling a rule would reshuffle the list.
    return this.db
      .select()
      .from(faultRules)
      .where(eq(faultRules.targetId, targetId))
      .orderBy(asc(faultRules.createdAt), asc(faultRules.id));
  }

  async get(gardenId: string, targetId: string, ruleId: string) {
    await this.targets.get(gardenId, targetId);
    const [rule] = await this.db
      .select()
      .from(faultRules)
      .where(and(eq(faultRules.id, ruleId), eq(faultRules.targetId, targetId)));
    if (!rule) throw new NotFoundException('Rule not found');
    return rule;
  }

  async update(gardenId: string, targetId: string, ruleId: string, dto: UpdateRuleDto) {
    const current = await this.get(gardenId, targetId, ruleId);
    const type = dto.type ?? current.type;
    // Re-validate params whenever the type or params change.
    const params =
      dto.type !== undefined || dto.params !== undefined
        ? validateRuleParams(type, dto.params ?? (dto.type === current.type ? current.params : {}))
        : undefined;

    const [rule] = await this.db
      .update(faultRules)
      .set({
        ...(dto.type !== undefined && { type: dto.type }),
        ...(params !== undefined && { params }),
        ...(dto.method !== undefined && { method: dto.method }),
        ...(dto.pathPattern !== undefined && { pathPattern: dto.pathPattern }),
        ...(dto.probability !== undefined && { probability: String(dto.probability) }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      })
      .where(eq(faultRules.id, ruleId))
      .returning();
    return rule;
  }

  async remove(gardenId: string, targetId: string, ruleId: string) {
    await this.targets.get(gardenId, targetId);
    await this.db
      .delete(faultRules)
      .where(and(eq(faultRules.id, ruleId), eq(faultRules.targetId, targetId)));
  }
}
