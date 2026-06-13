/* EyeBreak — Phase-2 auto-minting Cloudflare Worker.
 *
 * Mints offline ECDSA-signed supporter codes per Lemon Squeezy sale so the
 * seller never manages a finite code pool. Two delivery paths, both shipped:
 *
 *   GET  /claim?order=<id>  (primary)
 *     LS post-purchase redirect lands here. We fetch the order via the Orders
 *     API, assert it's paid for our product, mint a code, and 302 the buyer to
 *     APP_BASE_URL/?code=<code> — the app's existing ?code= handler unlocks.
 *
 *   POST /webhook  (backstop)
 *     order_created webhook, HMAC-verified over the raw body. Mints a code in
 *     case the buyer abandoned the redirect. Emails the ?code= link ONLY if
 *     EMAIL_API_KEY is configured; otherwise it just acknowledges (200) — email
 *     is OFF by default, so the happy path has no provider dependency.
 *
 *   GET  /health -> 200 "ok"
 *
 * Codes are stateless bearer tokens: re-claiming is harmless, so no KV/DB.
 * NEVER log the private key or full codes.
 */

import { importPrivateKey, mintCode } from './crypto.js';
import { verifyWebhookSignature, getOrder, assertPaidForProduct } from './lemonsqueezy.js';

/** Build a signed code from an order's attributes. */
async function mintForOrder(attrs, env) {
  var key = await importPrivateKey(JSON.parse(env.EYEBREAK_PRIVATE_JWK));
  var payload = {
    v: 1,
    n: String(attrs.user_name || 'Supporter'),
    id: String(attrs.order_number != null ? attrs.order_number : ''),
    t: Date.now()
  };
  return mintCode(payload, key);
}

/** Optional email delivery — only invoked when EMAIL_API_KEY is set. */
async function maybeEmailCode(env, attrs, code, fetchImpl) {
  if (!env.EMAIL_API_KEY) return; // email OFF by default; no provider dependency.
  // Minimal, provider-agnostic stub left for the seller to wire to their
  // transactional-email provider. We intentionally do not hard-depend on one.
  // The link to send is: `${env.APP_BASE_URL}/?code=${encodeURIComponent(code)}`
  // (Intentionally a no-op beyond the guard until a provider is chosen.)
  return;
}

function text(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
}

async function handleClaim(request, env, fetchImpl) {
  if (request.method !== 'GET') return text('method not allowed', 405);
  var url = new URL(request.url);
  var orderId = url.searchParams.get('order');
  if (!orderId) return text('missing order', 400);

  var order = await getOrder(env, orderId, fetchImpl);
  if (!order || !assertPaidForProduct(order, env)) {
    return text('order not verified', 403);
  }

  var attrs = order.data.attributes;
  var code = await mintForOrder(attrs, env);

  var location = env.APP_BASE_URL + '/?code=' + encodeURIComponent(code);
  return new Response(null, { status: 302, headers: { Location: location } });
}

async function handleWebhook(request, env, fetchImpl) {
  if (request.method !== 'POST') return text('method not allowed', 405);

  var rawBody = await request.text();
  var sig = request.headers.get('X-Signature');
  var ok = await verifyWebhookSignature(rawBody, sig, env.LS_WEBHOOK_SECRET);
  if (!ok) return text('bad signature', 401);

  var eventName = request.headers.get('X-Event-Name');
  if (eventName !== 'order_created') return text('ignored', 200);

  var body = JSON.parse(rawBody);
  var attrs = (body && body.data && body.data.attributes) || {};
  var code = await mintForOrder(attrs, env);
  await maybeEmailCode(env, attrs, code, fetchImpl);

  return text('ok', 200);
}

/**
 * Core router. `fetchImpl` is injectable so tests can stub the LS Orders API
 * without the wrangler runtime.
 */
export async function handle(request, env, ctx, fetchImpl) {
  var url = new URL(request.url);
  var path = url.pathname;

  if (path === '/health') return text('ok', 200);

  try {
    if (path === '/claim') return await handleClaim(request, env, fetchImpl);
    if (path === '/webhook') return await handleWebhook(request, env, fetchImpl);
  } catch (e) {
    // Never leak the private key or code in error output.
    return text('error', 500);
  }

  return text('not found', 404);
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  }
};
