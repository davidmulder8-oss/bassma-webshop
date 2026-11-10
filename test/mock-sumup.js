'use strict';
/*
 * SIMULATOR van de SumUp-betaal-API, alleen voor lokaal uitproberen (geen echte betalingen!).
 * Start: node test/mock-sumup.js   en zet in .env:
 *   SUMUP_API_BASE=http://localhost:4010
 *   SUMUP_API_KEY=simulator
 *   SUMUP_MERCHANT_CODE=MCSIM
 *   ALLOW_HTTP_WEBHOOK=1
 * De betaalpagina heeft knoppen om een betaling te laten slagen of mislukken.
 */
const http = require('http');
const PORT = Number(process.env.MOCK_PORT || 4010);
const checkouts = {};
let n = 0;

function readBody(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); }); }
const json = (res, s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);
  let m;
  if (req.method === 'POST' && url.pathname === '/v0.1/checkouts') {
    const b = JSON.parse((await readBody(req)) || '{}');
    const id = 'sim_' + (++n) + '_' + Date.now().toString(36);
    checkouts[id] = { id, status: 'PENDING', amount: b.amount, currency: b.currency, merchant_code: b.merchant_code, checkout_reference: b.checkout_reference, transactions: [], return_url: b.return_url, redirect_url: b.redirect_url };
    return json(res, 201, { id, hosted_checkout_url: `http://localhost:${PORT}/pay/${id}` });
  }
  if (req.method === 'GET' && (m = /^\/v0\.1\/checkouts\/([^/]+)$/.exec(url.pathname))) {
    const c = checkouts[m[1]]; return c ? json(res, 200, c) : json(res, 404, {});
  }
  if (req.method === 'POST' && /\/refunds$/.test(url.pathname)) { console.log('Terugbetaling (simulatie):', url.pathname, await readBody(req)); return json(res, 200, {}); }
  if (req.method === 'GET' && (m = /^\/pay\/([^/]+)$/.exec(url.pathname))) {
    const c = checkouts[m[1]]; if (!c) { res.writeHead(404); return res.end('Onbekend'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
<p style="background:#fff3cd;padding:10px;border-radius:8px"><b>SIMULATOR</b> — dit is niet SumUp. Er wordt niets afgeschreven.</p>
<h2>Betalen € ${Number(c.amount).toFixed(2).replace('.', ',')}</h2><p>Referentie ${c.checkout_reference}</p>
<form method=post action="/pay/${c.id}/paid"><button style="width:100%;padding:14px;margin:6px 0;font-size:16px">Betaling laten slagen</button></form>
<form method=post action="/pay/${c.id}/failed"><button style="width:100%;padding:14px;margin:6px 0;font-size:16px">Betaling laten mislukken</button></form>`);
  }
  if (req.method === 'POST' && (m = /^\/pay\/([^/]+)\/(paid|failed)$/.exec(url.pathname))) {
    const c = checkouts[m[1]]; if (!c) { res.writeHead(404); return res.end(); }
    c.status = m[2] === 'paid' ? 'PAID' : 'FAILED';
    if (c.status === 'PAID') c.transactions = [{ id: 'tx_' + c.id, status: 'SUCCESSFUL' }];
    if (c.return_url) fetch(c.return_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id: c.id }) }).catch(() => {});
    res.writeHead(303, { Location: c.redirect_url || '/' }); return res.end();
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`SumUp-SIMULATOR draait op http://localhost:${PORT}`));
