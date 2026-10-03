/**
 * simulate-owner-key.js — proof that a saved activity can only be changed
 * or deleted by the browser that saved it (engine/owner-key.js, 2026-09-27).
 *
 *   SITE_PASSWORD=<pw> node server.js        (in another window)
 *   SITE_PASSWORD=<pw> node scripts/simulate-owner-key.js [baseUrl]
 *
 * The server needs SITE_PASSWORD set: without it every request counts as
 * the owner (local dev has no owner concept) and the gate never says no.
 * Writes and deletes its own rows only.
 */
const BASE = process.argv[2] || 'http://localhost:3000';
const PASSWORD = process.env.SITE_PASSWORD;
if (!PASSWORD) { console.error('Set SITE_PASSWORD (the same one the server runs with).'); process.exit(2); }

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const JSON_H = { 'content-type': 'application/json' };
let pass = 0, fail = 0;
function check(label, expected, actual) {
  if (expected === actual) { pass++; console.log(`ok   ${label} (${actual})`); }
  else { fail++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
}
async function call(method, path, { key, body, owner } = {}) {
  const headers = { ...(body ? JSON_H : {}) };
  if (key) headers['x-owner-key'] = key;
  if (owner) headers.authorization = 'Basic ' + Buffer.from('owner:' + PASSWORD).toString('base64');
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
// A one-pixel PNG through the asset route (multipart, field "file").
async function upload(path, { key, owner } = {}) {
  const headers = {};
  if (key) headers['x-owner-key'] = key;
  if (owner) headers.authorization = 'Basic ' + Buffer.from('owner:' + PASSWORD).toString('base64');
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'proof.png');
  const res = await fetch(BASE + path, { method: 'POST', headers, body: form });
  return { status: res.status };
}

async function main() {
  const src = (await call('GET', '/api/games/live-poll')).json;
  const config = { ...(src.config || src) };
  delete config.featured; delete config.recipe;
  config.name = 'Owner key proof';
  const changed = { ...config, name: 'Owner key proof, changed' };
  const id = 'owner-key-proof-' + Math.floor(Math.random() * 1e6);

  check('create with key A', 200, (await call('POST', '/api/games', { key: A, body: { id, config } })).status);
  check('overwrite with key B refused', 403, (await call('PUT', '/api/games/' + id, { key: B, body: changed })).status);
  check('overwrite with no key refused', 403, (await call('PUT', '/api/games/' + id, { body: changed })).status);
  check('overwrite with key A', 200, (await call('PUT', '/api/games/' + id, { key: A, body: changed })).status);

  // Featured rows show in every yard: the owner's curation, never a key's (2026-10-03)
  check('featured with key A refused (owner only)', 401, (await call('POST', '/api/games/' + id + '/featured', { key: A, body: { featured: true } })).status);
  check('featured with no key refused', 401, (await call('POST', '/api/games/' + id + '/featured', { body: { featured: true } })).status);
  check('featured with the owner password', 200, (await call('POST', '/api/games/' + id + '/featured', { owner: true, body: { featured: false } })).status);

  // An asset lands in the activity's folder: the saving browser or the owner (2026-10-03)
  check('asset upload with key B refused', 403, (await upload('/api/games/' + id + '/assets', { key: B })).status);
  check('asset upload with no key refused', 403, (await upload('/api/games/' + id + '/assets')).status);
  check('asset upload with key A', 200, (await upload('/api/games/' + id + '/assets', { key: A })).status);
  check('asset upload to a built-in without the password refused', 401, (await upload('/api/games/live-poll/assets', { key: A })).status);
  const denied = await call('DELETE', '/api/games/' + id, { key: B });
  check('delete with key B refused', 403, denied.status);
  check("the refusal carries the teacher's line", true, /another browser/.test(denied.json && denied.json.error));
  check('delete with no key refused', 403, (await call('DELETE', '/api/games/' + id)).status);
  check('row still there', 200, (await call('GET', '/api/games/' + id)).status);
  check('sample-answers save with key B refused', 403, (await call('POST', '/api/games/' + id + '/sample-answers?seats=2', { key: B })).status);
  check('the owner password deletes anything', 200, (await call('DELETE', '/api/games/' + id, { owner: true })).status);

  const id2 = id + '-b';
  check('create again with key A', 200, (await call('POST', '/api/games', { key: A, body: { id: id2, config } })).status);
  check('delete with key A', 200, (await call('DELETE', '/api/games/' + id2, { key: A })).status);
  check('gone', 404, (await call('GET', '/api/games/' + id2)).status);

  // A copy through the share route belongs to the copier
  const copy = await call('POST', '/api/games/live-poll/copy', { key: B });
  const cid = copy.json && copy.json.id;
  check('a share copy is made', true, !!cid);
  check("another key cannot delete the copier's copy", 403, (await call('DELETE', '/api/games/' + cid, { key: A })).status);
  check('the copier deletes its copy', 200, (await call('DELETE', '/api/games/' + cid, { key: B })).status);

  // A row from before the key: saved with no key, unowned until its browser lists it
  const lid = id + '-legacy';
  check('legacy row created with no key', 200, (await call('POST', '/api/games', { body: { id: lid, config } })).status);
  check("a stranger's delete of an unowned row refused (a delete never claims)", 403, (await call('DELETE', '/api/games/' + lid, { key: B })).status);
  check('the browser that lists it as its own claims it', 200, (await call('GET', '/api/games?mine=' + lid, { key: A })).status);
  check('after the claim, key B cannot overwrite', 403, (await call('PUT', '/api/games/' + lid, { key: B, body: changed })).status);
  await call('GET', '/api/games?mine=' + lid, { key: B });
  check('listing it under key B does not take it over', 403, (await call('DELETE', '/api/games/' + lid, { key: B })).status);
  check('the claiming browser deletes it', 200, (await call('DELETE', '/api/games/' + lid, { key: A })).status);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch(err => { console.error(err); process.exit(1); });
