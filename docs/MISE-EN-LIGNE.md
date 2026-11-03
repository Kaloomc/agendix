# Mise en ligne pas à pas

But : Agendix disponible sur **https://teranga-nas.synology.me:8446**, installée sur l'écran d'accueil du téléphone,
et lisible par Repax et Argenx sur le réseau de la maison (**http://192.168.1.45:3013**).
Même recette que Repax (3011 / 8444) et Argenx (3012 / 8445), avec le port **3013** côté NAS et **8446** côté Internet.

Le code est déjà sur GitHub : https://github.com/Kaloomc/agendix (dépôt public, sans aucun secret : les mots de passe et jetons restent dans Container Manager).

---

## 1. Choisir la clé interne (une seule fois pour les trois applis)

Repax et Argenx demandent à Agendix où tu es. Pour qu'Agendix sache que c'est bien eux, ils envoient une **clé interne** : une longue suite de caractères que toi seul connais, **la même dans les trois projets**.

Pour en générer une, dans un terminal :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Garde-la de côté (gestionnaire de mots de passe) : elle va dans `CLE_INTERNE` d'**Agendix**, de **Repax** et d'**Argenx**.

---

## 2. Préparer Notion (facultatif, sinon mode démo)

1. Va sur https://www.notion.so/profile/integrations → **Nouvelle intégration** (ou réutilise celle de Repax).
   - Type : **Interne**. Copie le **jeton secret** (`ntn_...`) : c'est `NOTION_TOKEN`.
2. Dans Notion, crée une page vide **« Agendix »**.
3. Sur cette page : **•••** → **Connexions** → ajoute ton intégration. Sans ça, l'appli ne voit pas la page.
4. Copie le lien de la page (**•••** → **Copier le lien**) : les 32 caractères à la fin sont `NOTION_PAGE_ID`.

Au premier démarrage, l'appli crée toute seule la base **« Présence »** dans cette page
(colonnes Note, Du, Moment de début, Au, Moment de fin, Lieu, Ordre).

---

## 3. Créer le projet dans Container Manager

1. **File Station** → dossier `docker` → crée un dossier **`agendix`**, puis **dedans** un dossier vide **`app`**.
   Les deux dossiers `/docker/agendix` **et** `/docker/agendix/app` doivent exister avant de lancer :
   sinon le démarrage échoue avec `Bind mount failed: ... /app does not exist` (Synology ne les crée pas tout seul).
2. **Container Manager** → **Projet** → **Créer** :
   - Nom du projet : `agendix`
   - Chemin : `/docker/agendix`
   - Source : **Créer un fichier docker-compose.yml**
3. Colle le contenu de [`docker-compose.yml`](../docker-compose.yml) et remplis les 4 lignes :
   - `APP_PASSWORD=` un mot de passe à toi (**obligatoire** : sans lui, l'appli refuse de démarrer)
   - `CLE_INTERNE=` la clé de l'étape 1
   - `NOTION_TOKEN=ntn_...` (ou vide pour le mode démo)
   - `NOTION_PAGE_ID=1a2b3c...`
4. **Suivant** → (pas besoin de Web Station) → **Terminé**. Le projet démarre.
5. Vérifie : **Conteneur** → `agendix` → **Journal**. Tu dois voir à la fin :
   `Agendix sur http://localhost:3013 (mode notion, clé interne active)`
   Le premier démarrage prend 1 à 2 minutes.

Test sur le réseau de la maison : http://192.168.1.45:3013

---

## 4. Proxy inversé HTTPS (port 8446)

**Panneau de configuration** → **Portail de connexion** → **Avancé** → **Proxy inversé** → **Créer** :

| | Source | Destination |
|---|---|---|
| Protocole | HTTPS | HTTP |
| Nom d'hôte | `teranga-nas.synology.me` | `localhost` |
| Port | `8446` | `3013` |

Nom de la règle : `agendix`. Coche **Activer HSTS** si tu veux.

---

## 5. Certificat

**Panneau de configuration** → **Sécurité** → **Certificat** → **Paramètres** :
pour le service **`teranga-nas.synology.me:8446`**, choisis le certificat **teranga-nas.synology.me** → **OK**.

---

## 6. Ouvrir le port sur la Freebox

1. http://mafreebox.freebox.fr → **Paramètres de la Freebox** → **Mode avancé** → **Gestion des ports**.
2. **Ajouter une redirection** :
   - IP de destination : `192.168.1.45`
   - Redirection active : oui
   - IP source : toutes
   - Protocole : **TCP**
   - Port de début / fin : `8446`
   - Port de destination : `8446`
3. **Sauvegarder**.

Si le **pare-feu DSM** est activé, autorise aussi le port TCP **8446**.
Le port **3013** n'a **pas** besoin d'être ouvert sur la Freebox : Repax et Argenx l'utilisent depuis le NAS lui-même.

Test depuis le téléphone **en 4G (Wi-Fi coupé)** : https://teranga-nas.synology.me:8446 → l'écran de connexion s'affiche.

---

## 7. Mettre l'appli sur l'écran d'accueil

### iPhone (avec Safari, obligatoirement)
1. Ouvre https://teranga-nas.synology.me:8446 dans **Safari** et connecte-toi.
2. Bouton **Partager** → **Sur l'écran d'accueil** → nom : `Agendix` → **Ajouter**.

### Android (avec Chrome)
1. Ouvre https://teranga-nas.synology.me:8446 dans **Chrome** et connecte-toi.
2. Menu **⋮** → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

---

## 8. Brancher Repax et Argenx

Dans Container Manager, pour **chacun** des projets `gestion-repas` (Repax) et `argenx` :
**Arrêter** → **Modifier** le YAML → mets **la même valeur `CLE_INTERNE`** qu'Agendix (et l'adresse de l'agenda,
`http://192.168.1.45:3013`, si leur YAML la demande) → **Enregistrer** → **Démarrer**.

Vérification depuis un ordinateur de la maison (remplace `TA_CLE`) :

```bash
curl -H "X-Cle-Interne: TA_CLE" "http://192.168.1.45:3013/api/presence?du=2026-11-20&au=2026-11-23"
```

Réponse attendue : `{"lieuParDefaut":"Angoulême","creneaux":[{"date":"2026-11-20","moment":"midi","lieu":"Angoulême"}, ...]}`.
Un `401` veut dire que la clé n'est pas la même des deux côtés.

---

## 9. Mettre à jour l'appli

1. Pousse les changements sur GitHub (`git push`).
2. **Container Manager** → **Projet** → `agendix` → **Action** → **Redémarrer**.

---

## Dépannage

| Problème | Piste |
|---|---|
| `Bind mount failed` | Le dossier `/docker/agendix/app` n'existe pas (étape 3.1) |
| Le journal affiche `APP_PASSWORD manquant` | Remplis `APP_PASSWORD` dans le YAML |
| `Notion : Could not find block` | La page n'est pas connectée à l'intégration (étape 2.3), ou `NOTION_PAGE_ID` est faux |
| Repax prévoit des repas alors que tu es chez tes parents | `CLE_INTERNE` différente entre Repax et Agendix, ou Agendix arrêté |
| La page ne s'ouvre pas depuis la 4G | Redirection Freebox (étape 6) ou pare-feu DSM |
| Avertissement de certificat | Étape 5 : le certificat n'est pas associé au port 8446 |
