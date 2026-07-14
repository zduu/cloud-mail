import domainUtils from '../utils/domain-uitls';
import { sanitizeHtml } from '../utils/sanitize-html';

export default function emailHtmlTemplate(html, domain) {
	const safeHtml = sanitizeHtml(html)
		.replace(/{{domain}}/g, domainUtils.toOssDomain(domain) + '/');

	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'; frame-src 'none'">
    <style>
        html, body { margin: 0; padding: 0; background: #fff; }
        .content-box {
            box-sizing: border-box;
            padding: 15px 10px;
            width: 100%;
            min-height: 100vh;
            overflow: auto;
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #13181d;
            word-break: break-word;
        }
        img { max-width: 100% !important; height: auto !important; }
    </style>
</head>
<body>
    <div class="content-box">${safeHtml}</div>
</body>
</html>`;
}
