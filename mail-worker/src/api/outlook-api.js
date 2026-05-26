import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import outlookService from '../service/outlook-service';

app.get('/outlook/account/list', async (c) => {
	const data = await outlookService.list(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/outlook/account/detail', async (c) => {
	const data = await outlookService.detail(c, userContext.getUserId(c), c.req.query('outlookAccountId') || c.req.query('accountId'));
	return c.json(result.ok(data));
});

app.post('/outlook/account/save', async (c) => {
	const data = await outlookService.save(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.delete('/outlook/account/delete', async (c) => {
	const data = await outlookService.remove(c, userContext.getUserId(c), c.req.query('outlookAccountId') || c.req.query('accountId'));
	return c.json(result.ok(data));
});

app.post('/outlook/account/test', async (c) => {
	const body = await c.req.json();
	const data = await outlookService.test(c, userContext.getUserId(c), body.outlookAccountId || body.accountId);
	return c.json(result.ok(data));
});

app.get('/outlook/mail/list', async (c) => {
	const data = await outlookService.mailList(c, userContext.getUserId(c), c.req.query());
	return c.json(result.ok(data));
});

app.get('/outlook/mail/detail', async (c) => {
	const data = await outlookService.mailDetail(c, userContext.getUserId(c), c.req.query());
	return c.json(result.ok(data));
});

app.put('/outlook/mail/read', async (c) => {
	const data = await outlookService.markRead(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.get('/outlook/mail/attachments', async (c) => {
	const data = await outlookService.attachments(c, userContext.getUserId(c), c.req.query());
	return c.json(result.ok(data));
});

app.get('/outlook/mail/attachment', async (c) => {
	const data = await outlookService.downloadAttachment(c, userContext.getUserId(c), c.req.query());
	return new Response(data.bytes, {
		headers: {
			'Content-Type': data.contentType,
			'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(data.filename)}`,
			'Access-Control-Expose-Headers': 'Content-Disposition'
		}
	});
});
