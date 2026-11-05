import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { targets } from '../database/schema.js';

@Injectable()
export class TargetsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  create(gardenId: string, name: string, baseUrl: string) {
    return this.db
      .insert(targets)
      .values({ gardenId, name, baseUrl })
      .returning()
      .then(([t]) => t);
  }

  list(gardenId: string) {
    return this.db.select().from(targets).where(eq(targets.gardenId, gardenId));
  }

  async get(gardenId: string, targetId: string) {
    const [target] = await this.db
      .select()
      .from(targets)
      .where(and(eq(targets.id, targetId), eq(targets.gardenId, gardenId)));
    if (!target) throw new NotFoundException('Target not found');
    return target;
  }

  async update(gardenId: string, targetId: string, name: string, baseUrl: string) {
    const [target] = await this.db
      .update(targets)
      .set({ name, baseUrl })
      .where(and(eq(targets.id, targetId), eq(targets.gardenId, gardenId)))
      .returning();
    if (!target) throw new NotFoundException('Target not found');
    return target;
  }

  async remove(gardenId: string, targetId: string) {
    await this.db
      .delete(targets)
      .where(and(eq(targets.id, targetId), eq(targets.gardenId, gardenId)));
  }
}
