import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const preview = sqliteTable('preview', {
	previewId: integer('preview_id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	token: text('token').notNull(),
	accountId: integer('account_id').notNull(),
	expireTime: text('expire_time'),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull()
});

export default preview;
