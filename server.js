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
// Les autres applis (Repax, Argenx) ne passent pas par ici : elles lisent la base Notion « Présence ».
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
async function lire() {
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

// --- Périodes ------------------------------------------------------------------
app.get('/api/periodes', async (req, res) => {
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
  res.json(await store.add({ du, duMoment, au, auMoment, lieu, note: note.trim().slice(0, 200), ordre: prochainOrdre() }));
});

app.delete('/api/periodes/:id', async (req, res) => {
  const { periodes } = await lire();
  verifier(periodes.some((p) => p.id === req.params.id), 'Période introuvable');
  await store.remove(req.params.id);
  res.json({ ok: true });
});

// --- Réglage : lieu par défaut ---------------------------------------------------
app.put('/api/reglages', async (req, res) => {
  const lieu = req.body?.lieuParDefaut;
  verifier(LIEUX.includes(lieu), 'Lieu inconnu');
  const { reglage } = await lire();
  const ligne = { note: 'Lieu par défaut', lieu, ordre: prochainOrdre() };
  if (reglage) await store.update(reglage.id, ligne);
  else await store.add(ligne);
  res.json({ lieuParDefaut: lieu });
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
