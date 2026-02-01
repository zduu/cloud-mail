import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const emailPreview = sqliteTable('email_preview', {
	previewId: integer('preview_id').primaryKey({ autoIncrement: true }),
	emailId: integer('email_id').notNull(),
	userId: integer('user_id').notNull(),
	token: text('token').notNull(),
	expireTime: text('expire_time'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
});

export default emailPreview;
