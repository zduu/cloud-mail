import emailUtils from './email-utils';

const adminUtils = {
	isAdminEmail(c, email) {
		if (!email || !c?.env?.admin) {
			return false;
		}
		return email.toLowerCase() === c.env.admin.toLowerCase();
	},

	getAdminDomain(c) {
		if (!c?.env?.admin) {
			return null;
		}
		return emailUtils.getDomain(c.env.admin.toLowerCase());
	},

	getAdminDomainTag(c) {
		const domain = this.getAdminDomain(c);
		return domain ? `@${domain}` : null;
	}
};

export default adminUtils;
