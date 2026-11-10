'use strict';
/*
 * Betaalproviders. Alle geheime sleutels komen uit de omgeving (.env) en blijven op de server.
 *
 * SumUp Online Checkout (officiële API, https://developer.sumup.com):
 *   - POST /v0.1/checkouts met hosted_checkout.enabled = true  -> hosted_checkout_url waar de klant betaalt
 *   - SumUp stuurt een POST naar return_url met { event_type: "CHECKOUT_STATUS_CHANGED", id }. Dat bericht is niet
 *     ondertekend; daarom halen we altijd zelf GET /v0.1/checkouts/{id} op en vertrouwen alleen dat antwoord.
 *   - Terugbetalen: POST /v1.0/merchants/{merchant_code}/payments/{transaction_id}/refunds
 * Mollie is als alternatief aanwezig, omdat iDEAL bij SumUp een aparte activering vraagt.
 */

function withTimeout(fetchFn, ms = 15000) {
  return async (url, opts = {}) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetchFn(url, Object.assign({}, opts, { signal: ctl.signal })); }
    finally { clearTimeout(t); }
  };
}

async function json(res) { try { return await res.json(); } catch (_) { return {}; } }
const major = (cents) => Number((cents / 100).toFixed(2));

function createSumUp(env, fetchFn) {
  const base = (env.SUMUP_API_BASE || 'https://api.sumup.com').replace(/\/$/, '');
  const f = withTimeout(fetchFn);
  const headers = () => ({ Authorization: 'Bearer ' + env.SUMUP_API_KEY, 'Content-Type': 'application/json' });
  return {
    name: 'sumup',
    configured: !!(env.SUMUP_API_KEY && env.SUMUP_MERCHANT_CODE),
    methods: [{ id: 'online', label: 'Kaart, Apple Pay of Google Pay' + (env.SUMUP_IDEAL === '1' ? ' of iDEAL' : '') }],
    async create(order, urls) {
      const body = {
        checkout_reference: order.checkout_ref,
        amount: major(order.total_cents),
        currency: 'EUR',
        merchant_code: env.SUMUP_MERCHANT_CODE,
        description: `Bassma Lunchroom ${order.number}`,
        redirect_url: urls.redirect,
        hosted_checkout: { enabled: true },
        valid_until: new Date(Date.now() + 15 * 60000).toISOString()
      };
      if (urls.webhook) body.return_url = urls.webhook;   /* SumUp meldt alleen naar een bereikbaar (https) adres */
      const r = await f(base + '/v0.1/checkouts', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const j = await json(r);
      if (!r.ok || !j.id || !j.hosted_checkout_url) throw new Error('SumUp: checkout aanmaken mislukt (' + r.status + ')');
      return { id: j.id, url: j.hosted_checkout_url };
    },
    /* Altijd de status bij SumUp zelf ophalen (webhook en redirect bewijzen niets) */
    async get(checkoutId) {
      const r = await f(base + '/v0.1/checkouts/' + encodeURIComponent(checkoutId), { headers: headers() });
      const j = await json(r);
      if (!r.ok) throw new Error('SumUp: checkout ophalen mislukt (' + r.status + ')');
      const map = { PAID: 'paid', FAILED: 'failed', EXPIRED: 'expired', PENDING: 'pending' };
      const tx = (j.transactions || []).find((t) => ['SUCCESSFUL', 'PAID'].includes(String(t.status || '').toUpperCase())) || (j.transactions || [])[0];
      return {
        status: map[j.status] || 'pending',
        amountCents: Math.round(Number(j.amount) * 100), currency: j.currency, merchant: j.merchant_code, reference: j.checkout_reference,
        transactionId: j.transaction_id || (tx && tx.id) || null
      };
    },
    async refund(order, cents) {
      if (!order.transaction_id) throw new Error('Geen transactienummer bekend voor deze betaling');
      const r = await f(`${base}/v1.0/merchants/${encodeURIComponent(env.SUMUP_MERCHANT_CODE)}/payments/${encodeURIComponent(order.transaction_id)}/refunds`,
        { method: 'POST', headers: headers(), body: JSON.stringify(cents ? { amount: major(cents) } : {}) });
      if (!r.ok) { const j = await json(r); throw new Error('SumUp: terugbetalen mislukt (' + r.status + ')' + (j.message ? ': ' + j.message : '')); }
      return true;
    },
    /* Notificatie-inhoud -> checkout-id (alleen het id wordt gebruikt) */
    parseWebhook(rawBody) {
      let j; try { j = JSON.parse(rawBody); } catch (_) { return null; }
      return j && j.event_type === 'CHECKOUT_STATUS_CHANGED' && typeof j.id === 'string' ? j.id : null;
    }
  };
}

function createMollie(env, fetchFn) {
  const f = withTimeout(fetchFn);
  const headers = () => ({ Authorization: 'Bearer ' + env.MOLLIE_API_KEY, 'Content-Type': 'application/json' });
  return {
    name: 'mollie',
    configured: !!env.MOLLIE_API_KEY,
    methods: [{ id: 'ideal', label: 'iDEAL' }, { id: 'bancontact', label: 'Bancontact' }, { id: 'creditcard', label: 'Creditcard' }],
    async create(order, urls, method) {
      const body = {
        amount: { currency: 'EUR', value: (order.total_cents / 100).toFixed(2) },
        description: `Bassma Lunchroom ${order.number}`,
        redirectUrl: urls.redirect, locale: 'nl_NL',
        metadata: { order: order.number }
      };
      if (['ideal', 'bancontact', 'creditcard'].includes(method)) body.method = method;
      if (urls.webhook) body.webhookUrl = urls.webhook;
      const r = await f('https://api.mollie.com/v2/payments', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const j = await json(r);
      if (!r.ok || !j.id || !j._links || !j._links.checkout) throw new Error('Mollie: betaling aanmaken mislukt (' + r.status + ')');
      return { id: j.id, url: j._links.checkout.href };
    },
    async get(id) {
      const r = await f('https://api.mollie.com/v2/payments/' + encodeURIComponent(id), { headers: headers() });
      const j = await json(r);
      if (!r.ok) throw new Error('Mollie: betaling ophalen mislukt (' + r.status + ')');
      const map = { paid: 'paid', failed: 'failed', canceled: 'canceled', expired: 'expired' };
      return { status: map[j.status] || 'pending', amountCents: Math.round(Number(j.amount && j.amount.value) * 100), currency: j.amount && j.amount.currency, merchant: null, reference: j.metadata && j.metadata.order, transactionId: j.id };
    },
    async refund(order, cents) {
      const body = cents ? { amount: { currency: 'EUR', value: (cents / 100).toFixed(2) } } : {};
      if (!cents) body.amount = { currency: 'EUR', value: (order.total_cents / 100).toFixed(2) };
      const r = await f(`https://api.mollie.com/v2/payments/${encodeURIComponent(order.checkout_id)}/refunds`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Mollie: terugbetalen mislukt (' + r.status + ')');
      return true;
    },
    parseWebhook(rawBody) {
      const id = new URLSearchParams(rawBody).get('id') || '';
      return /^tr_\w+$/.test(id) ? id : null;
    }
  };
}

function createProviders(env, fetchFn) {
  const sumup = createSumUp(env, fetchFn), mollie = createMollie(env, fetchFn);
  const wanted = (env.PAYMENT_PROVIDER || (sumup.configured ? 'sumup' : (mollie.configured ? 'mollie' : 'sumup'))).toLowerCase();
  return { sumup, mollie, active: wanted === 'mollie' ? mollie : sumup, byName: (n) => (n === 'mollie' ? mollie : sumup) };
}

module.exports = { createProviders };

