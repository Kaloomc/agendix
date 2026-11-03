// Calcul « où suis-je à tel repas ? » à partir du lieu par défaut et des périodes saisies.
const LIEUX = ['Angoulême', 'Parents', 'Ailleurs'];
const MOMENTS = ['midi', 'soir'];

// Clé triable d'un créneau : '2026-11-20' midi → '2026-11-20 1', soir → '2026-11-20 2'.
const cle = (date, moment) => `${date} ${moment === 'soir' ? 2 : 1}`;
const ajouterJours = (date, n) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dateValide = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) && new Date(d).toISOString().startsWith(d);
const aujourdhui = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

// Tous les créneaux de du à au (inclus), dans l'ordre. Bornes des périodes incluses ;
// si plusieurs périodes couvrent un créneau, la plus récemment créée (ordre le plus grand) l'emporte.
function creneaux(periodes, lieuParDefaut, du, au) {
  const recentes = [...periodes].sort((a, b) => (b.ordre ?? 0) - (a.ordre ?? 0));
  const out = [];
  for (let date = du; date <= au; date = ajouterJours(date, 1)) {
    for (const moment of MOMENTS) {
      const k = cle(date, moment);
      const p = recentes.find((p) => cle(p.du, p.duMoment) <= k && k <= cle(p.au, p.auMoment));
      out.push({ date, moment, lieu: p ? p.lieu : lieuParDefaut });
    }
  }
  return out;
}

module.exports = { LIEUX, MOMENTS, cle, ajouterJours, dateValide, aujourdhui, creneaux };
