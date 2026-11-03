# Agendix

Petite appli web pour téléphone (PWA installable) qui sert à dire **où je suis, repas par repas** :
🏠 **Angoulême** (l'appart étudiant), 👨‍👩‍👦 **Parents** ou ✈️ **Ailleurs**.

Tout est rangé dans **Notion**, dans la même page que Repax : **Repax** y lit où je suis et ne prévoit des repas (midi et soir) que quand je suis à Angoulême.

C'est moi qui saisis tout, à la main. (Lire les mails de billets de train viendra plus tard : il suffira d'ajouter des lignes dans la base « Présence ».)

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

## Sécurité

**Mot de passe obligatoire** (`APP_PASSWORD`) : sans lui, le serveur refuse de démarrer. Une fois connecté, un cookie garde la session un an.
L'API d'Agendix ne sert qu'à sa propre interface : aucune autre appli ne l'appelle.

## Notion : la base partagée

Tout passe par Notion. Agendix utilise **le même jeton et la même page Notion que Repax** (`NOTION_TOKEN`, `NOTION_PAGE_ID`) et y range une base **« Présence »**, créée toute seule à côté des bases de Repax.
Repax lit cette base directement dans Notion pour savoir où tu es ; il ne parle pas à Agendix. Argenx partage la même page pour ses propres bases.

Colonnes :

| Colonne | Type | Contenu |
|---|---|---|
| Note | titre | texte libre |
| Du / Au | date | premier et dernier jour |
| Moment de début / Moment de fin | sélection | `midi` ou `soir` |
| Lieu | sélection | `Angoulême`, `Parents` ou `Ailleurs` |
| Ordre | nombre | heure de création (en millisecondes) : départage deux périodes qui se chevauchent |

La ligne **sans date** « Lieu par défaut » contient le réglage du lieu par défaut (Angoulême s'il n'y en a pas).

### Lire la base depuis une autre appli

Pour savoir où je suis à un repas (date + midi/soir) :

1. lire toutes les lignes de « Présence » ;
2. lieu par défaut = colonne Lieu de la ligne sans date (celle à la plus grande valeur d'Ordre s'il y en a plusieurs), sinon `Angoulême` ;
3. parmi les lignes avec date, garder celles qui couvrent le créneau, bornes comprises : (Du, Moment de début) ≤ (date, moment) ≤ (Au, Moment de fin), midi étant avant soir ; si Au est vide, c'est Du ; moments vides = midi au début, soir à la fin ;
4. s'il y en a, le lieu est celui de la ligne qui a le plus grand Ordre (vide = 0) ; sinon c'est le lieu par défaut.

La fonction `creneaux()` de [`presence.js`](presence.js) fait exactement ça (une vingtaine de lignes, sans dépendance) : on peut la recopier telle quelle.
Le serveur n'expose `GET /api/presence?du=…&au=…` que pour le calendrier de sa propre interface.

## Fichiers

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur Express : mot de passe, API de l'interface |
| `presence.js` | Calcul des créneaux |
| `store.js` | Stockage : mode démo (fichier) ou Notion |
| `notion.js` | Accès à l'API Notion |
| `public/` | Interface (HTML/CSS/JS sans compilation), manifest, service worker, icônes |
| `test.js` | Tests (`npm test`) |
| `docker-compose.yml` | Projet pour Container Manager (NAS Synology) |

## Mise en ligne

Voir [`docs/MISE-EN-LIGNE.md`](docs/MISE-EN-LIGNE.md) : NAS Synology, proxy inversé HTTPS sur le port **8446**, Freebox, écran d'accueil, et la page Notion à partager avec Repax.
