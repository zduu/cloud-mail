import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import { ensureSchema } from '../init/schema-migrate';
import userContext from '../security/user-context';

async function tryEnsureSchema(c) {
	try {
		await ensureSchema(c);
	} catch (e) {
		console.warn(`schema check failed: ${e.message}`);
	}
}

async function loadSettingFromDb(c) {
	try {
		return await orm(c).select().from(setting).get();
	} catch (e) {
		await tryEnsureSchema(c);
		return await orm(c).select().from(setting).get();
	}
}

const settingService = {

	async refresh(c) {
		await tryEnsureSchema(c);
		const settingRow = await loadSettingFromDb(c);
		try {
			settingRow.resendTokens = JSON.parse(settingRow.resendTokens || '{}');
		} catch (e) {
			settingRow.resendTokens = {};
		}
		try {
			settingRow.loginDomainList = JSON.parse(settingRow.loginDomainList || '[]');
		} catch (e) {
			settingRow.loginDomainList = [];
		}
		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		settingRow.domainList = domainList;

		const validLoginDomainList = settingRow.loginDomainList.filter(item => domainList.includes(item));
		settingRow.loginDomainList = validLoginDomainList;

		const resendDomainSet = new Set(Object.keys(settingRow.resendTokens || {}).map(domain => domain.toLowerCase()));
		settingRow.sendDomainList = domainList.filter(item => resendDomainSet.has(item.replace(/^@/, '').toLowerCase()));

		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		await tryEnsureSchema(c);

		let settingRow = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		// 本地首次启动 KV 可能为空，回落到数据库并刷新 KV
		if (!settingRow) {
			settingRow = await loadSettingFromDb(c);
			if (!settingRow) {
				throw new BizError(t('initFirst'));
			}
			try {
				// 确保 resendTokens 为对象
				settingRow.resendTokens = JSON.parse(settingRow.resendTokens || '{}');
			} catch (e) {
				settingRow.resendTokens = {};
			}
			try {
				settingRow.loginDomainList = JSON.parse(settingRow.loginDomainList || '[]');
			} catch (e) {
				settingRow.loginDomainList = [];
			}
			await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
		}

		if (!Array.isArray(settingRow.loginDomainList)) {
			try {
				settingRow.loginDomainList = JSON.parse(settingRow.loginDomainList || '[]');
			} catch (error) {
				settingRow.loginDomainList = [];
			}
		}

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		settingRow.domainList = domainList;

		const validLoginDomainList = settingRow.loginDomainList.filter(item => domainList.includes(item));
		settingRow.loginDomainList = validLoginDomainList;

		const resendDomainSet = new Set(Object.keys(settingRow.resendTokens || {}).map(domain => domain.toLowerCase()));
		settingRow.sendDomainList = domainList.filter(item => resendDomainSet.has(item.replace(/^@/, '').toLowerCase()));


		let linuxdoSwitch = c.env.linuxdo_switch;
		let projectLink = c.env.project_link;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true
		} else {
			linuxdoSwitch = false
		}

		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		settingRow.projectLink = projectLink;

		settingRow.linuxdoClientId = c.env.linuxdo_client_id;
		settingRow.linuxdoCallbackUrl = c.env.linuxdo_callback_url;
		settingRow.linuxdoSwitch = linuxdoSwitch;

		settingRow.emailPrefixFilter = settingRow.emailPrefixFilter?.split(",").filter(Boolean) ?? [];

		c.set?.('setting', settingRow);
		return settingRow;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (params.loginDomainList !== undefined) {
			if (Array.isArray(params.loginDomainList)) {
				params.loginDomainList = JSON.stringify(params.loginDomainList);
			} else if (!params.loginDomainList) {
				params.loginDomainList = '[]';
			}
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		params.resendTokens = JSON.stringify(resendTokens);
		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c, true);
		const token = await userContext.getToken(c);
		const loginDomainList = settingRow.loginDomainList.length > 0 ? settingRow.loginDomainList : settingRow.domainList;
		const hideDomain = settingRow.loginDomain === 1 && !token;

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			domainList: hideDomain ? [] : settingRow.domainList,
			loginDomainList: hideDomain ? [] : loginDomainList,
			sendDomainList: settingRow.sendDomainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoCallbackUrl: settingRow.linuxdoCallbackUrl,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink
		};
	},

};

export default settingService;
