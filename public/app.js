// --- Outils ------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const jourCourt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const jourLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const aujourdhui = () => new Date().toLocaleDateString('sv-SE');
const ajouterJours = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const ICONES = { 'Angoulême': '🏠', Parents: '👨‍👩‍👦', Ailleurs: '✈️' };
const CLASSES = { 'Angoulême': 'angouleme', Parents: 'parents', Ailleurs: 'ailleurs' };

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body && JSON.stringify(options.body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/connexion')) location.hash = '#connexion';
  if (!res.ok) throw new Error(data.erreur || 'Erreur serveur');
  return data;
}

// Affiche un message dans le <p class="message"> le plus proche.
const dire = (el, texte) => {
  (el.querySelector('.message') || el).textContent = texte;
};

// --- Onglets -----------------------------------------------------------------
const CHARGER = {
  calendrier: () => chargerCalendrier(),
  periodes: () => chargerPeriodes(),
  reglages: () => Promise.all([chargerPeriodes(), chargerCalendrierIcs()]),
};

async function chargerCalendrierIcs() {
  const { chemin } = await api('/api/calendrier');
  const adresse = location.origin + chemin;
  $('#adresse-calendrier').value = adresse;
  $('#lien-calendrier').href = adresse.replace(/^https?:/, 'webcal:');
}
$('#adresse-calendrier').addEventListener('focus', (e) => e.target.select());

function afficherOnglet() {
  const id = location.hash.slice(1) || 'calendrier';
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.hash === '#' + id));
  CHARGER[id]?.().catch((err) => console.error(err));
}
addEventListener('hashchange', afficherOnglet);

// --- Resynchroniser avec Notion ------------------------------------------------
let minuterieToast;
function toast(texte, erreur = false) {
  const el = $('#toast');
  el.textContent = texte;
  el.classList.toggle('erreur', erreur);
  el.hidden = false;
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => { el.hidden = true; }, erreur ? 6000 : 2500);
}

$('#synchro').addEventListener('click', async (e) => {
  const bouton = e.currentTarget;
  if (bouton.classList.contains('charge')) return;
  bouton.classList.add('charge');
  bouton.setAttribute('aria-busy', 'true');
  try {
    await api('/api/synchro', { method: 'POST' });
    await CHARGER[location.hash.slice(1) || 'calendrier']?.(); // remet l'onglet affiché à jour
    toast('À jour avec Notion ✔');
  } catch (err) {
    toast(`Synchronisation impossible : ${err.message}`, true);
  } finally {
    bouton.classList.remove('charge');
    bouton.removeAttribute('aria-busy');
  }
});

// --- Connexion ---------------------------------------------------------------
$('#form-connexion').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/connexion', { method: 'POST', body: { motDePasse: e.target.motDePasse.value } });
    location.hash = '#calendrier';
  } catch (err) {
    dire(e.target, err.message);
  }
});

// --- Calendrier du mois ----------------------------------------------------------
let mois = aujourdhui().slice(0, 8) + '01';
let lieux = {}; // '2026-11-20 midi' → 'Parents'

async function chargerCalendrier() {
  const fin = ajouterJours(ajouterJours(mois, 31).slice(0, 8) + '01', -1);
  const { creneaux } = await api(`/api/presence?du=${mois}&au=${fin}`);
  lieux = Object.fromEntries(creneaux.map((c) => [`${c.date} ${c.moment}`, c.lieu]));

  const titre = new Date(mois + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  $('#titre-mois').textContent = titre;
  const decalage = (new Date(mois + 'T12:00:00').getDay() + 6) % 7; // lundi = 0
  const jour = aujourdhui();
  let html = '<span></span>'.repeat(decalage);
  for (let d = mois; d <= fin; d = ajouterJours(d, 1)) {
    const midi = lieux[`${d} midi`], soir = lieux[`${d} soir`];
    html += `
      <button class="jour${d === jour ? ' aujourdhui' : ''}${d < jour ? ' passe' : ''}" data-date="${d}"
        aria-label="${jourLong(d)} : midi ${midi}, soir ${soir}">
        <span class="demi ${CLASSES[midi]}"></span><span class="demi ${CLASSES[soir]}"></span>
        <span class="num">${Number(d.slice(8))}</span>
      </button>`;
  }
  $('#jours').innerHTML = html;
}

const changerMois = (sens) => {
  mois = ajouterJours(mois, sens > 0 ? 31 : -1).slice(0, 8) + '01';
  chargerCalendrier().catch((err) => alert(err.message));
};
$('#mois-avant').addEventListener('click', () => changerMois(-1));
$('#mois-apres').addEventListener('click', () => changerMois(1));

// Toucher un jour : choisir où l'on est le midi et le soir.
const dialogue = $('#dialogue-jour');
$('#jours').addEventListener('click', (e) => {
  const date = e.target.closest('.jour')?.dataset.date;
  if (!date) return;
  const f = $('#form-jour');
  f.dataset.date = date;
  $('#titre-jour').textContent = jourLong(date);
  for (const m of ['midi', 'soir']) f.querySelector(`[name=${m}][value="${lieux[`${date} ${m}`]}"]`).checked = true;
  dialogue.returnValue = '';
  dialogue.showModal();
});

dialogue.addEventListener('close', async () => {
  if (dialogue.returnValue !== 'ok') return;
  const f = $('#form-jour');
  const date = f.dataset.date;
  const choix = { midi: f.midi.value, soir: f.soir.value };
  const changes = ['midi', 'soir'].filter((m) => choix[m] !== lieux[`${date} ${m}`]);
  if (!changes.length) return;
  // Même lieu midi et soir : une seule période pour la journée.
  const periodes = choix.midi === choix.soir
    ? [{ duMoment: 'midi', auMoment: 'soir', lieu: choix.midi }]
    : changes.map((m) => ({ duMoment: m, auMoment: m, lieu: choix[m] }));
  try {
    for (const p of periodes) await api('/api/periodes', { method: 'POST', body: { du: date, au: date, ...p } });
  } catch (err) {
    alert(err.message);
  }
  chargerCalendrier().catch((err) => alert(err.message));
});

// --- Périodes ------------------------------------------------------------------
async function chargerPeriodes() {
  const { lieuParDefaut, periodes } = await api('/api/periodes');
  $('#form-reglages').lieuParDefaut.value = lieuParDefaut;
  $('#liste-periodes').innerHTML = periodes.length
    ? periodes.map((p) => `
      <li class="periode ${CLASSES[p.lieu]}">
        <span class="nom">
          <strong>${ICONES[p.lieu]} ${esc(p.lieu)}</strong>
          <small>du ${jourCourt(p.du)} ${p.duMoment} au ${jourCourt(p.au)} ${p.auMoment}</small>
          ${p.note ? `<small>${esc(p.note)}</small>` : ''}
        </span>
        <button class="petit secondaire" data-supprimer="${esc(p.id)}" aria-label="Supprimer">🗑️</button>
      </li>`).join('')
    : '<li class="vide">Rien de prévu : tu es à ton lieu par défaut.</li>';
}

$('#form-periode').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/periodes', {
      method: 'POST',
      body: { du: f.du.value, duMoment: f.duMoment.value, au: f.au.value, auMoment: f.auMoment.value, lieu: f.lieu.value, note: f.note.value },
    });
    f.note.value = '';
    dire(f, 'Période ajoutée ✔');
    chargerPeriodes();
  } catch (err) {
    dire(f, err.message);
  }
});

// La date de fin suit la date de début si elle se retrouve avant.
$('#form-periode').du.addEventListener('change', (e) => {
  const f = e.target.form;
  if (f.au.value < f.du.value) f.au.value = f.du.value;
});

$('#liste-periodes').addEventListener('click', async (e) => {
  const id = e.target.closest('[data-supprimer]')?.dataset.supprimer;
  if (!id || !confirm('Supprimer cette période ?')) return;
  await api(`/api/periodes/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((err) => alert(err.message));
  chargerPeriodes();
});

// --- Réglages ------------------------------------------------------------------
$('#form-reglages').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/reglages', { method: 'PUT', body: { lieuParDefaut: e.target.lieuParDefaut.value } });
    dire(e.target, 'Enregistré ✔');
  } catch (err) {
    dire(e.target, err.message);
  }
});

// --- Démarrage ---------------------------------------------------------------
$('#form-periode').du.value = $('#form-periode').au.value = aujourdhui();
api('/api/etat').then((e) => {
  $('#mode').hidden = e.mode !== 'demo';
}).catch(() => {});
afficherOnglet();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
