#!/usr/bin/env node

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const DEFAULT_PROBLEM_MAIL = '【培训通知】“公益金宏志助航计划”就业提升活动报名.eml';
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_FILE_PATH = path.join(ROOT_DIR, DEFAULT_PROBLEM_MAIL);
const DEFAULT_PORT = parseInt(process.env.EML_PREVIEW_PORT || '4876', 10) || 4876;
const DEFAULT_AUTO_OPEN = process.env.EML_PREVIEW_OPEN !== 'false';

let postalMimeModule;

async function main() {
	const cli = parseArgs();
	if (cli.showHelp) {
		printHelp();
		return;
	}

	const targetFile = cli.fileArg ? path.resolve(process.cwd(), cli.fileArg) : DEFAULT_FILE_PATH;

	try {
		await fs.access(targetFile);
	} catch (err) {
		console.error(`[preview-eml] 找不到邮件文件: ${targetFile}`);
		process.exit(1);
	}

	const postalMime = await loadPostalMime();

	const email = await loadEmail(targetFile, postalMime);
	const attachments = prepareAttachments(email.attachments || []);
	const cidMap = new Map();
	attachments.forEach(att => {
		if (att.contentId) {
			cidMap.set(normalizeCid(att.contentId), `/attachments/${att.index}?inline=1`);
		}
	});

	const htmlBody = email.html && email.html.trim() ? replaceCidUrls(email.html, cidMap) : null;
	const textBody = email.text && email.text.trim() ? email.text : '';

	const server = http.createServer((req, res) => {
		const url = new URL(req.url, `http://127.0.0.1:${cli.port}`);

		if (url.pathname === '/favicon.ico') {
			res.statusCode = 204;
			return res.end();
		}

		if (url.pathname === '/') {
			res.setHeader('Content-Type', 'text/html; charset=utf-8');
			res.setHeader('Cache-Control', 'no-store');
			const body = renderPage({
				email,
				htmlAvailable: Boolean(htmlBody),
				textBody,
				attachments,
				filePath: targetFile,
				rootDir: ROOT_DIR,
				defaultFilePath: DEFAULT_FILE_PATH,
			});
			res.end(body);
			return;
		}

		if (url.pathname === '/__body/html') {
			if (!htmlBody) {
				res.statusCode = 404;
				res.setHeader('Content-Type', 'text/plain; charset=utf-8');
				return res.end('该邮件不包含 HTML 正文。');
			}
			res.setHeader('Content-Type', 'text/html; charset=utf-8');
			res.setHeader('Cache-Control', 'no-store');
			return res.end(htmlBody);
		}

		const attachmentMatch = url.pathname.match(/^\/attachments\/(\d+)$/);
		if (attachmentMatch) {
			const index = Number(attachmentMatch[1]);
			const attachment = attachments[index];
			if (!attachment) {
				res.statusCode = 404;
				res.setHeader('Content-Type', 'text/plain; charset=utf-8');
				return res.end('未找到该附件');
			}
			const disposition = url.searchParams.get('inline') === '1' ? 'inline' : 'attachment';
			res.setHeader('Content-Type', attachment.mimeType);
			res.setHeader(
				'Content-Disposition',
				`${disposition}; filename*=UTF-8''${encodeRFC5987(attachment.downloadName)}`
			);
			res.setHeader('Cache-Control', 'no-store');
			return res.end(attachment.buffer);
		}

		res.statusCode = 404;
		res.setHeader('Content-Type', 'text/plain; charset=utf-8');
		res.end('未找到该资源');
	});

	server.on('error', err => {
		console.error('[preview-eml] 本地服务启动失败:', err.message);
		process.exit(1);
	});

	server.listen(cli.port, () => {
		const url = `http://127.0.0.1:${cli.port}`;
		console.log(`[preview-eml] 正在预览: ${targetFile}`);
		console.log(`[preview-eml] 本地地址: ${url}`);
		console.log('[preview-eml] 按 Ctrl+C 结束预览。');
		if (cli.autoOpen) {
			openBrowser(url);
		}
	});
}

function parseArgs() {
	const args = process.argv.slice(2);
	let fileArg;
	let port = DEFAULT_PORT;
	let autoOpen = DEFAULT_AUTO_OPEN;
	let showHelp = false;

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		switch (arg) {
			case '--file':
			case '-f':
				fileArg = args[i + 1];
				i += 1;
				break;
			case '--port':
			case '-p': {
				const next = Number(args[i + 1]);
				port = Number.isFinite(next) ? next : port;
				i += 1;
				break;
			}
			case '--no-open':
				autoOpen = false;
				break;
			case '--open':
				autoOpen = true;
				break;
			case '--help':
			case '-h':
				showHelp = true;
				break;
			default:
				if (!fileArg) {
					fileArg = arg;
				} else {
					console.error(`[preview-eml] 无法识别的参数: ${arg}`);
					showHelp = true;
				}
		}
	}

	return { fileArg, port, autoOpen, showHelp };
}

function printHelp() {
	const relDefault = path.relative(process.cwd(), DEFAULT_FILE_PATH);
	console.log(`
本地邮件预览脚本

用法:
  node scripts/preview-eml.js [选项] [eml文件路径]

选项:
  -f, --file <path>      指定要预览的 .eml 文件，默认: ${relDefault}
  -p, --port <number>    指定本地 Web 端口，默认: ${DEFAULT_PORT}
      --open             强制启动后打开浏览器
      --no-open          启动后不自动打开浏览器
  -h, --help             显示本帮助
`);
}

async function loadPostalMime() {
	if (postalMimeModule) {
		return postalMimeModule;
	}
	const modulePath = path.join(ROOT_DIR, 'mail-worker/node_modules/postal-mime/src/postal-mime.js');
	try {
		const moduleUrl = pathToFileURL(modulePath).href;
		const imported = await import(moduleUrl);
		postalMimeModule = imported.default || imported;
		return postalMimeModule;
	} catch (err) {
		console.error('[preview-eml] 无法加载 postal-mime 依赖。');
		console.error('[preview-eml] 请先执行: cd mail-worker && pnpm install');
		console.error(`[preview-eml] 原始错误: ${err.message}`);
		process.exit(1);
	}
}

async function loadEmail(filePath, postalMime) {
	const rawBuffer = await fs.readFile(filePath);
	const content = rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
	return postalMime.parse(content);
}

function prepareAttachments(items) {
	return items.map((item, index) => {
		const buffer = Buffer.from(item.content);
		const filename = item.filename || `attachment-${index + 1}`;
		const mimeType = item.mimeType || item.contentType || 'application/octet-stream';
		return {
			index,
			filename,
			downloadName: filename,
			contentId: item.contentId ? normalizeCid(item.contentId) : null,
			size: buffer.length,
			mimeType,
			buffer,
		};
	});
}

function normalizeCid(cid) {
	return cid.replace(/^<|>$/g, '');
}

function replaceCidUrls(html, cidMap) {
	return html.replace(/cid:([^"'\\s>]+)/gi, (match, rawCid) => {
		const normalized = normalizeCid(rawCid);
		if (cidMap.has(normalized)) {
			return cidMap.get(normalized);
		}
		return match;
	});
}

function openBrowser(url) {
	const platform = process.platform;
	let command;
	let args;

	if (platform === 'darwin') {
		command = 'open';
		args = [url];
	} else if (platform === 'win32') {
		command = 'cmd';
		args = ['/c', 'start', '', url];
	} else {
		command = 'xdg-open';
		args = [url];
	}

	try {
		const child = spawn(command, args, { stdio: 'ignore', detached: true });
		child.unref();
	} catch (err) {
		console.warn(`[preview-eml] 自动打开浏览器失败: ${err.message}`);
	}
}

function renderPage({ email, htmlAvailable, textBody, attachments, filePath, rootDir, defaultFilePath }) {
	const relPath = path.relative(rootDir, filePath);
	const isDefault = filePath === defaultFilePath;

	const rows = [
		['来源文件', relPath],
		['主题', email.subject || '（无主题）'],
		['发件人', formatAddress(email.from)],
		['收件人', formatAddressList(email.to)],
		['抄送', formatAddressList(email.cc)],
		['密送', formatAddressList(email.bcc)],
		['回复地址', formatAddress(email.replyTo)],
		['发送时间', email.date || '未知'],
		['Message-ID', email.messageId || '无'],
	];

	const metaRows = rows
		.filter(([, value]) => {
			if (typeof value === 'string') {
				return value.trim().length > 0;
			}
			return Boolean(value);
		})
		.map(
			([label, value]) => `
			<div class="meta-row">
				<div class="meta-label">${escapeHtml(label)}</div>
				<div class="meta-value">${escapeHtml(value || '')}</div>
			</div>
		`
		)
		.join('');

	const htmlSection = htmlAvailable
		? `
		<div class="card">
			<div class="card-header">
				<span>HTML 正文</span>
				<a class="link" href="/__body/html" target="_blank" rel="noreferrer">在新标签打开</a>
			</div>
			<iframe class="preview-frame" src="/__body/html"></iframe>
		</div>`
		: `
		<div class="card">
			<div class="card-header">
				<span>HTML 正文</span>
			</div>
			<p class="muted">该邮件没有 HTML 正文，下面展示纯文本内容。</p>
		</div>`;

	const textSection = `
		<div class="card">
			<div class="card-header">
				<span>纯文本正文</span>
			</div>
			${textBody ? `<pre class="text-body">${escapeHtml(textBody)}</pre>` : '<p class="muted">无纯文本正文</p>'}
		</div>
	`;

	const attachmentSection = attachments.length
		? `
		<ul class="attachment-list">
			${attachments
				.map(
					att => `
				<li>
					<div>
						<div class="attachment-name">${escapeHtml(att.filename)}</div>
						<div class="muted">${escapeHtml(att.mimeType)} · ${formatBytes(att.size)}</div>
					</div>
					<div class="attachment-actions">
						<a class="link" href="/attachments/${att.index}" download>下载</a>
						${
							att.contentId
								? `<span class="tag">CID: ${escapeHtml(att.contentId)}</span>`
								: '<span class="tag muted">无 CID</span>'
						}
					</div>
				</li>
			`
				)
				.join('')}
		</ul>`
		: '<p class="muted">无附件</p>';

	return `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>邮件预览 · ${escapeHtml(email.subject || relPath)}</title>
	<style>
		:root {
			color-scheme: light dark;
			font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
			background: #111;
		}
		body {
			margin: 0;
			padding: 24px;
			background: #f7f7f7;
			color: #222;
		}
		h1 {
			margin: 0 0 12px;
		}
		.meta {
			display: flex;
			flex-direction: column;
			gap: 6px;
			margin-bottom: 24px;
		}
		.meta-row {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}
		.meta-label {
			min-width: 110px;
			font-weight: 600;
			color: #555;
		}
		.meta-value {
			flex: 1;
		}
		.card {
			background: #fff;
			border-radius: 12px;
			box-shadow: 0 10px 30px rgb(15 23 42 / 5%);
			margin-bottom: 24px;
			padding: 16px;
		}
		.card-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 12px;
			font-weight: 600;
		}
		.preview-frame {
			width: 100%;
			min-height: 500px;
			border: 1px solid #e0e0e0;
			border-radius: 8px;
			background: #fff;
		}
		.text-body {
			white-space: pre-wrap;
			font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
			font-size: 0.95rem;
			margin: 0;
			padding: 16px;
			border-radius: 8px;
			background: #f3f4f6;
		}
		.attachment-list {
			list-style: none;
			padding: 0;
			margin: 0;
			display: flex;
			flex-direction: column;
			gap: 12px;
		}
		.attachment-list li {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 12px;
			border: 1px solid #e5e7eb;
			border-radius: 8px;
			background: #fcfcfc;
		}
		.attachment-actions {
			display: flex;
			align-items: center;
			gap: 12px;
		}
		.attachment-name {
			font-weight: 600;
		}
		.link {
			color: #2563eb;
			text-decoration: none;
			font-weight: 600;
		}
		.link:hover {
			text-decoration: underline;
		}
		.muted {
			color: #6b7280;
			font-size: 0.9rem;
		}
		.tag {
			font-size: 0.75rem;
			padding: 4px 8px;
			border-radius: 999px;
			border: 1px solid #d1d5db;
		}
		.banner {
			margin-bottom: 16px;
			padding: 12px 16px;
			border-radius: 8px;
			background: #e0f2fe;
			color: #0f172a;
		}
		.actions {
			margin-bottom: 24px;
			display: flex;
			gap: 12px;
		}
		button {
			border: none;
			padding: 10px 16px;
			border-radius: 8px;
			cursor: pointer;
			font-weight: 600;
			background: #2563eb;
			color: #fff;
		}
		button.secondary {
			background: #e5e7eb;
			color: #111827;
		}
		@media (prefers-color-scheme: dark) {
			body { background: #0f172a; color: #f8fafc; }
			.card { background: #1f2937; }
			.card-header span { color: #f8fafc; }
			.meta-label { color: #cbd5f5; }
			.meta-value { color: #e2e8f0; }
			.preview-frame { border-color: #334155; background: #0f172a; }
			.text-body { background: #0f172a; color: #f8fafc; }
			.attachment-list li { background: #1f2937; border-color: #334155; }
			.link { color: #93c5fd; }
			.banner { background: #172554; color: #bae6fd; }
			button.secondary { background: #334155; color: #f8fafc; }
		}
	</style>
</head>
<body>
	<h1>邮件本地预览</h1>
	${isDefault ? '<div class="banner">当前预览的是仓库中的示例乱码邮件。</div>' : ''}
	<div class="actions">
		<button id="reload-btn" type="button">刷新</button>
		<button id="open-html-btn" class="secondary" type="button">新标签打开 HTML 正文</button>
	</div>
	<div class="card meta">${metaRows}</div>
	${htmlSection}
	${textSection}
	<div class="card">
		<div class="card-header"><span>附件</span></div>
		${attachmentSection}
	</div>
	<script>
		document.getElementById('reload-btn').addEventListener('click', () => window.location.reload());
		document.getElementById('open-html-btn').addEventListener('click', () => window.open('/__body/html', '_blank'));
	</script>
</body>
</html>`;
}

function formatAddress(address) {
	if (!address || (!address.name && !address.address)) return '';
	const trimmedName = address.name ? address.name.trim() : '';
	const trimmedAddress = address.address ? address.address.trim() : '';
	if (trimmedName && trimmedAddress) {
		return `${trimmedName} <${trimmedAddress}>`;
	}
	return trimmedName || trimmedAddress;
}

function formatAddressList(list) {
	if (!Array.isArray(list) || list.length === 0) {
		return '';
	}
	return list.map(formatAddress).filter(Boolean).join(', ');
}

function escapeHtml(str) {
	if (!str) return '';
	return str.replace(/[&<>"']/g, ch => {
		switch (ch) {
			case '&':
				return '&amp;';
			case '<':
				return '&lt;';
			case '>':
				return '&gt;';
			case '"':
				return '&quot;';
			case "'":
				return '&#39;';
			default:
				return ch;
		}
	});
}

function encodeRFC5987(str) {
	return encodeURIComponent(str)
		.replace(/['()]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
		.replace(/\*/g, '%2A')
		.replace(/%(?:7C|60|5E)/g, match => match.toLowerCase());
}

function formatBytes(bytes) {
	if (!Number.isFinite(bytes)) return '0 B';
	const thresh = 1024;
	if (Math.abs(bytes) < thresh) {
		return `${bytes} B`;
	}
	const units = ['KB', 'MB', 'GB', 'TB'];
	let u = -1;
	let value = bytes;
	do {
		value /= thresh;
		u += 1;
	} while (Math.abs(value) >= thresh && u < units.length - 1);
	return `${value.toFixed(1)} ${units[u]}`;
}

main().catch(err => {
	console.error('[preview-eml] 预览失败:');
	console.error(err);
	process.exit(1);
});
