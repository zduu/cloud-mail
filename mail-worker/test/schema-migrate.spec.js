import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import KvConst from '../src/const/kv-const';
import emailService from '../src/service/email-service';
import { LATEST_SCHEMA_VERSION } from '../src/init/schema-migrate';

describe('旧数据库核心结构迁移', () => {
	beforeEach(async () => {
		await env.db.exec(`
			DROP TABLE IF EXISTS star;
			DROP TABLE IF EXISTS email;
			DROP TABLE IF EXISTS account;
			DROP TABLE IF EXISTS attachments;
			DROP TABLE IF EXISTS setting;
		`);
		await env.db.prepare(`CREATE TABLE setting (register INTEGER NOT NULL DEFAULT 0)`).run();
		await env.db.prepare(`
			CREATE TABLE account (
				account_id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL,
				status INTEGER NOT NULL DEFAULT 0,
				latest_email_time TEXT,
				create_time TEXT DEFAULT CURRENT_TIMESTAMP,
				user_id INTEGER NOT NULL,
				is_del INTEGER NOT NULL DEFAULT 0
			)
		`).run();
		await env.db.prepare(`
			CREATE TABLE email (
				email_id INTEGER PRIMARY KEY AUTOINCREMENT,
				send_email TEXT,
				name TEXT,
				account_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				subject TEXT,
				content TEXT,
				text TEXT,
				create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
				is_del INTEGER NOT NULL DEFAULT 0
			)
		`).run();
		await env.db.prepare(`
			CREATE TABLE attachments (
				att_id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				email_id INTEGER NOT NULL,
				account_id INTEGER NOT NULL,
				key TEXT NOT NULL,
				filename TEXT,
				mime_type TEXT,
				size INTEGER,
				disposition TEXT,
				related TEXT,
				content_id TEXT,
				encoding TEXT,
				create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
			)
		`).run();
		await env.db.prepare(`INSERT INTO account (account_id, email, user_id) VALUES (1, 'user@example.com', 1)`).run();
		await env.db.prepare(`INSERT INTO email (email_id, account_id, user_id, subject) VALUES (1, 1, 1, 'migration test')`).run();
		await env.kv.put(KvConst.SCHEMA_VERSION, '9');
	});

	it('补齐邮件列表查询字段并允许旧库直接查询', async () => {
		const context = { env: { db: env.db, kv: env.kv } };
		const response = await SELF.fetch('http://example.com/api/init', { method: 'POST' });
		expect(response.status).toBe(401);

		const emailColumns = await env.db.prepare(`PRAGMA table_info(email)`).all();
		const accountColumns = await env.db.prepare(`PRAGMA table_info(account)`).all();
		expect(emailColumns.results.map(row => row.name)).toEqual(expect.arrayContaining([
			'code', 'cc', 'bcc', 'recipient', 'to_email', 'to_name', 'in_reply_to',
			'relation', 'message_id', 'type', 'status', 'resend_email_id', 'message', 'unread'
		]));
		expect(accountColumns.results.map(row => row.name)).toEqual(expect.arrayContaining([
			'name', 'all_receive', 'sort', 'is_preview'
		]));

		await expect(emailService.list(context, {
			emailId: 9999999999,
			type: 0,
			accountId: 1,
			size: 50,
			timeSort: 0,
			allReceive: 1
		}, 1)).resolves.toMatchObject({
			list: [{ emailId: 1, subject: 'migration test', attList: [] }],
			total: 1
		});

		expect(await env.kv.get(KvConst.SCHEMA_VERSION)).toBe(String(LATEST_SCHEMA_VERSION));
	});
});
