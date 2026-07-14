import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import publicService from '../src/service/public-service';
import loginService from '../src/service/login-service';
import JwtUtils from '../src/utils/jwt-utils';
import constant from '../src/const/constant';
import KvConst from '../src/const/kv-const';
import { verifyOAuthBindToken } from '../src/service/oauth-service';

describe('公共 API 鉴权', () => {
	it('未配置公共 token 时也拒绝匿名请求', async () => {
		await env.kv.delete(KvConst.PUBLIC_KEY);
		const response = await SELF.fetch('http://example.com/api/public/emailList', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
		const body = await response.json();
		expect(body.code).toBe(401);
	});
});

describe('公共批量用户写入', () => {
	beforeEach(async () => {
		await env.db.exec('DROP TABLE IF EXISTS account; DROP TABLE IF EXISTS user; DROP TABLE IF EXISTS role;');
		await env.db.prepare(`
			CREATE TABLE role (
				role_id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				sort INTEGER,
				is_default INTEGER DEFAULT 0
			)
		`).run();
		await env.db.prepare(`
			CREATE TABLE user (
				user_id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL UNIQUE,
				password TEXT NOT NULL,
				salt TEXT NOT NULL,
				type INTEGER,
				os TEXT,
				browser TEXT,
				active_ip TEXT,
				create_ip TEXT,
				device TEXT,
				active_time TEXT,
				create_time TEXT
			)
		`).run();
		await env.db.prepare(`
			CREATE TABLE account (
				account_id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL UNIQUE,
				name TEXT,
				user_id INTEGER NOT NULL DEFAULT 0
			)
		`).run();
		await env.db.prepare("INSERT INTO role (name, sort, is_default) VALUES ('user', 1, 1)").run();
	});

	it('使用绑定参数保存包含引号的数据而不执行注入 SQL', async () => {
		const maliciousIp = "1.2.3.4'); DROP TABLE role; --";
		const context = {
			env: { db: env.db, domain: ['example.com'] },
			req: {
				header(name) {
					if (name === 'X-Forwarded-For') return maliciousIp;
					if (name === 'user-agent') return 'Security regression test';
					return '';
				}
			}
		};

		await publicService.addUser(context, {
			list: [{ email: "o'hara@example.com", password: 'safe-password' }]
		});

		const user = await env.db.prepare('SELECT email, active_ip AS activeIp FROM user').first();
		const role = await env.db.prepare('SELECT COUNT(*) AS total FROM role').first();
		expect(user.email).toBe("o'hara@example.com");
		expect(user.activeIp).toBe(maliciousIp);
		expect(role.total).toBe(1);
	});
});

describe('OAuth 绑定授权', () => {
	const context = { env: { jwt_secret: 'oauth-bind-test-secret' } };

	it('只接受短期且用途匹配的绑定 token', async () => {
		const token = await JwtUtils.generateToken(context, {
			purpose: 'oauth-bind',
			oauthUserId: '123'
		}, 600);
		await expect(verifyOAuthBindToken(context, token, '123')).resolves.toBe('123');
		await expect(verifyOAuthBindToken(context, token, '456')).rejects.toMatchObject({ code: 403 });
	});

	it('拒绝已过期的绑定 token', async () => {
		const token = await JwtUtils.generateToken(context, {
			purpose: 'oauth-bind',
			oauthUserId: '123'
		}, -1);
		await expect(verifyOAuthBindToken(context, token, '123')).rejects.toMatchObject({ code: 401 });
	});
});

describe('退出登录会话期限', () => {
	it('重写 KV 会话时保留 30 天过期时间', async () => {
		const jwtSecret = 'logout-test-secret';
		const jwt = await JwtUtils.generateToken({ env: { jwt_secret: jwtSecret } }, {
			userId: 7,
			token: 'session-a'
		});
		let stored;
		const context = {
			env: {
				jwt_secret: jwtSecret,
				kv: {
					async get() {
						return { tokens: ['session-a', 'session-b'] };
					},
					async put(key, value, options) {
						stored = { key, value: JSON.parse(value), options };
					}
				}
			},
			req: { header: () => jwt }
		};

		await loginService.logout(context, 7);
		expect(stored.key).toBe(`${KvConst.AUTH_INFO}7`);
		expect(stored.value.tokens).toEqual(['session-b']);
		expect(stored.options.expirationTtl).toBe(constant.TOKEN_EXPIRE);
	});
});
