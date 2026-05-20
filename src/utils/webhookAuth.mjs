function getHeader(req, name) {
  return req.get?.(name) ?? req.headers?.[name.toLowerCase()];
}

export function isWebhookAuthorized(req) {
  const webhookSecret = process.env.WEBHOOK_SECRET;

  return !webhookSecret || getHeader(req, 'X-Webhook-Secret') === webhookSecret;
}
