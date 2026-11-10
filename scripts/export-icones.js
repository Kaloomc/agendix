#!/usr/bin/env node
// Exporte les icônes de l'appli depuis le SVG maître public/icons/icon.svg (hors runtime : aucune dépendance).
// Utilise un Chromium/Chrome en mode headless, déjà présent sur la plupart des machines.
//   node scripts/export-icones.js            (ou CHROME=/chemin/vers/chrome node scripts/export-icones.js)
// Produit dans public/icons/ : icon-512.png et icon-192.png (coins arrondis transparents), apple-touch-icon.png (180),
// icon-maskable-512.png, favicon-32.png, favicon-48.png et favicon.svg (carrés pleins : le système arrondit lui-même).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dossier = path.join(__dirname, '..', 'public', 'icons');
const maitre = fs.readFileSync(path.join(dossier, 'icon.svg'), 'utf8');
const pleinCadre = maitre.replace('rx="112"', 'rx="0"').replaceAll('rx="112"', 'rx="0"');

const CHROME = process.env.CHROME || ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']
  .map((n) => { try { return execFileSync('which', [n], { encoding: 'utf8' }).trim(); } catch { return ''; } })
  .find(Boolean);
if (!CHROME) { console.error('Aucun Chromium/Chrome trouvé : indiquer son chemin dans CHROME=…'); process.exit(1); }

// [fichier, taille, svg, fond transparent ?]
fs.writeFileSync(path.join(dossier, 'favicon.svg'), pleinCadre);
console.log('public/icons/favicon.svg');

const SORTIES = [
  ['icon-512.png', 512, maitre, true],
  ['icon-192.png', 192, maitre, true],
  ['icon-maskable-512.png', 512, pleinCadre, false],
  ['apple-touch-icon.png', 180, pleinCadre, false],
  ['favicon-32.png', 32, pleinCadre, false],
  ['favicon-48.png', 48, pleinCadre, false],
];

// Le dossier temporaire doit rester lisible par Chromium (snap) : dans le home, pas dans /tmp.
const tmp = fs.mkdtempSync(path.join(os.homedir(), 'export-icones-'));
try {
  for (const [nom, taille, svg, transparent] of SORTIES) {
    const page = path.join(tmp, 'page.html');
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block;width:${taille}px;height:${taille}px}</style>${svg}`);
    const sortie = path.join(tmp, nom);
    execFileSync(CHROME, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      ...(transparent ? ['--default-background-color=00000000'] : []),
      `--window-size=${taille},${taille}`, `--screenshot=${sortie}`, 'file://' + page,
    ], { stdio: 'ignore' });
    fs.copyFileSync(sortie, path.join(dossier, nom));
    console.log(`public/icons/${nom} (${taille} px)`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
