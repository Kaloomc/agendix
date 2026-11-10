const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const { LIEUX, MOMENTS, cle, ajouterJours, dateValide, aujourdhui, creneaux } = require('./presence');

const app = express();
app.set('trust proxy', 1); // derrière le proxy inversé du NAS
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Accès ---------------------------------------------------------------------
// Mot de passe obligatoire : l'appli est sur Internet. Un cookie garde la session un an.
// Les autres applis ne passent pas par ici : Repax lit directement la base Notion « Présence ».
const MOT_DE_PASSE = process.env.APP_PASSWORD;
if (!MOT_DE_PASSE) throw new Error('APP_PASSWORD manquant : choisis un mot de passe (ex. APP_PASSWORD=... npm start).');
const signer = (s) => crypto.createHmac('sha256', s).update('agendix').digest('hex');
const jeton = signer(MOT_DE_PASSE);
const egal = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

app.use('/api', (req, res, next) => {
  if (req.path === '/etat' || req.path === '/connexion') return next();
  const cookie = (req.headers.cookie || '').match(/(?:^|;\s*)agendix=([a-f0-9]+)/)?.[1] || '';
  if (egal(cookie, jeton)) return next();
  res.status(401).json({ erreur: 'Connexion nécessaire' });
});

app.post('/api/connexion', async (req, res) => {
  if (!egal(signer(String(req.body?.motDePasse ?? '')), jeton)) {
    await new Promise((r) => setTimeout(r, 1000)); // freine les essais en série
    return res.status(401).json({ erreur: 'Mot de passe incorrect' });
  }
  res.setHeader('Set-Cookie', `agendix=${jeton}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.get('/api/etat', (req, res) => res.json({ mode: store.mode }));

// --- Outils ------------------------------------------------------------------
class ErreurUtilisateur extends Error {}
const verifier = (ok, message) => {
  if (!ok) throw new ErreurUtilisateur(message);
};

// Ordre de création, toujours croissant même pour deux périodes créées dans la même milliseconde.
let dernierOrdre = 0;
const prochainOrdre = () => (dernierOrdre = Math.max(Date.now(), dernierOrdre + 1));

// Les lignes sans date sont le réglage « lieu par défaut » ; les autres sont des périodes.
// Une ligne modifiée à la main dans Notion peut être incomplète : on complète ce qui manque.
// Notion répond en plusieurs centaines de millisecondes : la lecture est gardée 30 s en mémoire
// (partagée par les requêtes simultanées), et oubliée dès qu'on écrit ou qu'on resynchronise.
// Les écritures relisent toujours à neuf (lire(true)).
const DUREE_CACHE = 30_000;
let enCache = null; // { t, promesse }
const oublier = () => { enCache = null; };
function lire(frais = false) {
  if (!frais && enCache && Date.now() - enCache.t < DUREE_CACHE) return enCache.promesse;
  const promesse = lireStore();
  const entree = { t: Date.now(), promesse };
  enCache = entree;
  promesse.catch(() => { if (enCache === entree) enCache = null; }); // une erreur n'est pas gardée
  return promesse;
}
async function lireStore() {
  const lignes = await store.list();
  const reglage = lignes.filter((l) => !l.du).sort((a, b) => (b.ordre ?? 0) - (a.ordre ?? 0))[0];
  const periodes = lignes
    .filter((l) => dateValide(l.du) && LIEUX.includes(l.lieu))
    .map((l) => ({
      id: l.id, du: l.du, au: dateValide(l.au) ? l.au : l.du,
      duMoment: MOMENTS.includes(l.duMoment) ? l.duMoment : 'midi',
      auMoment: MOMENTS.includes(l.auMoment) ? l.auMoment : 'soir',
      lieu: l.lieu, note: l.note || '', ordre: l.ordre ?? 0,
    }));
  return { reglage, lieuParDefaut: LIEUX.includes(reglage?.lieu) ? reglage.lieu : 'Angoulême', periodes };
}

// --- API pour les autres applis : où suis-je, repas par repas ? -----------------
app.get('/api/presence', async (req, res) => {
  const { du, au } = req.query;
  verifier(dateValide(du) && dateValide(au) && du <= au, 'Dates invalides (format AAAA-MM-JJ, du ≤ au)');
  verifier(au <= ajouterJours(du, 400), 'Plage trop longue (400 jours maximum)');
  const { lieuParDefaut, periodes } = await lire();
  res.json({ lieuParDefaut, creneaux: creneaux(periodes, lieuParDefaut, du, au) });
});

// --- Resynchronisation avec Notion, à la demande (bouton ↻ de l'interface) -------------
app.post('/api/synchro', async (req, res) => {
  oublier();
  await store.refresh();
  const { lieuParDefaut, periodes } = await lire(true);
  res.json({ mode: store.mode, lieuParDefaut, periodes: periodes.length });
});

// --- Périodes ------------------------------------------------------------------
app.get('/api/periodes', async (req, res) => {
  menage().catch((err) => console.error('Ménage :', err.message)); // en tâche de fond
  const { lieuParDefaut, periodes } = await lire();
  const jour = aujourdhui();
  res.json({
    lieuParDefaut,
    periodes: periodes
      .filter((p) => p.au >= jour)
      .sort((a, b) => cle(a.du, a.duMoment).localeCompare(cle(b.du, b.duMoment)) || b.ordre - a.ordre),
  });
});

app.post('/api/periodes', async (req, res) => {
  const { du, duMoment, au, auMoment, lieu, note = '' } = req.body ?? {};
  verifier(dateValide(du) && dateValide(au), 'Dates invalides');
  verifier(MOMENTS.includes(duMoment) && MOMENTS.includes(auMoment), 'Moment invalide (midi ou soir)');
  verifier(cle(du, duMoment) <= cle(au, auMoment), 'La fin est avant le début');
  verifier(LIEUX.includes(lieu), 'Lieu inconnu');
  verifier(typeof note === 'string', 'Note invalide');
  const { periodes } = await lire(true);
  try {
    const ligne = await store.add({ du, duMoment, au, auMoment, lieu, note: note.trim().slice(0, 200), ordre: prochainOrdre() });
    // Les périodes plus anciennes entièrement recouvertes par la nouvelle ne servent plus à rien : on les retire.
    const cachees = periodes.filter((p) => cle(p.du, p.duMoment) >= cle(du, duMoment) && cle(p.au, p.auMoment) <= cle(au, auMoment));
    await Promise.all(cachees.map((p) => store.remove(p.id)));
    res.json(ligne);
  } finally {
    oublier();
  }
});

// Ménage, au plus une fois par jour : les périodes finies depuis plus de 2 mois sont archivées dans Notion.
let dernierMenage = null;
async function menage() {
  const jour = aujourdhui();
  if (dernierMenage === jour) return;
  dernierMenage = jour;
  const { periodes } = await lire();
  const vieilles = periodes.filter((p) => p.au < ajouterJours(jour, -60));
  for (const p of vieilles) await store.remove(p.id);
  if (vieilles.length) oublier();
}

app.delete('/api/periodes/:id', async (req, res) => {
  const { periodes } = await lire(true);
  verifier(periodes.some((p) => p.id === req.params.id), 'Période introuvable');
  try {
    await store.remove(req.params.id);
  } finally {
    oublier();
  }
  res.json({ ok: true });
});

// --- Réglage : lieu par défaut ---------------------------------------------------
app.put('/api/reglages', async (req, res) => {
  const lieu = req.body?.lieuParDefaut;
  verifier(LIEUX.includes(lieu), 'Lieu inconnu');
  const { reglage } = await lire(true);
  const ligne = { note: 'Lieu par défaut', lieu, ordre: prochainOrdre() };
  try {
    if (reglage) await store.update(reglage.id, ligne);
    else await store.add(ligne);
  } finally {
    oublier();
  }
  res.json({ lieuParDefaut: lieu });
});

// --- Abonnement calendrier (.ics) ------------------------------------------------
// Le calendrier du téléphone ne sait pas se connecter : l'adresse contient un jeton secret, dérivé du mot de passe.
const jetonIcs = crypto.createHmac('sha256', MOT_DE_PASSE).update('agendix-calendrier').digest('hex').slice(0, 32);
app.get('/api/calendrier', (req, res) => res.json({ chemin: `/calendrier/${jetonIcs}.ics` }));

const ICONE = { Angoulême: '🏠', Parents: '👨‍👩‍👦', Ailleurs: '✈️' };
const echapper = (s) => s.replace(/[\\;,]/g, (c) => '\\' + c);
const dateIcs = (d) => d.replaceAll('-', '');
const jourLong = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// Un événement « journée entière » par suite de repas hors du lieu par défaut, du mois dernier à dans un an.
app.get('/calendrier/:jeton.ics', async (req, res) => {
  if (!egal(req.params.jeton, jetonIcs)) return res.status(404).end();
  const { lieuParDefaut, periodes } = await lire();
  const jour = aujourdhui();
  const blocs = [];
  for (const c of creneaux(periodes, lieuParDefaut, ajouterJours(jour, -30), ajouterJours(jour, 365))) {
    const b = blocs.at(-1);
    if (b?.lieu === c.lieu) b.dernier = c;
    else blocs.push({ lieu: c.lieu, premier: c, dernier: c });
  }
  const maintenant = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const evenements = blocs.filter((b) => b.lieu !== lieuParDefaut).map(({ lieu, premier: p, dernier: d }) => [
    'BEGIN:VEVENT',
    `UID:${p.date}-${p.moment}-${lieu}@agendix`,
    `DTSTAMP:${maintenant}`,
    `DTSTART;VALUE=DATE:${dateIcs(p.date)}`,
    `DTEND;VALUE=DATE:${dateIcs(ajouterJours(d.date, 1))}`,
    `SUMMARY:${echapper(`${ICONE[lieu]} ${lieu}`)}`,
    `DESCRIPTION:${echapper(`Du ${jourLong(p.date)} ${p.moment} au ${jourLong(d.date)} ${d.moment}`)}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ].join('\r\n'));
  res.type('text/calendar; charset=utf-8').send([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agendix//FR', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Agendix', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    ...evenements, 'END:VCALENDAR', '',
  ].join('\r\n'));
});

// --- Erreurs -----------------------------------------------------------------
app.use((err, req, res, next) => {
  if (!(err instanceof ErreurUtilisateur)) console.error(err);
  res.status(err instanceof ErreurUtilisateur ? 400 : 500).json({ erreur: err.message });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3013;
  app.listen(PORT, () => {
    console.log(`Agendix sur http://localhost:${PORT} (mode ${store.mode})`);
  });
}
