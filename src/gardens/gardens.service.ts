import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { generateAdminToken, hashAdminToken } from '../auth/admin-token.js';
import { DB, type Database } from '../database/database.module.js';
import { gardens } from '../database/schema.js';

@Injectable()
export class GardensService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(name: string) {
    const adminToken = generateAdminToken();
    const [garden] = await this.db
      .insert(gardens)
      .values({ name, adminTokenHash: hashAdminToken(adminToken) })
      .returning({ id: gardens.id, name: gardens.name, createdAt: gardens.createdAt });
    return { ...garden, adminToken };
  }

  async get(id: string) {
    const [garden] = await this.db
      .select({ id: gardens.id, name: gardens.name, createdAt: gardens.createdAt })
      .from(gardens)
      .where(eq(gardens.id, id));
    if (!garden) throw new NotFoundException('Garden not found');
    return garden;
  }

  async rename(id: string, name: string) {
    const [garden] = await this.db
      .update(gardens)
      .set({ name })
      .where(eq(gardens.id, id))
      .returning({ id: gardens.id, name: gardens.name, createdAt: gardens.createdAt });
    if (!garden) throw new NotFoundException('Garden not found');
    return garden;
  }

  async remove(id: string) {
    await this.db.delete(gardens).where(eq(gardens.id, id));
  }
}
