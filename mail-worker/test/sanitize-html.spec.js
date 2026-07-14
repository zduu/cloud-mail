import { describe, expect, it } from 'vitest';
import { escapeHtml, sanitizeHtml } from '../src/utils/sanitize-html';

describe('sanitizeHtml', () => {
	it('移除脚本和危险标签', () => {
		const result = sanitizeHtml('<p>safe</p><script>alert(1)</script><iframe src="https://example.com"></iframe>');
		expect(result).toContain('<p>safe</p>');
		expect(result).not.toMatch(/script|iframe/i);
	});

	it('移除事件处理器和 srcdoc', () => {
		const result = sanitizeHtml('<img src="x" onerror="alert(1)" srcdoc="bad"><p onclick="bad()">ok</p>');
		expect(result).not.toMatch(/onerror|onclick|srcdoc/i);
	});

	it('移除危险 URL 协议', () => {
		const result = sanitizeHtml('<a href="java\nscript:alert(1)">x</a><img src="data:text/html;base64,WA==">');
		expect(result).not.toMatch(/javascript|data:text\/html/i);
	});

	it('保留安全图片 data URI', () => {
		const result = sanitizeHtml('<img src="data:image/png;base64,AA==">');
		expect(result).toContain('data:image/png;base64,AA==');
	});

	it('移除危险 CSS', () => {
		const result = sanitizeHtml('<p style="background:url(javascript:alert(1))">x</p><style>@import url(https://evil.test/x.css)</style>');
		expect(result).not.toMatch(/javascript|@import/i);
	});
});

describe('escapeHtml', () => {
	it('转义纯文本中的 HTML 字符', () => {
		expect(escapeHtml('<img src=x onerror="x">&')).toBe('&lt;img src=x onerror=&quot;x&quot;&gt;&amp;');
	});
});
