import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import previewService from '../service/preview-service';
import emailPreviewService from '../service/email-preview-service';

app.get('/preview/list', async (c) => {
	const list = await previewService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.post('/preview/create', async (c) => {
	const preview = await previewService.create(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(preview));
});

app.delete('/preview/delete', async (c) => {
	await previewService.remove(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/preview/expire', async (c) => {
	const row = await previewService.updateExpire(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(row));
});

app.get('/preview/page/list', async (c) => {
	const data = await previewService.pageList(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/email/preview/create', async (c) => {
	const row = await emailPreviewService.create(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(row));
});

app.get('/email/preview/list', async (c) => {
	const rows = await emailPreviewService.list(c, userContext.getUserId(c));
	return c.json(result.ok(rows));
});

app.delete('/email/preview/delete', async (c) => {
	await emailPreviewService.remove(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/email/preview/expire', async (c) => {
	const row = await emailPreviewService.updateExpire(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(row));
});

app.get('/preview/email/detail', async (c) => {
	const data = await emailPreviewService.detail(c, c.req.query());
	return c.json(result.ok(data));
});
