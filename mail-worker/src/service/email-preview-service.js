import orm from '../entity/orm';
import emailPreview from '../entity/email-preview';
import email from '../entity/email';
import BizError from '../error/biz-error';
import attService from './att-service';
import { and, desc, eq } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import { t } from '../i18n/i18n';
import dayjs from 'dayjs';

const emailPreviewService = {

	async create(c, params, userId) {
		let { emailId, expireTime } = params;
		emailId = Number(emailId);

		if (!emailId) {
			throw new BizError(t('previewEmailInvalid'));
		}

		const existing = await orm(c)
			.select()
			.from(emailPreview)
			.where(and(
				eq(emailPreview.emailId, emailId),
				eq(emailPreview.userId, userId)
			))
			.orderBy(desc(emailPreview.previewId))
			.get();

		if (existing) {
			return existing;
		}

		const emailRow = await orm(c)
			.select()
			.from(email)
			.where(and(
				eq(email.emailId, emailId),
				eq(email.userId, userId),
				eq(email.isDel, isDel.NORMAL)
			))
			.get();

		if (!emailRow) {
			throw new BizError(t('previewEmailNotExist'), 404);
		}

		let expireTimeVal = null;
		if (expireTime) {
			const time = dayjs(expireTime);
			if (!time.isValid()) {
				throw new BizError(t('previewExpireInvalid'));
			}
			expireTimeVal = time.utc().format('YYYY-MM-DD HH:mm:ss');
		}

		const token = await this.genToken(c);

		return await orm(c).insert(emailPreview).values({
			emailId: emailRow.emailId,
			userId,
			token,
			expireTime: expireTimeVal
		}).returning().get();
	},

	async detail(c, params) {
		const { token } = params;

		const previewRow = await this.selectByToken(c, token);
		if (!previewRow) {
			throw new BizError(t('previewEmailInvalidToken'), 404);
		}

		if (previewRow.expireTime && dayjs.utc().isAfter(dayjs.utc(previewRow.expireTime))) {
			throw new BizError(t('previewEmailExpired'), 403);
		}

		const emailRow = await orm(c)
			.select()
			.from(email)
			.where(and(
				eq(email.emailId, previewRow.emailId),
				eq(email.isDel, isDel.NORMAL)
			))
			.get();

		if (!emailRow) {
			throw new BizError(t('previewEmailNotExist'), 404);
		}

		const attList = await attService.selectByEmailIds(c, [emailRow.emailId]);

		return {
			emailId: emailRow.emailId,
			subject: emailRow.subject,
			content: emailRow.content,
			text: emailRow.text,
			createTime: emailRow.createTime,
			attList
		};
	},

	async list(c, userId) {
		const rows = await orm(c)
			.select({
				previewId: emailPreview.previewId,
				emailId: emailPreview.emailId,
				token: emailPreview.token,
				expireTime: emailPreview.expireTime,
				createTime: emailPreview.createTime,
				subject: email.subject,
				emailCreateTime: email.createTime
			})
			.from(emailPreview)
			.leftJoin(email, eq(email.emailId, emailPreview.emailId))
			.where(eq(emailPreview.userId, userId))
			.orderBy(desc(emailPreview.previewId))
			.all();

		return rows;
	},

	async remove(c, params, userId) {
		const { previewId } = params;
		if (!previewId) return;
		const row = await orm(c)
			.select()
			.from(emailPreview)
			.where(and(
				eq(emailPreview.previewId, Number(previewId)),
				eq(emailPreview.userId, userId)
			))
			.get();
		if (!row) return;
		await orm(c)
			.delete(emailPreview)
			.where(eq(emailPreview.previewId, Number(previewId)))
			.run();
	},

	async updateExpire(c, params, userId) {
		const { previewId, days } = params;
		if (!previewId) return null;

		let expireTime = null;
		if (days !== null && days !== undefined && days !== '') {
			const num = Number(days);
			if (Number.isNaN(num) || num <= 0) {
				throw new BizError(t('previewExpireInvalid'));
			}
			expireTime = dayjs.utc().add(num, 'day').format('YYYY-MM-DD HH:mm:ss');
		}

		await orm(c)
			.update(emailPreview)
			.set({ expireTime })
			.where(and(
				eq(emailPreview.previewId, Number(previewId)),
				eq(emailPreview.userId, userId)
			))
			.run();

		return orm(c)
			.select()
			.from(emailPreview)
			.where(eq(emailPreview.previewId, Number(previewId)))
			.get();
	},

	async selectByToken(c, token) {
		if (!token) return null;
		return orm(c).select().from(emailPreview).where(eq(emailPreview.token, token)).get();
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

export default emailPreviewService;
