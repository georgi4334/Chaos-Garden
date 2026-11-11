import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { generateAdminToken, hashAdminToken } from '../auth/admin-token.js';
import { DB, type Database } from '../database/database.module.js';
import { gardens } from '../database/schema.js';
import type { UpdateGardenDto } from './gardens.dto.js';

/** What the API returns for a garden. Never includes the token hash. */
const publicColumns = {
  id: gardens.id,
  name: gardens.name,
  rateLimitRps: gardens.rateLimitRps,
  rateLimitBurst: gardens.rateLimitBurst,
  createdAt: gardens.createdAt,
};

@Injectable()
export class GardensService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(name: string) {
    const adminToken = generateAdminToken();
    const [garden] = await this.db
      .insert(gardens)
      .values({ name, adminTokenHash: hashAdminToken(adminToken) })
      .returning(publicColumns);
    return { ...garden, adminToken };
  }

  async get(id: string) {
    const [garden] = await this.db.select(publicColumns).from(gardens).where(eq(gardens.id, id));
    if (!garden) throw new NotFoundException('Garden not found');
    return garden;
  }

  /** Rename and/or change the rate limit. Fields left out stay as they are. */
  async update(id: string, dto: UpdateGardenDto) {
    const changes = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.rateLimitRps !== undefined && { rateLimitRps: dto.rateLimitRps }),
      ...(dto.rateLimitBurst !== undefined && { rateLimitBurst: dto.rateLimitBurst }),
    };
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('Send at least one of name, rateLimitRps or rateLimitBurst');
    }
    const [garden] = await this.db
      .update(gardens)
      .set(changes)
      .where(eq(gardens.id, id))
      .returning(publicColumns);
    if (!garden) throw new NotFoundException('Garden not found');
    return garden;
  }

  async remove(id: string) {
    await this.db.delete(gardens).where(eq(gardens.id, id));
  }
}
