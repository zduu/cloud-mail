import orm from '../entity/orm';
import preview from '../entity/preview';
import account from '../entity/account';
import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import accountService from './account-service';
import userService from './user-service';
import settingService from './setting-service';
import emailService from './email-service';
import { emailConst, isDel } from '../const/entity-const';
import { t } from '../i18n/i18n';
import { desc, eq } from 'drizzle-orm';

const previewService = {

	async create(c, params, userId) {

		await this.ensureAdmin(c, userId);

		let { email } = params;
		email = (email || '').trim().toLowerCase();

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		const domainTag = '@' + emailUtils.getDomain(email);
		const { domainList } = await settingService.query(c);

		if (!domainList.includes(domainTag)) {
			throw new BizError(t('notExistDomain'));
		}

		const adminUser = await userService.selectByEmailIncludeDel(c, c.env.admin);
		if (!adminUser) {
			throw new BizError(t('adminNotExist'));
		}

		let accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.userId !== adminUser.userId) {
			throw new BizError(t('previewEmailUsed'));
		}

		if (!accountRow) {
			accountRow = await orm(c).insert(account).values({
				email,
				userId: adminUser.userId,
				name: emailUtils.getName(email)
			}).returning().get();
		} else if (accountRow.isDel === isDel.DELETE) {
			await accountService.restoreByEmail(c, email);
			accountRow = await accountService.selectByEmailIncludeDel(c, email);
		}

		const token = await this.genToken(c);

		return await orm(c).insert(preview).values({
			email,
			token,
			accountId: accountRow.accountId
		}).returning().get();
	},

	async list(c, userId) {
		await this.ensureAdmin(c, userId);
		return orm(c).select().from(preview).orderBy(desc(preview.previewId)).all();
	},

	async remove(c, params, userId) {
		await this.ensureAdmin(c, userId);
		const { previewId } = params;
		await orm(c).delete(preview).where(eq(preview.previewId, Number(previewId))).run();
	},

	async selectByToken(c, token) {
		if (!token) return null;
		return orm(c).select().from(preview).where(eq(preview.token, token)).get();
	},

	async pageList(c, params) {
		const { token, emailId = 0, size = 20, timeSort = 0 } = params;
		let { type = emailConst.type.RECEIVE } = params;

		const previewRow = await this.selectByToken(c, token);
		if (!previewRow) {
			throw new BizError(t('previewInvalidToken'), 404);
		}

		const accountRow = await accountService.selectById(c, previewRow.accountId);
		if (!accountRow) {
			throw new BizError(t('previewAccountNotExist'), 404);
		}

		type = Number(type);
		const queryParams = {
			emailId,
			type,
			accountId: accountRow.accountId,
			size,
			timeSort,
			allAccount: 0
		};

		const data = await emailService.list(c, queryParams, accountRow.userId);

		return {
			...data,
			email: accountRow.email
		};
	},

	async ensureAdmin(c, userId) {
		const ctxUser = c.get?.('user');
		if (ctxUser?.email === c.env.admin) {
			return;
		}
		const userRow = await userService.selectByIdIncludeDel(c, userId);
		if (!userRow || userRow.email !== c.env.admin) {
			throw new BizError(t('unauthorized'), 403);
		}
	},

	async genToken(c) {
		const gen = () => {
			const array = new Uint8Array(20);
			crypto.getRandomValues(array);
			return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
		};

		let token = gen();
		let exists = await this.selectByToken(c, token);

		while (exists) {
			token = gen();
			exists = await this.selectByToken(c, token);
		}

		return token;
	}
};

export default previewService;
