import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const radarRecords=sqliteTable('radar_records',{id:text('id').primaryKey(),dedupe:text('dedupe').notNull().unique(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()});
export const radarSources=sqliteTable('radar_sources',{id:text('id').primaryKey(),payload:text('payload').notNull(),snapshot:text('snapshot'),lockedUntil:integer('locked_until').notNull().default(0)});
export const radarRuns=sqliteTable('radar_runs',{id:text('id').primaryKey(),payload:text('payload').notNull(),createdAt:text('created_at').notNull()});
export const radarLocks=sqliteTable('radar_locks',{id:text('id').primaryKey(),expires:integer('expires').notNull()});
