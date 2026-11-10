// --- Outils ------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const jourCourt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const jourLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
// Même jour que le serveur (heure de Paris), où que soit le téléphone.
const aujourdhui = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const ajouterJours = (iso, n) => {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Icônes : sprite dans index.html
const ico = (nom) => `<svg class="ico" aria-hidden="true"><use href="#i-${nom}"/></svg>`;
const ICONES = { 'Angoulême': ico('angouleme'), Parents: ico('parents'), Ailleurs: ico('ailleurs') };
const CLASSES = { 'Angoulême': 'angouleme', Parents: 'parents', Ailleurs: 'ailleurs' };

async function api(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
      body: options.body && JSON.stringify(options.body),
    });
  } catch {
    throw new Error('pas de connexion');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/connexion')) location.hash = '#connexion';
  if (!res.ok) throw Object.assign(new Error(data.erreur || 'Erreur serveur'), { status: res.status });
  return data;
}

// Affiche un message dans le <p class="message"> le plus proche.
const dire = (el, texte) => {
  (el.querySelector('.message') || el).textContent = texte;
};

let minuterieToast;
function toast(texte, erreur = false) {
  const el = $('#toast');
  el.textContent = texte;
  el.classList.toggle('erreur', erreur);
  el.hidden = false;
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => { el.hidden = true; }, erreur ? 6000 : 2500);
}

// --- Dernier état affiché, gardé sur le téléphone ------------------------------------
// Chaque écran s'affiche tout de suite avec ce qu'il montrait la dernière fois, puis se met à jour
// quand le serveur (et Notion) a répondu.
const memoLire = (cle) => {
  try { return JSON.parse(localStorage.getItem('agendix:' + cle)); } catch { return null; }
};
const memoEcrire = (cle, data) => {
  try { localStorage.setItem('agendix:' + cle, JSON.stringify({ t: Date.now(), data })); } catch { /* stockage plein ou interdit */ }
};
const depuis = (t) => {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  return min < 1440 ? `il y a ${Math.round(min / 60)} h` : `il y a ${Math.round(min / 1440)} j`;
};

// Ligne d'état sous le contenu : chargement, « mis à jour », ou erreur avec bouton Réessayer.
function etat(el, texte, { erreur = false, reessayer } = {}) {
  el.hidden = !texte;
  el.classList.toggle('erreur', erreur);
  el.textContent = texte || '';
  if (reessayer) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'petit secondaire';
    b.textContent = 'Réessayer';
    b.addEventListener('click', reessayer);
    el.append(b);
  }
}

// Montre le dernier état connu, puis le met à jour. Renvoie true si la mise à jour a réussi.
// { fraiche: true } : on vient de modifier quelque chose, le dernier état gardé est périmé, on ne l'affiche pas.
async function chargerAvecMemo(cle, url, afficher, elEtat, { fraiche = false } = {}) {
  const memo = memoLire(cle);
  if (memo && !fraiche) {
    afficher(memo.data);
    etat(elEtat, `Mis à jour ${depuis(memo.t)}…`);
  } else {
    etat(elEtat, fraiche ? '' : 'Chargement…');
  }
  try {
    const data = await api(url);
    memoEcrire(cle, data);
    afficher(data);
    etat(elEtat, '');
    return true;
  } catch (err) {
    if (err.status === 401) return false;
    const reessayer = () => chargerAvecMemo(cle, url, afficher, elEtat);
    if (fraiche && memo) afficher(memo.data); // échec : on remet l'ancien état plutôt qu'un affichage faux
    etat(elEtat, memo
      ? `Mise à jour impossible (${err.message}). Dernier état affiché : ${depuis(memo.t)}.`
      : `Impossible de charger : ${err.message}.`, { erreur: true, reessayer });
    return false;
  }
}

// --- Onglets -----------------------------------------------------------------
const CHARGER = {
  calendrier: (o) => chargerCalendrier(o),
  periodes: (o) => chargerPeriodes(o),
  reglages: (o) => Promise.all([chargerPeriodes(o), chargerCalendrierIcs()]).then((r) => r.every(Boolean)),
};

async function chargerCalendrierIcs() {
  try {
    const { chemin } = await api('/api/calendrier');
    const adresse = location.origin + chemin;
    $('#adresse-calendrier').value = adresse;
    $('#lien-calendrier').href = adresse.replace(/^https?:/, 'webcal:');
    return true;
  } catch {
    return false;
  }
}
$('#adresse-calendrier').addEventListener('focus', (e) => e.target.select());

function afficherOnglet() {
  const demande = location.hash.slice(1);
  const id = demande in CHARGER || demande === 'connexion' ? demande : 'calendrier';
  document.body.dataset.ecran = id;
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('active', s.id === id));
  document.querySelectorAll('nav a').forEach((a) => {
    const actif = a.hash === '#' + id;
    a.classList.toggle('active', actif);
    if (actif) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  CHARGER[id]?.();
}
addEventListener('hashchange', () => {
  afficherOnglet();
  scrollTo(0, 0); // chaque onglet repart du haut
  document.querySelector('section.active h2')?.focus({ preventScroll: true }); // lecteurs d'écran : annonce le nouvel écran
});
document.querySelectorAll('section > h2').forEach((h) => { h.tabIndex = -1; });

// --- Resynchroniser avec Notion ------------------------------------------------
$('#synchro').addEventListener('click', async (e) => {
  const bouton = e.currentTarget;
  if (bouton.classList.contains('charge')) return;
  bouton.classList.add('charge');
  bouton.setAttribute('aria-busy', 'true');
  try {
    await api('/api/synchro', { method: 'POST' });
    const ok = await CHARGER[document.body.dataset.ecran]?.({ fraiche: true }); // remet l'onglet affiché à jour
    if (ok === false) toast('Synchronisé, mais l’écran n’a pas pu se mettre à jour.', true);
    else toast('À jour avec Notion');
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
    e.target.motDePasse.value = '';
    location.hash = '#calendrier';
  } catch (err) {
    dire(e.target, err.message);
  }
});

// --- Calendrier du mois ----------------------------------------------------------
let mois = aujourdhui().slice(0, 8) + '01';
let lieux = {}; // '2026-11-20 midi' → 'Parents'

const finDuMois = () => ajouterJours(ajouterJours(mois, 31).slice(0, 8) + '01', -1);

function afficherCalendrier() {
  const fin = finDuMois();
  $('#titre-mois').textContent = new Date(mois + 'T12:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const decalage = (new Date(mois + 'T12:00:00').getDay() + 6) % 7; // lundi = 0
  const jour = aujourdhui();
  let html = '<span></span>'.repeat(decalage);
  for (let d = mois; d <= fin; d = ajouterJours(d, 1)) {
    const midi = lieux[`${d} midi`], soir = lieux[`${d} soir`];
    html += `
      <button type="button" class="jour${d === jour ? ' aujourdhui' : ''}${d < jour ? ' passe' : ''}" data-date="${d}"
        ${d === jour ? 'aria-current="date"' : ''}
        aria-label="${jourLong(d)}${d === jour ? ' (aujourd’hui)' : ''} : midi ${midi ?? 'inconnu'}, soir ${soir ?? 'inconnu'}">
        <span class="num">${Number(d.slice(8))}</span>
        <span class="demi ${CLASSES[midi] ?? ''}"></span><span class="demi ${CLASSES[soir] ?? ''}"></span>
      </button>`;
  }
  $('#jours').innerHTML = html;
}

function chargerCalendrier(options) {
  const du = mois, au = finDuMois();
  return chargerAvecMemo(`presence:${du}`, `/api/presence?du=${du}&au=${au}`, ({ creneaux }) => {
    if (du !== mois) return;
    lieux = Object.fromEntries(creneaux.map((c) => [`${c.date} ${c.moment}`, c.lieu]));
    afficherCalendrier();
  }, $('#statut'), options);
}

const changerMois = (sens) => {
  mois = ajouterJours(mois, sens > 0 ? 31 : -1).slice(0, 8) + '01';
  lieux = {};
  afficherCalendrier(); // le titre change tout de suite, le contenu suit
  chargerCalendrier();
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
  for (const m of ['midi', 'soir']) {
    f.querySelectorAll(`[name=${m}]`).forEach((r) => { r.checked = r.value === lieux[`${date} ${m}`]; });
  }
  dialogue.returnValue = '';
  dialogue.showModal();
});

// Un clic à côté de la fenêtre la ferme sans rien enregistrer.
dialogue.addEventListener('click', (e) => {
  if (e.target !== dialogue) return; // un clic sur un bouton (même au clavier) n'est jamais « à côté »
  const r = dialogue.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialogue.close('annuler');
});

dialogue.addEventListener('close', async () => {
  if (dialogue.returnValue !== 'ok') return;
  const f = $('#form-jour');
  const date = f.dataset.date;
  const choix = { midi: f.midi.value, soir: f.soir.value };
  const changes = ['midi', 'soir'].filter((m) => choix[m] && choix[m] !== lieux[`${date} ${m}`]);
  if (!changes.length) return;
  // Même lieu midi et soir : une seule période pour la journée.
  const periodes = choix.midi === choix.soir
    ? [{ duMoment: 'midi', auMoment: 'soir', lieu: choix.midi }]
    : changes.map((m) => ({ duMoment: m, auMoment: m, lieu: choix[m] }));
  for (const m of changes) lieux[`${date} ${m}`] = choix[m];
  afficherCalendrier(); // affichage immédiat, avant la réponse de Notion
  try {
    for (const p of periodes) await api('/api/periodes', { method: 'POST', body: { du: date, au: date, ...p } });
  } catch (err) {
    toast(`Enregistrement impossible : ${err.message}`, true);
  }
  chargerCalendrier({ fraiche: true }); // relit le vrai état (et corrige l'affichage si l'enregistrement a échoué)
});

// --- Périodes ------------------------------------------------------------------
function afficherPeriodes({ lieuParDefaut, periodes }) {
  $('#form-reglages').lieuParDefaut.value = lieuParDefaut;
  $('#liste-periodes').innerHTML = periodes.length
    ? periodes.map((p) => `
      <li class="periode ${CLASSES[p.lieu]}">
        <span class="nom">
          <strong>${ICONES[p.lieu]} ${esc(p.lieu)}</strong>
          <small>du ${jourCourt(p.du)} ${p.duMoment} au ${jourCourt(p.au)} ${p.auMoment}</small>
          ${p.note ? `<small>${esc(p.note)}</small>` : ''}
        </span>
        <button type="button" class="petit secondaire" data-supprimer="${esc(p.id)}" aria-label="Supprimer la période ${esc(p.lieu)} du ${jourCourt(p.du)}">${ico('corbeille')}</button>
      </li>`).join('')
    : '<li class="vide">Rien de prévu : tu es à ton lieu par défaut.</li>';
}

function chargerPeriodes(options) {
  return chargerAvecMemo('periodes', '/api/periodes', afficherPeriodes, $('#statut-periodes'), options);
}

$('#form-periode').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  dire(f, 'Enregistrement…');
  try {
    await api('/api/periodes', {
      method: 'POST',
      body: { du: f.du.value, duMoment: f.duMoment.value, au: f.au.value, auMoment: f.auMoment.value, lieu: f.lieu.value, note: f.note.value },
    });
    f.note.value = '';
    dire(f, 'Période ajoutée');
    chargerPeriodes({ fraiche: true });
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
  try {
    await api(`/api/periodes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('Période supprimée');
  } catch (err) {
    toast(`Suppression impossible : ${err.message}`, true);
  }
  chargerPeriodes({ fraiche: true });
});

// --- Réglages ------------------------------------------------------------------
$('#form-reglages').addEventListener('submit', async (e) => {
  e.preventDefault();
  dire(e.target, 'Enregistrement…');
  try {
    await api('/api/reglages', { method: 'PUT', body: { lieuParDefaut: e.target.lieuParDefaut.value } });
    dire(e.target, 'Enregistré');
  } catch (err) {
    dire(e.target, err.message);
  }
});

// --- Démarrage ---------------------------------------------------------------
$('#form-periode').du.value = $('#form-periode').au.value = aujourdhui();
afficherCalendrier(); // grille vide immédiatement (titre du mois, jours), remplie dès que les données arrivent
afficherOnglet();
api('/api/etat').then((e) => {
  $('#mode').hidden = e.mode !== 'demo';
}).catch(() => {});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
