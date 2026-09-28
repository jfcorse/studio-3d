# Studio 3D

Studio de 3,73 × 4,04 m en 3D : mobilier déplaçable, dimensions, couleurs, lumières et plans enregistrés.

Le projet tient dans un seul fichier, `studio-3d.html`. On peut l'ouvrir directement dans un navigateur, ou l'utiliser comme application Windows.

## Installer l'application Windows

Télécharge **`Studio-3D-Setup-….exe`** sur la page [Releases](https://github.com/jfcorse/studio-3d/releases/latest) et lance-le (installation dans ton compte, sans droits administrateur). Il existe aussi une version `Studio-3D-portable-….exe`, sans installation, mais elle ne se met pas à jour toute seule.

Windows SmartScreen peut afficher « Windows a protégé votre ordinateur », parce que l'application n'est pas signée : clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

## Mises à jour

Rien à faire : chaque changement poussé sur la branche `main` (par exemple par Claude) déclenche la construction d'une nouvelle version sur GitHub (1.0.1, 1.0.2…), publiée dans les Releases en quelques minutes. L'application installée la trouve au démarrage (puis toutes les 4 heures), la télécharge et propose de redémarrer pour l'installer. Tes plans et ton agencement sont conservés.

- Menu **Aide > Rechercher les mises à jour…** pour vérifier tout de suite.
- Un push sur une autre branche construit seulement des `.exe` de test (onglet **Actions**, artefact **Studio-3D-Windows**), sans les publier.
- La mise à jour automatique a besoin que le dépôt soit **public**.

## Modifier le studio depuis l'application

Tout se fait dans le panneau : déplacer les meubles à la souris (les réglages de l'objet sélectionné s'affichent en haut), les faire pivoter (touche R), changer les tailles, les couleurs et les lumières. L'agencement est enregistré automatiquement sur l'ordinateur.

Les plans se gèrent dans le menu **Fichier** :

- **Nouveau plan** (Ctrl+N) : repart de l'agencement d'origine ;
- **Ouvrir un plan…** (Ctrl+O) et **Ouvrir récent** ;
- **Enregistrer** (Ctrl+S) et **Enregistrer sous…** (Ctrl+Maj+S) : fichiers `.json`, par défaut dans `Documents\Studio 3D\Plans` ;
- **Plans enregistrés dans l'application** : les plans gardés avec l'ancienne liste « Mes plans ».

Dans un navigateur, la section « Mes plans » du panneau reste disponible.

### Plans sur GitHub

**Fichier > Plans sur GitHub…** (Ctrl+G), ou le bouton du même nom dans « Mes plans » du navigateur, enregistre et ouvre les plans dans un **dépôt GitHub privé** (dossier `plans`). On retrouve ainsi les mêmes plans sur tous ses PC.

À faire une seule fois :

1. Sur GitHub, crée un dépôt **privé**, par exemple `studio-3d-plans` (coche « Add a README »).
2. **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token** : « Only select repositories » → ce dépôt ; **Permissions > Repository > Contents : Read and write**.
3. Dans l'application, saisis le dépôt (`compte/studio-3d-plans`) et le jeton. À refaire sur chaque PC : dans l'application, le jeton est gardé chiffré par Windows.

## Modifier le code depuis l'application

Menu **Code** :

- **Modifier le code…** (Ctrl+E) : copie le code dans `Documents\Studio 3D\` et l'ouvre dans VS Code (ou dans le Bloc-notes). Dès que tu enregistres le fichier, l'application se recharge avec tes changements.
- **Ouvrir le dossier du code** : ouvre ce dossier dans l'explorateur.
- **Revenir à la version d'origine…** : met ta version de côté (renommée en `studio-3d.sauvegarde-<date>.html`) et revient au code livré avec l'application.
- **Outils de développement** (F12) : la console, pour voir les erreurs.

Tes plans et ton agencement sont conservés quand tu passes d'une version à l'autre.

## Développer sur l'ordinateur

Il faut [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
npm install
npm start        # lance l'application
npm run dist     # construit les .exe dans dist/ (à lancer sous Windows)
npm run icon     # régénère build/icon.png
```

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `studio-3d.html` | toute la scène 3D et l'interface |
| `vendor/` | three.js r128 en local, pour que l'application marche sans internet |
| `main.js` | la fenêtre Windows, le menu et le mode « modifier le code » |
| `package.json` | les dépendances et la configuration de construction (electron-builder) |
| `build/` | l'icône et son script de génération |
| `.github/workflows/windows.yml` | construit les `.exe` sur GitHub |
