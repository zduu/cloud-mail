import KvConst from '../const/kv-const';

export const LATEST_SCHEMA_VERSION = 7;

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

	if (current < 6 && hasPerm) {
		try {
			const previewRow = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview:manage'`).first();
			if (previewRow) {
				const { total: mailboxCreateTotal } = await c.env.db.prepare(`SELECT COUNT(*) as total FROM perm WHERE perm_key = 'preview:mailbox:create'`).first();
				if (mailboxCreateTotal === 0) {
					await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ('预览邮箱-创建', 'preview:mailbox:create', ?, 2, 0.1)`).bind(previewRow.permId).run();
				}
				const { total: mailboxDeleteTotal } = await c.env.db.prepare(`SELECT COUNT(*) as total FROM perm WHERE perm_key = 'preview:mailbox:delete'`).first();
				if (mailboxDeleteTotal === 0) {
					await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ('预览邮箱-删除', 'preview:mailbox:delete', ?, 2, 0.2)`).bind(previewRow.permId).run();
				}
				const { total: mailboxExpireTotal } = await c.env.db.prepare(`SELECT COUNT(*) as total FROM perm WHERE perm_key = 'preview:mailbox:expire'`).first();
				if (mailboxExpireTotal === 0) {
					await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ('预览邮箱-有效时间', 'preview:mailbox:expire', ?, 2, 0.3)`).bind(previewRow.permId).run();
				}
			}
		} catch (e) {
			console.warn(`跳过权限 preview:mailbox:*：${e.message}`);
		}

		try {
			const emailPreviewRow = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview-email:manage'`).first();
			if (emailPreviewRow) {
				const { total: emailCreateTotal } = await c.env.db.prepare(`SELECT COUNT(*) as total FROM perm WHERE perm_key = 'preview-email:create'`).first();
				if (emailCreateTotal === 0) {
					await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ('预览邮件-创建', 'preview-email:create', ?, 2, 0.1)`).bind(emailPreviewRow.permId).run();
				}
				const { total: emailDeleteTotal } = await c.env.db.prepare(`SELECT COUNT(*) as total FROM perm WHERE perm_key = 'preview-email:delete'`).first();
				if (emailDeleteTotal === 0) {
					await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ('预览邮件-删除', 'preview-email:delete', ?, 2, 0.2)`).bind(emailPreviewRow.permId).run();
				}
				const { total: emailExpireTotal } = await c.env.db.prepare(`SELECT COUNT(*) as total FROM perm WHERE perm_key = 'preview-email:expire'`).first();
				if (emailExpireTotal === 0) {
					await c.env.db.prepare(`INSERT INTO perm (name, perm_key, pid, type, sort) VALUES ('预览邮件-有效时间', 'preview-email:expire', ?, 2, 0.3)`).bind(emailPreviewRow.permId).run();
				}
			}
		} catch (e) {
			console.warn(`跳过权限 preview-email:*：${e.message}`);
		}
	}

	if (current < 7 && hasPerm) {
		try {
			const previewManage = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview:manage'`).first();
			if (previewManage) {
				// Move parent to top-level and remove perm_key
				await c.env.db.prepare(`UPDATE perm SET pid = 0, type = 1, perm_key = NULL, sort = 6.5 WHERE perm_id = ?`).bind(previewManage.permId).run();
				// Ensure children exist under this parent
				const childCreate = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview:mailbox:create'`).first();
				const childDelete = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview:mailbox:delete'`).first();
				const childExpire = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview:mailbox:expire'`).first();
				if (childCreate) await c.env.db.prepare(`UPDATE perm SET pid = ? WHERE perm_id = ?`).bind(previewManage.permId, childCreate.permId).run();
				if (childDelete) await c.env.db.prepare(`UPDATE perm SET pid = ? WHERE perm_id = ?`).bind(previewManage.permId, childDelete.permId).run();
				if (childExpire) await c.env.db.prepare(`UPDATE perm SET pid = ? WHERE perm_id = ?`).bind(previewManage.permId, childExpire.permId).run();

				// Migrate role_perm: old manage -> children
				const rows = await c.env.db.prepare(`SELECT role_id as roleId FROM role_perm WHERE perm_id = ?`).bind(previewManage.permId).all();
				const roleIds = rows.results?.map(r => r.roleId) || [];
				const inserts = [];
				for (const roleId of roleIds) {
					if (childCreate) inserts.push(c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM role_perm WHERE role_id = ? AND perm_id = ?);`).bind(roleId, childCreate.permId, roleId, childCreate.permId));
					if (childDelete) inserts.push(c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM role_perm WHERE role_id = ? AND perm_id = ?);`).bind(roleId, childDelete.permId, roleId, childDelete.permId));
					if (childExpire) inserts.push(c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM role_perm WHERE role_id = ? AND perm_id = ?);`).bind(roleId, childExpire.permId, roleId, childExpire.permId));
				}
				if (inserts.length) {
					await c.env.db.batch(inserts);
				}
			}
		} catch (e) {
			console.warn(`跳过权限预览邮箱迁移：${e.message}`);
		}

		try {
			const emailPreviewManage = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview-email:manage'`).first();
			if (emailPreviewManage) {
				await c.env.db.prepare(`UPDATE perm SET pid = 0, type = 1, perm_key = NULL, sort = 6.6 WHERE perm_id = ?`).bind(emailPreviewManage.permId).run();

				const childCreate = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview-email:create'`).first();
				const childDelete = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview-email:delete'`).first();
				const childExpire = await c.env.db.prepare(`SELECT perm_id as permId FROM perm WHERE perm_key = 'preview-email:expire'`).first();
				if (childCreate) await c.env.db.prepare(`UPDATE perm SET pid = ? WHERE perm_id = ?`).bind(emailPreviewManage.permId, childCreate.permId).run();
				if (childDelete) await c.env.db.prepare(`UPDATE perm SET pid = ? WHERE perm_id = ?`).bind(emailPreviewManage.permId, childDelete.permId).run();
				if (childExpire) await c.env.db.prepare(`UPDATE perm SET pid = ? WHERE perm_id = ?`).bind(emailPreviewManage.permId, childExpire.permId).run();

				const rows = await c.env.db.prepare(`SELECT role_id as roleId FROM role_perm WHERE perm_id = ?`).bind(emailPreviewManage.permId).all();
				const roleIds = rows.results?.map(r => r.roleId) || [];
				const inserts = [];
				for (const roleId of roleIds) {
					if (childCreate) inserts.push(c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM role_perm WHERE role_id = ? AND perm_id = ?);`).bind(roleId, childCreate.permId, roleId, childCreate.permId));
					if (childDelete) inserts.push(c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM role_perm WHERE role_id = ? AND perm_id = ?);`).bind(roleId, childDelete.permId, roleId, childDelete.permId));
					if (childExpire) inserts.push(c.env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM role_perm WHERE role_id = ? AND perm_id = ?);`).bind(roleId, childExpire.permId, roleId, childExpire.permId));
				}
				if (inserts.length) {
					await c.env.db.batch(inserts);
				}
			}
		} catch (e) {
			console.warn(`跳过权限预览邮件迁移：${e.message}`);
		}
	}

	await setSchemaVersion(c);
}
