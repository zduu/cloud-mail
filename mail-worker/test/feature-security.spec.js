import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import previewService from '../src/service/preview-service';
import outlookService, { parseImapMessageId } from '../src/service/outlook-service';
import { objectToResponse } from '../src/service/r2-service';

describe('预览邮箱删除保护', () => {
	beforeEach(async () => {
		await env.db.exec('DROP TABLE IF EXISTS preview; DROP TABLE IF EXISTS account;');
		await env.db.prepare(`CREATE TABLE account (
			account_id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT '',
			status INTEGER NOT NULL DEFAULT 0,
			latest_email_time TEXT,
			create_time TEXT DEFAULT CURRENT_TIMESTAMP,
			user_id INTEGER NOT NULL,
			all_receive INTEGER NOT NULL DEFAULT 0,
			sort INTEGER NOT NULL DEFAULT 0,
			is_del INTEGER NOT NULL DEFAULT 0,
			is_preview INTEGER NOT NULL DEFAULT 0
		)`).run();
		await env.db.prepare(`CREATE TABLE preview (
			preview_id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			token TEXT NOT NULL,
			account_id INTEGER NOT NULL,
			expire_time TEXT,
			create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
		)`).run();
	});

	it('删除正式邮箱的最后一个预览链接时不删除邮箱', async () => {
		await env.db.prepare("INSERT INTO account (account_id, email, user_id, is_preview) VALUES (1, 'admin@example.com', 1, 0)").run();
		await env.db.prepare("INSERT INTO preview (preview_id, email, token, account_id) VALUES (1, 'admin@example.com', 'token', 1)").run();
		const context = { env: { db: env.db, admin: 'admin@example.com' }, get: () => ({ email: 'ADMIN@example.com' }) };
		await previewService.remove(context, { previewId: 1 }, 1);
		const row = await env.db.prepare('SELECT email, is_del AS isDel FROM account WHERE account_id = 1').first();
		expect(row).toEqual({ email: 'admin@example.com', isDel: 0 });
	});

	it('删除专用预览邮箱的最后一个链接时回收占位账号', async () => {
		await env.db.prepare("INSERT INTO account (account_id, email, user_id, is_preview) VALUES (2, 'preview@example.com', 1, 1)").run();
		await env.db.prepare("INSERT INTO preview (preview_id, email, token, account_id) VALUES (2, 'preview@example.com', 'token2', 2)").run();
		const context = { env: { db: env.db, admin: 'admin@example.com' }, get: () => ({ email: 'admin@example.com' }) };
		await previewService.remove(context, { previewId: 2 }, 1);
		const row = await env.db.prepare('SELECT email, is_del AS isDel, is_preview AS isPreview FROM account WHERE account_id = 2').first();
		expect(row.email).toContain('preview-deleted-2-');
		expect(row.isDel).toBe(1);
		expect(row.isPreview).toBe(0);
	});
});

describe('Outlook 密钥与 IMAP 输入保护', () => {
	beforeEach(async () => {
		await env.db.exec('DROP TABLE IF EXISTS outlook_account;');
	});

	it('账号详情不向浏览器返回密码和 refresh token，空白编辑保留原密钥', async () => {
		const context = { env: { db: env.db } };
		await outlookService.ensureSchema(context);
		await env.db.prepare(`INSERT INTO outlook_account (
			outlook_account_id, user_id, email, password, client_id, refresh_token
		) VALUES (1, 9, 'user@example.com', 'stored-password', 'client-id', 'stored-refresh-token')`).run();

		const detail = await outlookService.detail(context, 9, 1);
		expect(detail.password).toBe('');
		expect(detail.refreshToken).toBe('');
		expect(detail.hasPassword).toBe(true);
		expect(detail.hasRefreshToken).toBe(true);

		await outlookService.save(context, 9, {
			outlookAccountId: 1,
			email: 'user@example.com',
			clientId: 'client-id',
			password: '',
			refreshToken: ''
		});
		const stored = await env.db.prepare('SELECT password, refresh_token AS refreshToken FROM outlook_account WHERE outlook_account_id = 1').first();
		expect(stored).toEqual({ password: 'stored-password', refreshToken: 'stored-refresh-token' });
	});

	it('只接受数字 IMAP UID，拒绝命令换行注入', () => {
		expect(parseImapMessageId('imap:inbox:123')).toEqual({ folder: 'inbox', uid: '123' });
		expect(() => parseImapMessageId('imap:inbox:123%0D%0AUID%20STORE%201%20%2BFLAGS%20(\\Deleted)')).toThrow();
		expect(() => parseImapMessageId('graph-message-id')).toThrow();
	});
});

describe('对象存储响应规范化', () => {
	it('缺失对象返回 404，并保留已有 Response', async () => {
		const missing = objectToResponse(null);
		expect(missing.status).toBe(404);
		const original = new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
		expect(objectToResponse(original)).toBe(original);
	});

	it('把 R2 对象元数据转换为响应头', async () => {
		const response = objectToResponse({
			body: 'content',
			httpMetadata: { contentType: 'text/plain', cacheControl: 'public, max-age=60' }
		});
		expect(await response.text()).toBe('content');
		expect(response.headers.get('content-type')).toBe('text/plain');
		expect(response.headers.get('cache-control')).toBe('public, max-age=60');
	});
});
