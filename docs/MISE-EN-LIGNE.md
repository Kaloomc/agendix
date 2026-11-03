# Mise en ligne pas à pas

But : Agendix disponible sur **https://teranga-nas.synology.me:8446**, installée sur l'écran d'accueil du téléphone.
Même recette que Repax (3011 / 8444) et Argenx (3012 / 8445), avec le port **3013** côté NAS et **8446** côté Internet.

Agendix et Repax partagent **la même page Notion** : Agendix y range la base « Présence », Repax la lit pour savoir quand tu es à Angoulême.
Les deux applis ne se parlent pas directement : tout passe par Notion.

Le code est déjà sur GitHub : https://github.com/Kaloomc/agendix (dépôt public, sans aucun secret : les mots de passe et jetons restent dans Container Manager).

---

## 1. Notion : reprendre celui de Repax

Rien à créer : réutilise **le jeton (`NOTION_TOKEN`) et la page (`NOTION_PAGE_ID`) de Repax**, copiés depuis le YAML du projet `gestion-repas` dans Container Manager.

Au premier démarrage, Agendix crée toute seule la base **« Présence »** dans cette page, à côté des bases de Repax
(colonnes Note, Du, Moment de début, Au, Moment de fin, Lieu, Ordre).

---

## 2. Créer le projet dans Container Manager

1. **File Station** → dossier `docker` → crée un dossier **`agendix`**, puis **dedans** un dossier vide **`app`**.
   Les deux dossiers `/docker/agendix` **et** `/docker/agendix/app` doivent exister avant de lancer :
   sinon le démarrage échoue avec `Bind mount failed: ... /app does not exist` (Synology ne les crée pas tout seul).
2. **Container Manager** → **Projet** → **Créer** :
   - Nom du projet : `agendix`
   - Chemin : `/docker/agendix`
   - Source : **Créer un fichier docker-compose.yml**
3. Colle le contenu de [`docker-compose.yml`](../docker-compose.yml) et remplis les 3 lignes :
   - `APP_PASSWORD=` un mot de passe à toi (**obligatoire** : sans lui, l'appli refuse de démarrer)
   - `NOTION_TOKEN=` le même que Repax
   - `NOTION_PAGE_ID=` le même que Repax
4. **Suivant** → (pas besoin de Web Station) → **Terminé**. Le projet démarre.
5. Vérifie : **Conteneur** → `agendix` → **Journal**. Tu dois voir à la fin :
   `Agendix sur http://localhost:3013 (mode notion)`
   Le premier démarrage prend 1 à 2 minutes. Si c'est `mode demo`, le jeton Notion est vide : Repax ne verra rien.

Test sur le réseau de la maison : http://192.168.1.45:3013

---

## 3. Proxy inversé HTTPS (port 8446)

**Panneau de configuration** → **Portail de connexion** → **Avancé** → **Proxy inversé** → **Créer** :

| | Source | Destination |
|---|---|---|
| Protocole | HTTPS | HTTP |
| Nom d'hôte | `teranga-nas.synology.me` | `localhost` |
| Port | `8446` | `3013` |

Nom de la règle : `agendix`. Coche **Activer HSTS** si tu veux.

---

## 4. Certificat

**Panneau de configuration** → **Sécurité** → **Certificat** → **Paramètres** :
pour le service **`teranga-nas.synology.me:8446`**, choisis le certificat **teranga-nas.synology.me** → **OK**.

---

## 5. Ouvrir le port sur la Freebox

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

Test depuis le téléphone **en 4G (Wi-Fi coupé)** : https://teranga-nas.synology.me:8446 → l'écran de connexion s'affiche.

---

## 6. Mettre l'appli sur l'écran d'accueil

### iPhone (avec Safari, obligatoirement)
1. Ouvre https://teranga-nas.synology.me:8446 dans **Safari** et connecte-toi.
2. Bouton **Partager** → **Sur l'écran d'accueil** → nom : `Agendix` → **Ajouter**.

### Android (avec Chrome)
1. Ouvre https://teranga-nas.synology.me:8446 dans **Chrome** et connecte-toi.
2. Menu **⋮** → **Installer l'application** (ou **Ajouter à l'écran d'accueil**).

---

## 7. Vérifier le lien avec Repax

1. Dans Agendix, ajoute une période (par exemple « Parents » ce week-end).
2. Dans Notion, ouvre la page de Repax : la base **« Présence »** contient la ligne.
3. Dans Repax, repropose les repas : rien n'est prévu pendant le week-end chez les parents.

---

## 8. Mettre à jour l'appli

1. Pousse les changements sur GitHub (`git push`).
2. **Container Manager** → **Projet** → `agendix` → **Action** → **Redémarrer**.

---

## Dépannage

| Problème | Piste |
|---|---|
| `Bind mount failed` | Le dossier `/docker/agendix/app` n'existe pas (étape 2.1) |
| Le journal affiche `APP_PASSWORD manquant` | Remplis `APP_PASSWORD` dans le YAML |
| `Notion : Could not find block` | `NOTION_PAGE_ID` différent de celui de Repax, ou page non connectée à l'intégration |
| Repax prévoit des repas alors que tu es chez tes parents | Agendix en `mode demo` (jeton vide), ou pas la même page Notion que Repax |
| La page ne s'ouvre pas depuis la 4G | Redirection Freebox (étape 5) ou pare-feu DSM |
| Avertissement de certificat | Étape 4 : le certificat n'est pas associé au port 8446 |
