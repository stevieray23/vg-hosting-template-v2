/* EyeBreak — Lemon Squeezy helpers for the auto-minting Worker.
 *
 * - verifyWebhookSignature: the order_created webhook is signed via the
 *   X-Signature header = HMAC-SHA256 hex of the RAW request body, using the
 *   webhook signing secret. We verify over the raw bytes before parsing.
 * - getOrder: GET /v1/orders/{id} with a Bearer API key.
 * - assertPaidForProduct: order must be paid, from our store, and contain our
 *   product (and variant if configured).
 */

/** Lowercase hex of a byte array. */
function toHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Constant-time-ish compare of two equal-purpose hex strings. */
function timingSafeEqualHex(a, b) {
  // Compare as bytes; length mismatch -> not equal but still walk a fixed path.
  var enc = new TextEncoder();
  var ab = enc.encode(String(a));
  var bb = enc.encode(String(b));
  if (ab.length !== bb.length) return false;
  var diff = 0;
  for (var i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * Verify the X-Signature header (HMAC-SHA256 hex over the raw body) against
 * the webhook secret. Returns a boolean.
 */
export async function verifyWebhookSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  var key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  var mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody)
  );
  var expected = toHex(new Uint8Array(mac));
  return timingSafeEqualHex(expected, String(sigHeader).trim());
}

/** GET /v1/orders/{id} with Bearer auth. Returns the parsed JSON:API object. */
export async function getOrder(env, id, fetchImpl) {
  var doFetch = fetchImpl || fetch;
  var res = await doFetch('https://api.lemonsqueezy.com/v1/orders/' + encodeURIComponent(id), {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': 'Bearer ' + env.LS_API_KEY
    }
  });
  if (!res.ok) {
    return null;
  }
  return res.json();
}

/**
 * Assert the order is paid, from our store, and for our product/variant.
 * Accepts the JSON:API response from getOrder(). Returns boolean.
 */
export function assertPaidForProduct(order, env) {
  if (!order || !order.data || !order.data.attributes) return false;
  var attrs = order.data.attributes;

  if (attrs.status !== 'paid') return false;

  // store_id and product/variant ids compared as strings (env vars are strings).
  if (env.LS_STORE_ID && String(attrs.store_id) !== String(env.LS_STORE_ID)) {
    return false;
  }

  // Order line items live in attributes.first_order_item and/or order_items.
  var items = [];
  if (attrs.first_order_item) items.push(attrs.first_order_item);
  if (Array.isArray(attrs.order_items)) items = items.concat(attrs.order_items);

  if (!items.length) return false;

  var matched = items.some(function (it) {
    if (!it) return false;
    var productOk = String(it.product_id) === String(env.LS_PRODUCT_ID);
    var variantOk = !env.LS_VARIANT_ID || String(it.variant_id) === String(env.LS_VARIANT_ID);
    return productOk && variantOk;
  });

  return matched;
}
