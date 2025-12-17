import { describe, it, expect } from 'vitest';

describe('TextDecoder streaming decoding', () => {
	it('keeps multi-byte characters intact across chunks', () => {
		const encoder = new TextEncoder();
		const sample = '你好，Cloud Mail!';
		const bytes = encoder.encode(sample);

		// Split mid-way through the first Chinese character to emulate Worker chunking.
		const chunk1 = bytes.slice(0, 2);
		const chunk2 = bytes.slice(2);

		let broken = '';
		broken += new TextDecoder('utf-8').decode(chunk1);
		broken += new TextDecoder('utf-8').decode(chunk2);
		expect(broken).not.toBe(sample);

		const decoder = new TextDecoder('utf-8');
		let fixed = '';
		fixed += decoder.decode(chunk1, { stream: true });
		fixed += decoder.decode(chunk2);
		expect(fixed).toBe(sample);
	});
});
