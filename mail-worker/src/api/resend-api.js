import resendService from '../service/resend-service';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	const payload = await c.req.text();
	await resendService.webhooks(c, payload, {
		id: c.req.header('svix-id'),
		timestamp: c.req.header('svix-timestamp'),
		signature: c.req.header('svix-signature')
	});
	return c.text('success', 200)
})
