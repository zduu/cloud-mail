import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import PostalMime from 'postal-mime';
import { connect } from 'cloudflare:sockets';

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const IMAP_TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const IMAP_SCOPE = 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access';
const IMAP_HOSTS = ['outlook.live.com', 'outlook.office365.com'];
const IMAP_PORT = 993;
const IMAP_TIMEOUT_MS = 45000;
const IMAP_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const IMAP_ID_PREFIX = 'imap:';

const TOKEN_SCOPE_CANDIDATES = {
	graph: [
		'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read offline_access',
		'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access',
		'https://graph.microsoft.com/.default'
	]
};

const FOLDER_MAP = {
	inbox: 'inbox',
	junkemail: 'junkemail',
	deleteditems: 'deleteditems',
	sentitems: 'sentitems',
	drafts: 'drafts',
	trash: 'deleteditems'
};

const IMAP_FOLDER_CANDIDATES = {
	inbox: ['INBOX', 'Inbox'],
	junkemail: ['Junk', 'Junk Email', 'Spam', 'SPAM'],
	deleteditems: ['Deleted', 'Deleted Items', 'Trash'],
	sentitems: ['Sent', 'Sent Items'],
	drafts: ['Drafts'],
	trash: ['Deleted', 'Deleted Items', 'Trash']
};

function nowIso() {
	return new Date().toISOString();
}

function normalizeEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function cleanText(value, max = 500) {
	return String(value || '').trim().slice(0, max);
}

function normalizeLimit(value, fallback = 30, max = 50) {
	const num = Number(value);
	if (!Number.isFinite(num) || num <= 0) {
		return fallback;
	}
	return Math.min(Math.floor(num), max);
}

function normalizeOffset(value) {
	const num = Number(value);
	if (!Number.isFinite(num) || num < 0) {
		return 0;
	}
	return Math.floor(num);
}

function isEmail(value) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isProbableClientId(value) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function resolveTokenOrder(third, fourth, accountFormat = 'client_id_refresh_token') {
	third = cleanText(third, 2000);
	fourth = cleanText(fourth, 4000);
	const thirdIsClientId = isProbableClientId(third);
	const fourthIsClientId = isProbableClientId(fourth);
	if (thirdIsClientId && !fourthIsClientId) {
		return { clientId: third, refreshToken: fourth };
	}
	if (fourthIsClientId && !thirdIsClientId) {
		return { clientId: fourth, refreshToken: third };
	}
	if (accountFormat === 'refresh_token_client_id') {
		return { clientId: fourth, refreshToken: third };
	}
	return { clientId: third, refreshToken: fourth };
}

function parseAccountString(accountString, accountFormat) {
	const parts = String(accountString || '').trim().split('----').map(item => item.trim());
	if (parts.length < 4 || !parts[0]) {
		throw new BizError(t('outlookAccountStringInvalid'));
	}
	const { clientId, refreshToken } = resolveTokenOrder(parts[2], parts[3], accountFormat);
	if (!clientId || !refreshToken) {
		throw new BizError(t('outlookAccountStringInvalid'));
	}
	return {
		email: parts[0],
		password: parts[1] || '',
		clientId,
		refreshToken
	};
}

function normalizeAccount(row = {}, includeSecret = false) {
	return {
		outlookAccountId: row.outlook_account_id,
		userId: row.user_id,
		email: row.email,
		password: includeSecret ? row.password || '' : '',
		clientId: row.client_id || '',
		refreshToken: includeSecret ? row.refresh_token || '' : '',
		hasRefreshToken: !!row.refresh_token,
		remark: row.remark || '',
		status: row.status || 'active',
		lastRefreshAt: row.last_refresh_at || '',
		lastRefreshStatus: row.last_refresh_status || '',
		lastRefreshError: row.last_refresh_error || '',
		createTime: row.create_time || '',
		updateTime: row.update_time || ''
	};
}

function normalizeFolder(folder) {
	const key = String(folder || 'inbox').trim().toLowerCase();
	return FOLDER_MAP[key] || FOLDER_MAP.inbox;
}

function imapFolderCandidates(folder) {
	const key = normalizeFolder(folder);
	return IMAP_FOLDER_CANDIDATES[key] || IMAP_FOLDER_CANDIDATES.inbox;
}

function graphHeaders(accessToken, prefer = '') {
	const headers = {
		Authorization: `Bearer ${accessToken}`
	};
	if (prefer) {
		headers.Prefer = prefer;
	}
	return headers;
}

async function responseDetail(response) {
	const contentType = response.headers.get('content-type') || '';
	try {
		if (contentType.includes('application/json')) {
			return await response.json();
		}
		return await response.text();
	} catch (e) {
		return response.statusText || 'Unknown error';
	}
}

function shortError(detail) {
	if (!detail) {
		return '';
	}
	if (typeof detail === 'string') {
		return detail.slice(0, 1000);
	}
	const detailError = detail?.error;
	const errorCode = typeof detailError === 'object' ? detailError?.code : detailError;
	const errorMessage = typeof detailError === 'object'
		? detailError?.message
		: (detail?.error_description || detail?.message);
	if (errorCode && errorMessage) {
		return `${errorCode}: ${errorMessage}`.slice(0, 1000);
	}
	if (errorMessage) {
		return String(errorMessage).slice(0, 1000);
	}
	if (errorCode) {
		return String(errorCode).slice(0, 1000);
	}
	try {
		return JSON.stringify(detail).slice(0, 1000);
	} catch (e) {
		return String(detail).slice(0, 1000);
	}
}

function shouldRetryToken(response, detail) {
	if (![400, 401, 403].includes(response.status)) {
		return false;
	}
	const text = shortError(detail).toLowerCase();
	return [
		'invalid_scope',
		'consent',
		'interaction_required',
		'aadsts90023',
		'aadsts70000',
		'aadsts70011',
		'no applicable permissions',
		'requested are unauthorized or expired'
	].some(marker => text.includes(marker));
}

function base64ToBytes(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function bytesToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
	}
	return btoa(binary);
}

function utf8ToBase64(value) {
	return bytesToBase64(new TextEncoder().encode(value));
}

function concatBytes(chunks, totalLength) {
	const resultBytes = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		resultBytes.set(chunk, offset);
		offset += chunk.length;
	}
	return resultBytes;
}

function withTimeout(promise, ms, message) {
	let timeoutId;
	const timeout = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error(message)), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shorten(value, max = 1000) {
	return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function stripHtml(html) {
	return String(html || '')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function toIsoString(value) {
	if (!value) {
		return '';
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return String(value);
	}
	return date.toISOString();
}

function normalizeEmailAddress(value = {}) {
	const emailAddress = value.emailAddress || value.EmailAddress || value;
	return {
		name: emailAddress.name || emailAddress.Name || '',
		address: emailAddress.address || emailAddress.Address || ''
	};
}

function normalizeRecipient(value = {}) {
	return {
		emailAddress: normalizeEmailAddress(value.emailAddress || value.EmailAddress || value)
	};
}

function normalizeMessageSummary(item = {}) {
	return {
		id: item.id || item.Id,
		subject: item.subject || item.Subject || '',
		from: normalizeEmailAddress(item.from || item.From || {}),
		toRecipients: (item.toRecipients || item.ToRecipients || []).map(normalizeRecipient),
		receivedDateTime: item.receivedDateTime || item.ReceivedDateTime || '',
		isRead: !!(item.isRead ?? item.IsRead),
		hasAttachments: !!(item.hasAttachments ?? item.HasAttachments),
		bodyPreview: item.bodyPreview || item.BodyPreview || ''
	};
}

function normalizeMessageDetail(item = {}) {
	return {
		id: item.id || item.Id,
		subject: item.subject || item.Subject || '',
		from: { emailAddress: normalizeEmailAddress(item.from || item.From || {}) },
		toRecipients: (item.toRecipients || item.ToRecipients || []).map(normalizeRecipient),
		ccRecipients: (item.ccRecipients || item.CcRecipients || []).map(normalizeRecipient),
		receivedDateTime: item.receivedDateTime || item.ReceivedDateTime || '',
		isRead: !!(item.isRead ?? item.IsRead),
		hasAttachments: !!(item.hasAttachments ?? item.HasAttachments),
		body: {
			contentType: item.body?.contentType || item.Body?.ContentType || 'html',
			content: item.body?.content || item.Body?.Content || ''
		},
		bodyPreview: item.bodyPreview || item.BodyPreview || ''
	};
}

function normalizeAttachment(item = {}) {
	return {
		id: item.id || item.Id,
		name: item.name || item.Name || 'attachment',
		contentType: item.contentType || item.ContentType || 'application/octet-stream',
		size: Number(item.size || item.Size || 0),
		isInline: !!(item.isInline ?? item.IsInline),
		contentId: String(item.contentId || item.ContentId || '').replace(/^<|>$/g, '')
	};
}

function providerLabel(provider) {
	return provider === 'graph' ? 'Graph' : provider;
}

function formatProviderError(provider, response, detail) {
	const status = `${response.status} ${response.statusText || ''}`.trim();
	const message = shortError(detail) || response.statusText || 'Unknown error';
	const challenge = authChallenge(response);
	return `${providerLabel(provider)} ${status}: ${message}${challenge ? `; ${challenge}` : ''}`;
}

function formatTokenError(provider, response, detail) {
	const status = `${response.status} ${response.statusText || ''}`.trim();
	const message = shortError(detail) || response.statusText || 'Unknown error';
	return `${providerLabel(provider)} token ${status}: ${message}`;
}

function authChallenge(response) {
	const header = response.headers.get('www-authenticate') || '';
	if (!header) {
		return '';
	}
	const description = header.match(/error_description="([^"]+)"/i)?.[1];
	const error = header.match(/error="([^"]+)"/i)?.[1];
	if (description && error) {
		return `${error}: ${description}`;
	}
	return description || header.slice(0, 800);
}

function isGraphAuthError(error) {
	const message = String(error?.message || '').toLowerCase();
	return error?.status === 401
		|| error?.status === 403
		|| message.includes('invalid_scope')
		|| message.includes('consent')
		|| message.includes('interaction_required')
		|| message.includes('no applicable permissions')
		|| message.includes('outlook 访问令牌获取失败')
		|| message.includes('failed to get outlook access token');
}

function imapMessageId(folder, uid) {
	return `${IMAP_ID_PREFIX}${encodeURIComponent(normalizeFolder(folder))}:${encodeURIComponent(String(uid))}`;
}

function isImapMessageId(messageId) {
	return String(messageId || '').startsWith(IMAP_ID_PREFIX);
}

function parseImapMessageId(messageId, fallbackFolder = 'inbox') {
	const value = String(messageId || '').trim();
	if (!value.startsWith(IMAP_ID_PREFIX)) {
		return {
			folder: normalizeFolder(fallbackFolder),
			uid: value
		};
	}
	const rest = value.slice(IMAP_ID_PREFIX.length);
	const separator = rest.indexOf(':');
	if (separator === -1) {
		return {
			folder: normalizeFolder(fallbackFolder),
			uid: decodeURIComponent(rest)
		};
	}
	return {
		folder: normalizeFolder(decodeURIComponent(rest.slice(0, separator))),
		uid: decodeURIComponent(rest.slice(separator + 1))
	};
}

function quoteImapString(value) {
	return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parseTaggedStatus(text, tag) {
	const match = String(text || '').match(new RegExp(`(?:^|\\r\\n)${escapeRegExp(tag)} (OK|NO|BAD)(?:\\s|\\r\\n|$)`, 'i'));
	return match ? match[1].toUpperCase() : '';
}

function parseExistsCount(text) {
	const match = String(text || '').match(/(?:^|\r\n)\* (\d+) EXISTS/i);
	return match ? Number(match[1]) : 0;
}

function parseUid(text) {
	return String(text || '').match(/\bUID\s+(\d+)/i)?.[1] || '';
}

function parseMailboxName(line) {
	const quoted = [...String(line || '').matchAll(/"((?:\\"|[^"])*)"/g)].map(match => match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
	if (quoted.length >= 2) {
		return quoted[quoted.length - 1];
	}
	const parts = String(line || '').trim().split(/\s+/);
	return parts[parts.length - 1]?.replace(/^"|"$/g, '') || '';
}

function extractFetchLiteral(bytes) {
	let best = null;
	for (let i = 0; i < bytes.length; i += 1) {
		if (bytes[i] !== 123) {
			continue;
		}
		let j = i + 1;
		while (j < bytes.length && bytes[j] >= 48 && bytes[j] <= 57) {
			j += 1;
		}
		if (j === i + 1 || bytes[j] !== 125 || bytes[j + 1] !== 13 || bytes[j + 2] !== 10) {
			continue;
		}
		const length = Number(new TextDecoder().decode(bytes.slice(i + 1, j)));
		const start = j + 3;
		const end = start + length;
		if (Number.isFinite(length) && end <= bytes.length && (!best || length > best.length)) {
			best = bytes.slice(start, end);
		}
	}
	return best;
}

function parseFlags(text) {
	const match = String(text || '').match(/FLAGS \(([^)]*)\)/i);
	return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

function parseInternalDate(text) {
	return String(text || '').match(/INTERNALDATE "([^"]+)"/i)?.[1] || '';
}

function normalizeParsedAddress(value = {}) {
	return {
		name: value.name || '',
		address: value.address || ''
	};
}

function normalizeParsedRecipients(list = []) {
	return (Array.isArray(list) ? list : []).map(item => ({
		emailAddress: normalizeParsedAddress(item)
	}));
}

function parsedBodyPreview(parsed = {}) {
	const text = parsed.text || stripHtml(parsed.html);
	return cleanText(text, 500);
}

function normalizeParsedSummary(parsed = {}, meta = {}) {
	const attachments = parsed.attachments || [];
	return {
		id: imapMessageId(meta.folder, meta.uid),
		subject: parsed.subject || '',
		from: normalizeParsedAddress(parsed.from || {}),
		toRecipients: normalizeParsedRecipients(parsed.to),
		receivedDateTime: toIsoString(parsed.date || meta.internalDate),
		isRead: meta.flags.includes('\\Seen'),
		hasAttachments: attachments.length > 0,
		bodyPreview: parsedBodyPreview(parsed)
	};
}

function normalizeParsedDetail(parsed = {}, meta = {}) {
	const html = parsed.html || `<pre>${escapeHtml(parsed.text || '')}</pre>`;
	return {
		id: imapMessageId(meta.folder, meta.uid),
		subject: parsed.subject || '',
		from: { emailAddress: normalizeParsedAddress(parsed.from || {}) },
		toRecipients: normalizeParsedRecipients(parsed.to),
		ccRecipients: normalizeParsedRecipients(parsed.cc),
		receivedDateTime: toIsoString(parsed.date || meta.internalDate),
		isRead: meta.flags.includes('\\Seen'),
		hasAttachments: (parsed.attachments || []).length > 0,
		body: {
			contentType: parsed.html ? 'html' : 'text',
			content: html
		},
		bodyPreview: parsedBodyPreview(parsed)
	};
}

function bytesFromAttachmentContent(content) {
	if (!content) {
		return new Uint8Array(0);
	}
	if (content instanceof Uint8Array) {
		return content;
	}
	if (content instanceof ArrayBuffer) {
		return new Uint8Array(content);
	}
	if (typeof content === 'string') {
		return new TextEncoder().encode(content);
	}
	return new Uint8Array(content);
}

function normalizeParsedAttachments(parsed = {}) {
	return (parsed.attachments || []).map((attachment, index) => {
		const bytes = bytesFromAttachmentContent(attachment.content);
		return {
			id: String(index),
			name: attachment.filename || attachment.name || `attachment-${index + 1}`,
			contentType: attachment.mimeType || attachment.contentType || 'application/octet-stream',
			size: Number(attachment.size || bytes.byteLength || 0),
			isInline: !!attachment.related,
			contentId: String(attachment.contentId || '').replace(/^<|>$/g, '')
		};
	});
}

class ImapClient {
	constructor(host) {
		this.host = host;
		this.tag = 0;
		this.reader = null;
		this.writer = null;
		this.socket = null;
	}

	async open() {
		this.socket = connect({ hostname: this.host, port: IMAP_PORT }, { secureTransport: 'on' });
		await this.socket.opened;
		this.reader = this.socket.readable.getReader();
		this.writer = this.socket.writable.getWriter();
		await this.readUntilText(/\r\n/);
	}

	nextTag() {
		this.tag += 1;
		return `A${String(this.tag).padStart(4, '0')}`;
	}

	async readUntilText(pattern, maxBytes = IMAP_MAX_RESPONSE_BYTES) {
		const chunks = [];
		const decoder = new TextDecoder('utf-8');
		let text = '';
		let totalLength = 0;
		while (true) {
			const { done, value } = await withTimeout(this.reader.read(), IMAP_TIMEOUT_MS, 'IMAP read timeout');
			if (done) {
				throw new Error('IMAP connection closed');
			}
			const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
			chunks.push(chunk);
			totalLength += chunk.length;
			if (totalLength > maxBytes) {
				throw new Error('IMAP response too large');
			}
			text += decoder.decode(chunk, { stream: true });
			if (pattern.test(text)) {
				text += decoder.decode();
				return {
					bytes: concatBytes(chunks, totalLength),
					text
				};
			}
		}
	}

	async command(commandText) {
		const tag = this.nextTag();
		await this.writer.write(new TextEncoder().encode(`${tag} ${commandText}\r\n`));
		const response = await this.readUntilText(new RegExp(`(?:^|\\r\\n)${escapeRegExp(tag)} (?:OK|NO|BAD)(?:\\s|\\r\\n|$)`, 'i'));
		const status = parseTaggedStatus(response.text, tag);
		if (status !== 'OK') {
			throw new Error(`IMAP ${status || 'ERROR'}: ${shorten(response.text, 500)}`);
		}
		return response;
	}

	async authenticate(email, accessToken) {
		const auth = utf8ToBase64(`user=${email}\x01auth=Bearer ${accessToken}\x01\x01`);
		const tag = this.nextTag();
		await this.writer.write(new TextEncoder().encode(`${tag} AUTHENTICATE XOAUTH2\r\n`));
		const first = await this.readUntilText(new RegExp(`(?:^|\\r\\n)(?:\\+|${escapeRegExp(tag)} (?:OK|NO|BAD))(?:\\s|\\r\\n|$)`, 'i'));
		const firstStatus = parseTaggedStatus(first.text, tag);
		if (firstStatus === 'OK') {
			return;
		}
		if (firstStatus) {
			throw new Error(`IMAP ${firstStatus}: ${shorten(first.text, 500)}`);
		}
		await this.writer.write(new TextEncoder().encode(`${auth}\r\n`));
		const response = await this.readUntilText(new RegExp(`(?:^|\\r\\n)${escapeRegExp(tag)} (?:OK|NO|BAD)(?:\\s|\\r\\n|$)`, 'i'));
		const status = parseTaggedStatus(response.text, tag);
		if (status !== 'OK') {
			throw new Error(`IMAP ${status || 'ERROR'}: ${shorten(response.text, 500)}`);
		}
	}

	async trySelect(folderName, readonly = true) {
		try {
			const response = await this.command(`${readonly ? 'EXAMINE' : 'SELECT'} ${quoteImapString(folderName)}`);
			return {
				name: folderName,
				exists: parseExistsCount(response.text)
			};
		} catch (e) {
			return null;
		}
	}

	async listMailboxes() {
		const response = await this.command('LIST "" "*"');
		return response.text
			.split(/\r?\n/)
			.filter(line => line.toUpperCase().startsWith('* LIST'))
			.map(parseMailboxName)
			.filter(Boolean);
	}

	async selectFolder(folder, readonly = true) {
		for (const candidate of imapFolderCandidates(folder)) {
			const selected = await this.trySelect(candidate, readonly);
			if (selected) {
				return selected;
			}
		}
		const mailboxes = await this.listMailboxes();
		const aliases = new Set(imapFolderCandidates(folder).map(item => item.toLowerCase()));
		const matched = mailboxes.find(name => aliases.has(name.toLowerCase()));
		if (matched) {
			const selected = await this.trySelect(matched, readonly);
			if (selected) {
				return selected;
			}
		}
		throw new Error(`IMAP folder not found: ${folder}`);
	}

	async fetchRaw(uid) {
		const response = await this.command(`UID FETCH ${uid} (UID FLAGS INTERNALDATE RFC822)`);
		const raw = extractFetchLiteral(response.bytes);
		if (!raw) {
			throw new Error(`IMAP message payload empty: ${uid}`);
		}
		return {
			raw,
			flags: parseFlags(response.text),
			internalDate: parseInternalDate(response.text)
		};
	}

	async fetchHeaderBySequence(sequenceNumber) {
		const response = await this.command(`FETCH ${sequenceNumber} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER])`);
		const raw = extractFetchLiteral(response.bytes);
		if (!raw) {
			throw new Error(`IMAP message header empty: ${sequenceNumber}`);
		}
		return {
			raw,
			uid: parseUid(response.text) || String(sequenceNumber),
			flags: parseFlags(response.text),
			internalDate: parseInternalDate(response.text)
		};
	}

	async storeSeen(uid, isRead) {
		await this.command(`UID STORE ${uid} ${isRead ? '+FLAGS.SILENT' : '-FLAGS.SILENT'} (\\Seen)`);
	}

	close() {
		try {
			this.writer?.write(new TextEncoder().encode(`${this.nextTag()} LOGOUT\r\n`));
		} catch (e) {
			// ignore logout errors
		}
		try {
			this.socket?.close();
		} catch (e) {
			// ignore close errors
		}
	}
}

const outlookService = {
	parseAccountString,

	async ensureSchema(c) {
		await c.env.db.prepare(`
			CREATE TABLE IF NOT EXISTS outlook_account (
				outlook_account_id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL,
				email TEXT NOT NULL,
				password TEXT NOT NULL DEFAULT '',
				client_id TEXT NOT NULL,
				refresh_token TEXT NOT NULL,
				remark TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'active',
				last_refresh_at TEXT,
				last_refresh_status TEXT NOT NULL DEFAULT '',
				last_refresh_error TEXT NOT NULL DEFAULT '',
				create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
				update_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
				UNIQUE(user_id, email)
			)
		`).run();
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_outlook_account_user ON outlook_account(user_id, update_time);`).run();
	},

	async list(c, userId) {
		await this.ensureSchema(c);
		const rows = await c.env.db.prepare(`
			SELECT * FROM outlook_account
			WHERE user_id = ?
			ORDER BY update_time DESC, outlook_account_id DESC
		`).bind(userId).all();
		return rows.results.map(row => normalizeAccount(row));
	},

	async detail(c, userId, outlookAccountId) {
		const row = await this.getAccount(c, userId, outlookAccountId);
		return normalizeAccount(row, true);
	},

	async save(c, userId, params = {}) {
		await this.ensureSchema(c);
		const parsed = params.accountString ? parseAccountString(params.accountString, params.accountFormat) : {};
		const outlookAccountId = Number(params.outlookAccountId || params.outlook_account_id || 0);
		const email = normalizeEmail(parsed.email || params.email);
		const password = cleanText(parsed.password ?? params.password, 500);
		const clientId = cleanText(parsed.clientId || params.clientId || params.client_id, 200);
		const refreshToken = cleanText(parsed.refreshToken || params.refreshToken || params.refresh_token, 4000);
		const remark = cleanText(params.remark, 500);
		const status = cleanText(params.status || 'active', 20) === 'disabled' ? 'disabled' : 'active';
		const now = nowIso();

		if (!email || !isEmail(email)) {
			throw new BizError(t('outlookEmailEmpty'));
		}
		if (!clientId) {
			throw new BizError(t('outlookClientEmpty'));
		}

		if (outlookAccountId) {
			const current = await this.getAccount(c, userId, outlookAccountId);
			const nextRefreshToken = refreshToken || current.refresh_token;
			if (!nextRefreshToken) {
				throw new BizError(t('outlookTokenEmpty'));
			}
			await c.env.db.prepare(`
				UPDATE outlook_account
				SET email = ?,
					password = ?,
					client_id = ?,
					refresh_token = ?,
					remark = ?,
					status = ?,
					update_time = ?
				WHERE outlook_account_id = ? AND user_id = ?
			`).bind(email, password, clientId, nextRefreshToken, remark, status, now, outlookAccountId, userId).run();
			return normalizeAccount(await this.getAccount(c, userId, outlookAccountId));
		}

		if (!refreshToken) {
			throw new BizError(t('outlookTokenEmpty'));
		}
		const row = await c.env.db.prepare(`
			INSERT INTO outlook_account (
				user_id, email, password, client_id, refresh_token, remark,
				status, create_time, update_time
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(user_id, email) DO UPDATE SET
				password = excluded.password,
				client_id = excluded.client_id,
				refresh_token = excluded.refresh_token,
				remark = excluded.remark,
				status = excluded.status,
				update_time = excluded.update_time
			RETURNING *
		`).bind(userId, email, password, clientId, refreshToken, remark, status, now, now).first();
		return normalizeAccount(row);
	},

	async remove(c, userId, outlookAccountId) {
		await this.getAccount(c, userId, outlookAccountId);
		await c.env.db.prepare(`
			DELETE FROM outlook_account
			WHERE outlook_account_id = ? AND user_id = ?
		`).bind(Number(outlookAccountId), userId).run();
		return true;
	},

	async getAccount(c, userId, outlookAccountId) {
		await this.ensureSchema(c);
		const id = Number(outlookAccountId);
		if (!id) {
			throw new BizError(t('outlookAccountNotExist'), 404);
		}
		const row = await c.env.db.prepare(`
			SELECT * FROM outlook_account
			WHERE outlook_account_id = ? AND user_id = ?
		`).bind(id, userId).first();
		if (!row) {
			throw new BizError(t('outlookAccountNotExist'), 404);
		}
		return row;
	},

	async updateTokenState(c, account, status, error = '', refreshToken = '') {
		await c.env.db.prepare(`
			UPDATE outlook_account
			SET last_refresh_at = ?,
				last_refresh_status = ?,
				last_refresh_error = ?,
				refresh_token = CASE WHEN ? != '' THEN ? ELSE refresh_token END,
				update_time = ?
			WHERE outlook_account_id = ?
		`).bind(nowIso(), status, cleanText(error, 1000), refreshToken || '', refreshToken || '', nowIso(), account.outlook_account_id).run();
	},

	async getAccessToken(c, account, provider = 'graph') {
		let lastError = '';
		const scopes = TOKEN_SCOPE_CANDIDATES[provider] || TOKEN_SCOPE_CANDIDATES.graph;
		for (let i = 0; i < scopes.length; i += 1) {
			const scope = scopes[i];
			const body = new URLSearchParams();
			body.set('client_id', account.client_id);
			body.set('grant_type', 'refresh_token');
			body.set('refresh_token', account.refresh_token);
			if (scope) {
				body.set('scope', scope);
			}
			const response = await fetch(TOKEN_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body
			});
			const detail = await responseDetail(response);
			if (response.ok) {
				const accessToken = detail.access_token;
				if (!accessToken) {
					lastError = t('outlookTokenFailed');
					break;
				}
				await this.updateTokenState(c, account, `success:${provider}`, '', detail.refresh_token || '');
				if (detail.refresh_token) {
					account.refresh_token = detail.refresh_token;
				}
				return accessToken;
			}
			lastError = formatTokenError(provider, response, detail);
			if (i === scopes.length - 1 || !shouldRetryToken(response, detail)) {
				break;
			}
		}
		await this.updateTokenState(c, account, `failed:${provider}`, lastError);
		throw new BizError(`${t('outlookTokenFailed')}: ${lastError}`);
	},

	async getImapAccessToken(c, account) {
		const body = new URLSearchParams();
		body.set('client_id', account.client_id);
		body.set('grant_type', 'refresh_token');
		body.set('refresh_token', account.refresh_token);
		body.set('scope', IMAP_SCOPE);
		const response = await fetch(IMAP_TOKEN_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body
		});
		const detail = await responseDetail(response);
		if (!response.ok) {
			const errorMessage = formatTokenError('imap', response, detail);
			await this.updateTokenState(c, account, 'failed:imap', errorMessage);
			throw new BizError(`${t('outlookTokenFailed')}: ${errorMessage}`);
		}
		if (!detail.access_token) {
			await this.updateTokenState(c, account, 'failed:imap', t('outlookTokenFailed'));
			throw new BizError(`${t('outlookTokenFailed')}: ${t('outlookTokenFailed')}`);
		}
		await this.updateTokenState(c, account, 'success:imap', '', detail.refresh_token || '');
		if (detail.refresh_token) {
			account.refresh_token = detail.refresh_token;
		}
		return detail.access_token;
	},

	async createImapClient(c, account) {
		const accessToken = await this.getImapAccessToken(c, account);
		let lastError = '';
		for (const host of IMAP_HOSTS) {
			const client = new ImapClient(host);
			try {
				await client.open();
				await client.authenticate(account.email, accessToken);
				await this.updateTokenState(c, account, `success:imap:${host}`, '');
				return client;
			} catch (e) {
				lastError = `${host}: ${e.message || e}`;
				client.close();
			}
		}
		await this.updateTokenState(c, account, 'failed:imap:connect', lastError);
		throw new BizError(`${t('outlookRequestFailed')}: IMAP ${lastError}`);
	},

	async runImapFallback(graphError, imapCall) {
		if (!isGraphAuthError(graphError)) {
			throw graphError;
		}
		try {
			return await imapCall();
		} catch (imapError) {
			throw new BizError(`${t('outlookRequestFailed')}: Graph failed, IMAP fallback failed: ${shorten(imapError.message || imapError, 500)}; Graph: ${shorten(graphError.message || graphError, 500)}`);
		}
	},

	async apiFetch(c, account, provider, path, {
		method = 'GET',
		params = null,
		body = null,
		prefer = '',
		accept = 'application/json'
	} = {}) {
		const accessToken = await this.getAccessToken(c, account, provider);
		const url = new URL(`${GRAPH_BASE}${path}`);
		if (params) {
			Object.keys(params).forEach(key => {
				if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
					url.searchParams.set(key, String(params[key]));
				}
			});
		}
		const headers = graphHeaders(accessToken, prefer);
		if (accept) {
			headers.Accept = accept;
		}
		if (body) {
			headers['Content-Type'] = 'application/json';
		}
		const response = await fetch(url.toString(), {
			method,
			headers,
			body: body ? JSON.stringify(body) : null
		});
		if (!response.ok) {
			const detail = await responseDetail(response);
			const errorMessage = formatProviderError(provider, response, detail);
			await this.updateTokenState(c, account, `failed:${provider}:request`, errorMessage);
			const error = new BizError(`${t('outlookRequestFailed')}: ${errorMessage}`);
			error.status = response.status;
			throw error;
		}
		return response;
	},

	async graphFetch(c, account, path, options = {}) {
		return this.apiFetch(c, account, 'graph', path, options);
	},

	async imapMailList(c, account, params = {}) {
		const client = await this.createImapClient(c, account);
		try {
			const folder = normalizeFolder(params.folder);
			const top = normalizeLimit(params.top || params.size, 30, 50);
			const skip = normalizeOffset(params.skip || params.offset);
			const selected = await client.selectFolder(folder, true);
			const end = Math.max(0, selected.exists - skip);
			const start = Math.max(1, end - top + 1);
			const pageSequences = end >= start
				? Array.from({ length: end - start + 1 }, (_, index) => end - index)
				: [];
			const list = [];
			for (const sequenceNumber of pageSequences) {
				try {
					const fetched = await client.fetchHeaderBySequence(sequenceNumber);
					const parsed = await PostalMime.parse(fetched.raw);
					list.push(normalizeParsedSummary(parsed, {
						folder,
						uid: fetched.uid,
						flags: fetched.flags,
						internalDate: fetched.internalDate
					}));
				} catch (e) {
					console.warn(`IMAP fetch message failed: ${sequenceNumber}`, e.message || e);
				}
			}
			return {
				account: normalizeAccount(account),
				folder,
				list,
				nextLink: '',
				skip,
				top,
				method: 'imap'
			};
		} finally {
			client.close();
		}
	},

	async imapMailDetail(c, account, messageId, fallbackFolder = 'inbox') {
		const { folder, uid } = parseImapMessageId(messageId, fallbackFolder);
		const client = await this.createImapClient(c, account);
		try {
			await client.selectFolder(folder, true);
			const fetched = await client.fetchRaw(uid);
			const parsed = await PostalMime.parse(fetched.raw);
			return normalizeParsedDetail(parsed, {
				folder,
				uid,
				flags: fetched.flags,
				internalDate: fetched.internalDate
			});
		} finally {
			client.close();
		}
	},

	async imapMarkRead(c, account, params = {}) {
		const ids = Array.isArray(params.messageIds || params.message_ids)
			? (params.messageIds || params.message_ids)
			: [params.messageId || params.message_id];
		const messageIds = ids.map(id => cleanText(id, 1200)).filter(Boolean);
		if (messageIds.length === 0) {
			throw new BizError(t('outlookMessageEmpty'));
		}
		const isRead = params.isRead !== false && params.is_read !== false;
		const groups = {};
		for (const messageId of messageIds) {
			const parsed = parseImapMessageId(messageId, params.folder);
			if (!parsed.uid) {
				continue;
			}
			groups[parsed.folder] = groups[parsed.folder] || [];
			groups[parsed.folder].push({
				uid: parsed.uid,
				id: messageId
			});
		}
		const client = await this.createImapClient(c, account);
		const updatedIds = [];
		try {
			for (const [folder, items] of Object.entries(groups)) {
				await client.selectFolder(folder, false);
				for (const item of items) {
					await client.storeSeen(item.uid, isRead);
					updatedIds.push(item.id);
				}
			}
			return {
				success: true,
				updatedIds,
				isRead,
				method: 'imap'
			};
		} finally {
			client.close();
		}
	},

	async imapAttachments(c, account, messageId, fallbackFolder = 'inbox') {
		const { folder, uid } = parseImapMessageId(messageId, fallbackFolder);
		const client = await this.createImapClient(c, account);
		try {
			await client.selectFolder(folder, true);
			const fetched = await client.fetchRaw(uid);
			const parsed = await PostalMime.parse(fetched.raw);
			return normalizeParsedAttachments(parsed);
		} finally {
			client.close();
		}
	},

	async imapDownloadAttachment(c, account, messageId, attachmentId, fallbackFolder = 'inbox') {
		const { folder, uid } = parseImapMessageId(messageId, fallbackFolder);
		const client = await this.createImapClient(c, account);
		try {
			await client.selectFolder(folder, true);
			const fetched = await client.fetchRaw(uid);
			const parsed = await PostalMime.parse(fetched.raw);
			const attachment = (parsed.attachments || [])[Number(attachmentId)];
			if (!attachment) {
				throw new BizError(t('outlookAttachmentEmpty'));
			}
			return {
				filename: attachment.filename || attachment.name || 'attachment',
				contentType: attachment.mimeType || attachment.contentType || 'application/octet-stream',
				bytes: bytesFromAttachmentContent(attachment.content)
			};
		} finally {
			client.close();
		}
	},

	async test(c, userId, outlookAccountId) {
		const account = await this.getAccount(c, userId, outlookAccountId);
		const data = await this.mailList(c, userId, {
			outlookAccountId,
			folder: 'inbox',
			top: 1,
			skip: 0
		});
		return {
			success: true,
			account: normalizeAccount(account),
			count: data.list.length
		};
	},

	async mailList(c, userId, params = {}) {
		const account = await this.getAccount(c, userId, params.outlookAccountId || params.outlook_account_id || params.accountId);
		const folder = normalizeFolder(params.folder);
		const top = normalizeLimit(params.top || params.size, 30, 50);
		const skip = normalizeOffset(params.skip || params.offset);
		try {
			const response = await this.graphFetch(c, account, `/me/mailFolders/${folder}/messages`, {
				params: {
					$top: top,
					$skip: skip,
					$select: 'id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview',
					$orderby: 'receivedDateTime desc'
				},
				prefer: "outlook.body-content-type='text'"
			});
			const data = await response.json();
			return {
				account: normalizeAccount(account),
				folder,
				list: Array.isArray(data.value) ? data.value.map(normalizeMessageSummary) : [],
				nextLink: data['@odata.nextLink'] || '',
				skip,
				top,
				method: 'graph'
			};
		} catch (e) {
			return this.runImapFallback(e, () => this.imapMailList(c, account, params));
		}
	},

	async mailDetail(c, userId, params = {}) {
		const account = await this.getAccount(c, userId, params.outlookAccountId || params.outlook_account_id || params.accountId);
		const messageId = cleanText(params.messageId || params.message_id, 1200);
		if (!messageId) {
			throw new BizError(t('outlookMessageEmpty'));
		}
		if (isImapMessageId(messageId)) {
			return this.imapMailDetail(c, account, messageId, params.folder);
		}
		try {
			const response = await this.graphFetch(c, account, `/me/messages/${encodeURIComponent(messageId)}`, {
				params: {
					$select: 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments,body,bodyPreview'
				},
				prefer: "outlook.body-content-type='html'"
			});
			return normalizeMessageDetail(await response.json());
		} catch (e) {
			return this.runImapFallback(e, () => this.imapMailDetail(c, account, messageId, params.folder));
		}
	},

	async markRead(c, userId, params = {}) {
		const account = await this.getAccount(c, userId, params.outlookAccountId || params.outlook_account_id || params.accountId);
		const ids = Array.isArray(params.messageIds || params.message_ids)
			? (params.messageIds || params.message_ids)
			: [params.messageId || params.message_id];
		const messageIds = ids.map(id => cleanText(id, 1200)).filter(Boolean);
		if (messageIds.length === 0) {
			throw new BizError(t('outlookMessageEmpty'));
		}
		if (messageIds.every(isImapMessageId)) {
			return this.imapMarkRead(c, account, params);
		}
		const isRead = params.isRead !== false && params.is_read !== false;
		try {
			for (const messageId of messageIds) {
				await this.graphFetch(c, account, `/me/messages/${encodeURIComponent(messageId)}`, {
					method: 'PATCH',
					body: { isRead },
					accept: ''
				});
			}
			return {
				success: true,
				updatedIds: messageIds,
				isRead,
				method: 'graph'
			};
		} catch (e) {
			if (messageIds.every(id => /^\d+$/.test(id))) {
				return this.runImapFallback(e, () => this.imapMarkRead(c, account, params));
			}
			throw e;
		}
	},

	async attachments(c, userId, params = {}) {
		const account = await this.getAccount(c, userId, params.outlookAccountId || params.outlook_account_id || params.accountId);
		const messageId = cleanText(params.messageId || params.message_id, 1200);
		if (!messageId) {
			throw new BizError(t('outlookMessageEmpty'));
		}
		if (isImapMessageId(messageId)) {
			return this.imapAttachments(c, account, messageId, params.folder);
		}
		try {
			const response = await this.graphFetch(c, account, `/me/messages/${encodeURIComponent(messageId)}/attachments`, {
				params: {
					$select: 'id,name,contentType,size,isInline,contentId'
				}
			});
			const data = await response.json();
			return (data.value || []).map(normalizeAttachment);
		} catch (e) {
			return this.runImapFallback(e, () => this.imapAttachments(c, account, messageId, params.folder));
		}
	},

	async downloadAttachment(c, userId, params = {}) {
		const account = await this.getAccount(c, userId, params.outlookAccountId || params.outlook_account_id || params.accountId);
		const messageId = cleanText(params.messageId || params.message_id, 1200);
		const attachmentId = cleanText(params.attachmentId || params.attachment_id, 1200);
		if (!messageId) {
			throw new BizError(t('outlookMessageEmpty'));
		}
		if (!attachmentId) {
			throw new BizError(t('outlookAttachmentEmpty'));
		}
		if (isImapMessageId(messageId)) {
			return this.imapDownloadAttachment(c, account, messageId, attachmentId, params.folder);
		}

		try {
			const metadataResponse = await this.graphFetch(
				c,
				account,
				`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
			);
			const metadata = await metadataResponse.json();
			const filename = metadata.name || metadata.Name || 'attachment';
			const contentType = metadata.contentType || metadata.ContentType || 'application/octet-stream';
			let bytes;

			if (metadata.contentBytes || metadata.ContentBytes) {
				bytes = base64ToBytes(metadata.contentBytes || metadata.ContentBytes);
			} else {
				const contentResponse = await this.graphFetch(
					c,
					account,
					`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
					{ accept: '*/*' }
				);
				bytes = new Uint8Array(await contentResponse.arrayBuffer());
			}

			return {
				filename,
				contentType,
				bytes
			};
		} catch (e) {
			return this.runImapFallback(e, () => this.imapDownloadAttachment(c, account, messageId, attachmentId, params.folder));
		}
	}
};

export default outlookService;
