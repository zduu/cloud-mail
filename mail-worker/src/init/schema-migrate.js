import KvConst from '../const/kv-const';

export const LATEST_SCHEMA_VERSION = 5;

async function getSchemaVersion(c) {
	const raw = await c.env.kv.get(KvConst.SCHEMA_VERSION);
	const version = Number(raw);
	return Number.isFinite(version) ? version : 0;
}

export async function setSchemaVersion(c, version = LATEST_SCHEMA_VERSION) {
	await c.env.kv.put(KvConst.SCHEMA_VERSION, String(version));
}

async function tableExists(c, tableName) {
	const row = await c.env.db
		.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
		.bind(tableName)
		.first();
	return !!row;
}

export async function ensureSchema(c) {
	const current = await getSchemaVersion(c);
	if (current >= LATEST_SCHEMA_VERSION) {
		return;
	}

	const hasSetting = await tableExists(c, 'setting');
	const hasAccount = await tableExists(c, 'account');
	const hasPerm = await tableExists(c, 'perm');

	if (!hasSetting) {
		// 尚未初始化数据库，等待显式 init
		return;
	}

	if (current < 1 && hasSetting) {
		try {
			await c.env.db.prepare(
				`ALTER TABLE setting ADD COLUMN login_domain_list TEXT NOT NULL DEFAULT '[]';`
			).run();
		} catch (e) {
			console.warn(`跳过字段 login_domain_list：${e.message}`);
		}
	}

	if (current < 2) {
		try {
			await c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS preview (
					preview_id INTEGER PRIMARY KEY AUTOINCREMENT,
					email TEXT NOT NULL,
					token TEXT NOT NULL,
					account_id INTEGER NOT NULL,
					expire_time TEXT,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
				)
			`).run();
			await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_preview_token ON preview(token);`).run();
		} catch (e) {
			console.warn(`跳过表 preview：${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE preview ADD COLUMN expire_time TEXT;`).run();
		} catch (e) {
			console.warn(`跳过字段 preview.expire_time：${e.message}`);
		}

		if (hasPerm) {
			try {
				const { total } = await c.env.db.prepare(`SELECT COUNT(*) as total FROM perm WHERE perm_key = 'preview:manage'`).first();
				if (total === 0) {
					await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ('预览邮箱', 'preview:manage', 17, 2, 3)`).run();
				}
			} catch (e) {
				console.warn(`跳过权限 preview:manage：${e.message}`);
			}
		}
	}

	if (current < 3 && hasAccount) {
		try {
			await c.env.db.prepare(`ALTER TABLE account ADD COLUMN is_preview INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`跳过字段 account.is_preview：${e.message}`);
		}
	}

	if (current < 4) {
		try {
			await c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS email_preview (
					preview_id INTEGER PRIMARY KEY AUTOINCREMENT,
					email_id INTEGER NOT NULL,
					user_id INTEGER NOT NULL,
					token TEXT NOT NULL,
					expire_time TEXT,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
				)
			`).run();
			await c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_preview_token ON email_preview(token);`).run();
		} catch (e) {
			console.warn(`跳过表 email_preview：${e.message}`);
		}
	}

	if (current < 5 && hasPerm) {
		try {
			const { total } = await c.env.db.prepare(`SELECT COUNT(*) as total FROM perm WHERE perm_key = 'preview-email:manage'`).first();
			if (total === 0) {
				await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ('预览邮件', 'preview-email:manage', 17, 2, 4)`).run();
			}
		} catch (e) {
			console.warn(`跳过权限 preview-email:manage：${e.message}`);
		}
	}

	await setSchemaVersion(c);
}
