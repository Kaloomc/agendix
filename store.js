// Stockage des périodes : Notion si NOTION_TOKEN est défini, sinon mode démo
// (fichier data/agenda.json, ignoré par Git).
// Les deux modes offrent les mêmes fonctions : list, add, update, remove, refresh.
// Le lieu par défaut est rangé comme une ligne sans date (note « Lieu par défaut »).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// clé JS → [nom de la colonne Notion, type Notion]
// « Ordre » (heure de création en millisecondes) départage deux périodes qui se chevauchent :
// la date de création de Notion est arrondie à la minute, trop grossier.
const CHAMPS = {
  note: ['Note', 'title'], du: ['Du', 'date'], duMoment: ['Moment de début', 'select'],
  au: ['Au', 'date'], auMoment: ['Moment de fin', 'select'], lieu: ['Lieu', 'select'], ordre: ['Ordre', 'number'],
};

// Garde seulement les champs connus.
const nettoyer = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => k in CHAMPS));

function demo() {
  const FILE = path.join(__dirname, 'data', 'agenda.json');
  let db;
  const charger = () => {
    try {
      db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
      db = { periodes: [] };
    }
  };
  charger();
  const save = () => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  };
  return {
    mode: 'demo',
    refresh: async () => charger(), // relit le fichier (modifié à la main ?)
    list: async () => structuredClone(db.periodes),
    add: async (obj) => {
      const ligne = { id: crypto.randomUUID(), ...nettoyer(obj) };
      db.periodes.push(ligne);
      save();
      return ligne;
    },
    update: async (id, patch) => {
      const ligne = db.periodes.find((x) => x.id === id);
      if (!ligne) throw new Error('Introuvable');
      Object.assign(ligne, nettoyer(patch));
      save();
      return ligne;
    },
    remove: async (id) => {
      db.periodes = db.periodes.filter((x) => x.id !== id);
      save();
    },
  };
}

module.exports = process.env.NOTION_TOKEN ? require('./notion')('Présence', CHAMPS, nettoyer) : demo();
