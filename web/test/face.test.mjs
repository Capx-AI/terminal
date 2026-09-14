import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import vm from "node:vm";
import { companyRoute, proxyTarget, proxyCompany, safePath } from "../routes.mjs";
import { resolveCompanyIdentifier, publicCompanyView, marketSurface } from "../company.mjs";
import { publicRow, marketFromLaunchpad, sortMarketCap } from "../join.mjs";
import { MINTS, liveDocument, TOKENLESS_FACE } from "../../mock-casa/fixtures.mjs";

const mint = MINTS.live;
test("canonical company routes and legacy redirects keep reserved paths", () => {
  assert.deepEqual(companyRoute('/' + mint), { id: mint, view: '' });
  assert.deepEqual(companyRoute('/northstar-labs'), { id: 'northstar-labs', view: '' });
  for (const view of ['architecture', 'flow', 'data-model', 'roadmap', 'plan', 'agents', 'activity', 'attestation']) {
    assert.equal(companyRoute('/northstar-labs/' + view).view, view);
  }
  assert.deepEqual(companyRoute('/t/' + mint), { redirect: '/' + mint });
  assert.deepEqual(companyRoute('/c/northstar-labs'), { redirect: '/northstar-labs' });
  for (const path of ['/api', '/api/market', '/register', '/health', '/app.css', '/vendor/mermaid.min.js', '/Invalid', '/t/bad', '/' + 'a'.repeat(33), '/northstar-labs/unknown']) assert.equal(companyRoute(path), null, path);
});

test("mint-or-slug resolver only binds through the market rows", () => {
  const token = { mint }, rows = [{ company: { slug: 'fixture-live' }, token }];
  assert.deepEqual(resolveCompanyIdentifier(mint, rows), { slug: 'fixture-live', token });
  assert.deepEqual(resolveCompanyIdentifier(mint, [{ company: null, token }]), { slug: null, token });
  assert.deepEqual(resolveCompanyIdentifier('northstar-labs', []), { slug: 'northstar-labs', token: null });
  assert.equal(resolveCompanyIdentifier(mint, []), null);
  assert.equal(resolveCompanyIdentifier('bad/slug', rows), null);
});

test("proxy allowlist rejects traversal before URL normalization and restricts host and method", () => {
  assert.equal(proxyTarget('GET', '/demo/site'), 'https://demo.casa.capx.ai/');
  assert.equal(proxyTarget('GET', '/demo/site/css/x.css?theme=dark'), 'https://demo.casa.capx.ai/css/x.css?theme=dark');
  assert.equal(proxyTarget('GET', '/demo/one-pager/img/a.png'), 'https://demo.casa.capx.ai/one-pager/img/a.png');
  assert.equal(proxyTarget('GET', '/demo/deck/'), 'https://demo.casa.capx.ai/deck/');
  for (const path of ['/demo/site/../secret', '/demo/site/%2e%2e/secret', '/demo/site/%252e%252e/secret', '/demo/site/a\\b', '/demo/site/%00', '/demo/site/%zz', '/demo/site/a..b']) assert.equal(safePath(path), false, path);
  for (const path of ['/UPPER/site', '/api/site/', '/a.b/site/', '/demo/outputs/file', '/demo/architecture', '//evil.com/site']) assert.equal(proxyTarget('GET', path), null, path);
  for (const method of ['POST', 'PUT', 'HEAD', 'DELETE']) assert.equal(proxyTarget(method, '/demo/site/'), null);
});

test("proxy streams bytes with sandbox, content type, short cache and upstream errors as 404", async () => {
  const response = new PassThrough(), chunks = [];
  response.writeHead = (status, headers) => { response.status = status; response.headers = headers; response.headersSent = true; return response; };
  response.on('data', (chunk) => chunks.push(chunk));
  await proxyCompany('https://demo.casa.capx.ai/', response, async (url, init) => {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    return new Response('hello streamed face', { headers: { 'content-type': 'text/html' } });
  });
  assert.equal(Buffer.concat(chunks).toString(), 'hello streamed face');
  assert.equal(response.headers['cache-control'], 'public, max-age=60');
  assert.equal(response.headers['content-security-policy'], 'sandbox allow-scripts');
  assert.equal(response.headers['content-type'], 'text/html');
  for (const upstream of [async () => new Response('', { status: 503 }), async () => { throw new Error('timeout'); }]) {
    const failed = { writeHead(status) { this.status = status; return this; }, end() {} };
    await proxyCompany('https://demo.casa.capx.ai/', failed, upstream);
    assert.equal(failed.status, 404);
  }
});

test("v2 CAPX conversion and descending USD cap sort put nulls last", () => {
  const row = publicRow({ mint, name: 'Live', price: 3, marketCap: 10, capxUsd: 2, image: 'image.png', creator: 'creator', stage: 'completed' });
  assert.equal(row.logoUrl, 'image.png'); assert.equal(row.creator, 'creator');
  assert.equal(marketFromLaunchpad(row).price_usd, 6);
  assert.equal(marketFromLaunchpad(row).fdv_usd, 20);
  const rows = [null, 0, 20, null, 100].map((value, i) => ({ i, market: { fdv_usd: value } }));
  assert.deepEqual(sortMarketCap(rows).map((r) => r.i), [4, 2, 1, 0, 3]);
  assert.equal(marketFromLaunchpad(publicRow({ mint, price: 1, marketCap: 4, capxUsd: null })).fdv_usd, null);
  assert.equal(marketFromLaunchpad(publicRow({ mint, price: null, marketCap: 4, capxUsd: 2 })).price_usd, null);
});

test("faces remain claimed and sidecar exposes readiness and agent count", () => {
  const view = publicCompanyView({ slug: 'demo', face: TOKENLESS_FACE, readiness: { face: { missing: [] } } });
  assert.equal(view.face.plane, 'claimed'); assert.equal(marketSurface(view).agents, 1);
  assert.deepEqual(marketSurface(view).readiness.face.missing, []);
  assert.ok(liveDocument().face.diagrams.architecture);
  assert.equal(liveDocument().progress.agents.length, 1);
});

function faceClient() {
  const stage = { replaceChildren() {}, setAttribute() {}, appendChild(frame) { this.frame = frame; } };
  const context = { window: {}, $: () => stage, document: { querySelectorAll: () => [], createElement: () => ({ setAttribute(k, v) { this[k] = v; } }) } };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../fmt.js', import.meta.url), 'utf8'), context);
  context.F = context.window.CAPX_FMT;
  const source = readFileSync(new URL('../company.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('/* Company authored face:')), context);
  return { context, stage };
}

test("face text and diagram source cannot inject HTML into the parent or srcdoc", () => {
  const { context, stage } = faceClient();
  const attack = '</pre><script>parent.pwned=1</script><img src=x onerror=alert(1)>';
  const html = context.faceText('## Heading\n' + attack + '\n**literal**');
  assert.match(html, /<h3>Heading<\/h3>/); assert.doesNotMatch(html, /<script>|<img/); assert.match(html, /\*\*literal\*\*/);
  context.DIAGRAMS = { architecture: attack }; context.selectDiagram('architecture');
  assert.equal(stage.frame.sandbox, 'allow-scripts');
  assert.match(stage.frame.srcdoc, /src="\/vendor\/mermaid.min.js"/);
  assert.doesNotMatch(stage.frame.srcdoc, /<script>parent.pwned/);
  assert.match(stage.frame.srcdoc, /securityLevel: 'strict'/);
  assert.match(stage.frame.srcdoc, /diagram did not render/);
  assert.equal(context.faceMissing({}).length, 7);
  assert.equal(context.faceMissing({ face: TOKENLESS_FACE }).length, 0);
});
