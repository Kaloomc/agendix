# Agendix

Petite appli web pour téléphone (PWA installable) qui sert à dire **où je suis, repas par repas** :
🏠 **Angoulême** (l'appart étudiant), 👨‍👩‍👦 **Parents** ou ✈️ **Ailleurs**.

Les autres applis du NAS la lisent : **Repax** ne prévoit des repas (midi et soir) que quand je suis à Angoulême.

C'est moi qui saisis tout, à la main. (Lire les mails de billets de train viendra plus tard : il suffira d'ajouter des périodes avec `POST /api/periodes`.)

## Lancer en local

Il faut Node.js 20 ou plus récent.

```bash
npm install
```

```bash
APP_PASSWORD=un-mot-de-passe npm start
```

Puis ouvrir http://localhost:3013. Tests : `npm test`.

Sans Notion configuré, l'appli tourne en **mode démo** (données dans `data/agenda.json`, ignoré par Git).

## Les onglets

| Onglet | Ce qu'on y fait |
|---|---|
| 📅 Calendrier | Le mois, avec deux demi-cases par jour : le haut = midi, le bas = soir, colorées selon le lieu. Toucher un jour permet de changer le midi et/ou le soir |
| 🧳 Périodes | « Du … (midi/soir) au … (midi/soir) : lieu + note », et la liste des périodes à venir (avec suppression) |
| ⚙️ Réglages | Le lieu par défaut, quand rien n'est prévu (Angoulême au départ) |

## Comment le lieu est calculé

- Par défaut, je suis au **lieu par défaut**.
- Une **période** (« Parents du jeudi 20 soir au dimanche 23 soir ») change le lieu de tous les repas entre ses deux bornes, **bornes comprises**.
- Si deux périodes se chevauchent, **la plus récemment créée l'emporte**. Toucher un jour du calendrier crée simplement une petite période d'une journée (ou d'un repas), qui passe donc devant les autres.

Le calcul est dans [`presence.js`](presence.js).

## API pour les autres applis

```
GET /api/presence?du=AAAA-MM-JJ&au=AAAA-MM-JJ
```

```json
{
  "lieuParDefaut": "Angoulême",
  "creneaux": [
    { "date": "2026-11-20", "moment": "midi", "lieu": "Angoulême" },
    { "date": "2026-11-20", "moment": "soir", "lieu": "Parents" }
  ]
}
```

Tous les créneaux de la plage (bornes comprises, 400 jours maximum), dans l'ordre, midi puis soir. **Ce format est utilisé par Repax : ne pas le changer.**

## Sécurité

- **Mot de passe obligatoire** (`APP_PASSWORD`) : sans lui, le serveur refuse de démarrer. Une fois connecté, un cookie garde la session un an.
- Les autres applis du NAS (Repax, Argenx) appellent `/api/*` avec l'en-tête **`X-Cle-Interne`**, comparé à temps constant à la variable `CLE_INTERNE` (la même valeur dans les trois applis). Sans `CLE_INTERNE`, cet en-tête est toujours refusé.

## Notion

Si `NOTION_TOKEN` et `NOTION_PAGE_ID` sont définis, les données vont dans une base **« Présence »** créée toute seule dans la page :

| Colonne | Type | Contenu |
|---|---|---|
| Note | titre | texte libre |
| Du / Au | date | premier et dernier jour |
| Moment de début / Moment de fin | sélection | `midi` ou `soir` |
| Lieu | sélection | `Angoulême`, `Parents` ou `Ailleurs` |
| Ordre | nombre | heure de création (en millisecondes) : départage deux périodes qui se chevauchent |

La ligne **sans date** « Lieu par défaut » contient le réglage du lieu par défaut.

## Fichiers

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur Express : accès (mot de passe, clé interne), API |
| `presence.js` | Calcul des créneaux |
| `store.js` | Stockage : mode démo (fichier) ou Notion |
| `notion.js` | Accès à l'API Notion |
| `public/` | Interface (HTML/CSS/JS sans compilation), manifest, service worker, icônes |
| `test.js` | Tests (`npm test`) |
| `docker-compose.yml` | Projet pour Container Manager (NAS Synology) |

## Mise en ligne

Voir [`docs/MISE-EN-LIGNE.md`](docs/MISE-EN-LIGNE.md) : NAS Synology, proxy inversé HTTPS sur le port **8446**, Freebox, écran d'accueil, et la clé interne à partager avec Repax et Argenx.
