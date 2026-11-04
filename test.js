// Vérifications rapides : npm test
const test = require('node:test');
const assert = require('node:assert');
const { creneaux, LIEUX } = require('./presence');

process.env.APP_PASSWORD = 'mot-de-passe-test';
delete process.env.NOTION_TOKEN;
const app = require('./server');

const lieux = (c) => c.map((x) => `${x.date.slice(8)} ${x.moment} ${{ Angoulême: 'A', Parents: 'P', Ailleurs: 'X' }[x.lieu]}`);

test('sans période : lieu par défaut partout', () => {
  assert.deepStrictEqual(lieux(creneaux([], 'Angoulême', '2026-11-20', '2026-11-21')), [
    '20 midi A', '20 soir A', '21 midi A', '21 soir A',
  ]);
});

test('bornes midi/soir incluses', () => {
  // Parents du jeudi 20 soir au dimanche 23 midi
  const p = [{ du: '2026-11-20', duMoment: 'soir', au: '2026-11-23', auMoment: 'midi', lieu: 'Parents', ordre: 1 }];
  assert.deepStrictEqual(lieux(creneaux(p, 'Angoulême', '2026-11-20', '2026-11-23')), [
    '20 midi A', '20 soir P', '21 midi P', '21 soir P', '22 midi P', '22 soir P', '23 midi P', '23 soir A',
  ]);
});

test('périodes qui se chevauchent : la plus récente l’emporte', () => {
  const parents = { du: '2026-11-20', duMoment: 'midi', au: '2026-11-22', auMoment: 'soir', lieu: 'Parents', ordre: 1 };
  const ailleurs = { du: '2026-11-21', duMoment: 'soir', au: '2026-11-21', auMoment: 'soir', lieu: 'Ailleurs', ordre: 2 };
  const attendu = ['20 midi P', '20 soir P', '21 midi P', '21 soir X', '22 midi P', '22 soir P'];
  // L'ordre dans la liste ne compte pas, seul « ordre » (création) compte.
  assert.deepStrictEqual(lieux(creneaux([parents, ailleurs], 'Angoulême', '2026-11-20', '2026-11-22')), attendu);
  assert.deepStrictEqual(lieux(creneaux([ailleurs, parents], 'Angoulême', '2026-11-20', '2026-11-22')), attendu);
  // Si la longue période est la plus récente, elle recouvre l'autre.
  assert.ok(creneaux([{ ...parents, ordre: 3 }, ailleurs], 'Angoulême', '2026-11-21', '2026-11-21').every((c) => c.lieu === 'Parents'));
});

test('période qui déborde de la plage demandée, et changement de mois', () => {
  const p = [{ du: '2026-10-25', duMoment: 'midi', au: '2026-12-02', auMoment: 'midi', lieu: 'Ailleurs', ordre: 1 }];
  assert.deepStrictEqual(lieux(creneaux(p, 'Parents', '2026-11-30', '2026-12-02')), [
    '30 midi X', '30 soir X', '01 midi X', '01 soir X', '02 midi X', '02 soir P',
  ]);
});

// --- HTTP ----------------------------------------------------------------------
let serveur, base;
test.before(() => new Promise((ok) => {
  serveur = app.listen(0, () => {
    base = `http://localhost:${serveur.address().port}`;
    ok();
  });
}));
test.after(() => serveur.close());

const presence = (entetes = {}) => fetch(`${base}/api/presence?du=2026-11-30&au=2026-12-02`, { headers: entetes });

let cookie;
test('connexion obligatoire : mot de passe puis cookie, aucune autre porte', async () => {
  assert.strictEqual((await presence()).status, 401);
  assert.strictEqual((await presence({ 'X-Cle-Interne': 'nimporte' })).status, 401);
  const non = await fetch(`${base}/api/connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"motDePasse":"faux"}' });
  assert.strictEqual(non.status, 401);
  const oui = await fetch(`${base}/api/connexion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"motDePasse":"mot-de-passe-test"}' });
  cookie = oui.headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await presence({ Cookie: cookie })).status, 200);
});

test('format de /api/presence (utilisé par le calendrier)', async () => {
  const r = await (await presence({ Cookie: cookie })).json();
  assert.deepStrictEqual(Object.keys(r), ['lieuParDefaut', 'creneaux']);
  assert.ok(LIEUX.includes(r.lieuParDefaut));
  assert.deepStrictEqual(r.creneaux.map((c) => `${c.date} ${c.moment}`), [
    '2026-11-30 midi', '2026-11-30 soir', '2026-12-01 midi', '2026-12-01 soir', '2026-12-02 midi', '2026-12-02 soir',
  ]);
  for (const c of r.creneaux) {
    assert.deepStrictEqual(Object.keys(c), ['date', 'moment', 'lieu']);
    assert.ok(LIEUX.includes(c.lieu));
  }
  const mauvais = await fetch(`${base}/api/presence?du=2026-12-02&au=2026-11-30`, { headers: { Cookie: cookie } });
  assert.strictEqual(mauvais.status, 400);
});

test('resynchronisation : connexion obligatoire, puis état renvoyé', async () => {
  assert.strictEqual((await fetch(`${base}/api/synchro`, { method: 'POST' })).status, 401);
  const res = await fetch(`${base}/api/synchro`, { method: 'POST', headers: { Cookie: cookie } });
  assert.strictEqual(res.status, 200);
  const r = await res.json();
  assert.deepStrictEqual(Object.keys(r), ['mode', 'lieuParDefaut', 'periodes']);
  assert.ok(LIEUX.includes(r.lieuParDefaut) && Number.isInteger(r.periodes));
});

test('une période recouverte par une plus récente est retirée ; calendrier .ics', async () => {
  const appel = async (method, url, body) =>
    (await fetch(base + url, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })).json();
  const jour = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const dans = (n) => { const d = new Date(jour + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const petite = await appel('POST', '/api/periodes', { du: dans(10), duMoment: 'soir', au: dans(10), auMoment: 'soir', lieu: 'Ailleurs', note: 'test' });
  const grande = await appel('POST', '/api/periodes', { du: dans(9), duMoment: 'soir', au: dans(12), auMoment: 'midi', lieu: 'Parents', note: 'test' });
  const ids = (await appel('GET', '/api/periodes')).periodes.map((p) => p.id);
  assert.ok(ids.includes(grande.id) && !ids.includes(petite.id));

  const { chemin } = await appel('GET', '/api/calendrier');
  assert.strictEqual((await fetch(base + '/calendrier/faux.ics')).status, 404);
  const ics = await (await fetch(base + chemin)).text();
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes(`DTSTART;VALUE=DATE:${dans(9).replaceAll('-', '')}\r\nDTEND;VALUE=DATE:${dans(13).replaceAll('-', '')}`), ics);
  assert.ok(ics.includes(' soir au ') && ics.includes(' midi'));
  await appel('DELETE', `/api/periodes/${grande.id}`);
});
