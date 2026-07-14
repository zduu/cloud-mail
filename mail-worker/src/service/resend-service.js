import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { Resend } from 'resend';
import { t } from '../i18n/i18n';

const resendService = {

	async webhooks(c, payload, headers) {
		if (!c.env.resend_webhook_secret) {
			throw new BizError(t('resendWebhookNotConfigured'), 503);
		}
		if (!headers?.id || !headers?.timestamp || !headers?.signature) {
			throw new BizError(t('resendWebhookInvalid'), 401);
		}

		let body;
		try {
			body = new Resend('re_webhook_verification_only').webhooks.verify({
				payload,
				headers,
				webhookSecret: c.env.resend_webhook_secret
			});
		} catch (error) {
			throw new BizError(t('resendWebhookInvalid'), 401);
		}

		if (!body?.data?.email_id || !body?.type) {
			throw new BizError(t('resendWebhookInvalid'), 400);
		}

		const params = {
			resendEmailId: body.data.email_id,
			status: emailConst.status.SENT
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			let bounce = body.data.bounce
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = body.data.failed.reason
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default resendService
