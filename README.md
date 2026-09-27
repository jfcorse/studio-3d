# Studio 3D

Studio de 3,73 × 4,04 m en 3D : mobilier déplaçable, dimensions, couleurs, lumières et plans enregistrés.

Le projet tient dans un seul fichier, `studio-3d.html`. On peut l'ouvrir directement dans un navigateur, ou l'utiliser comme application Windows.

## Récupérer l'application Windows

À chaque push, GitHub construit l'application (onglet **Actions** > workflow **Application Windows** > dernière exécution > artefact **Studio-3D-Windows**). Le zip contient :

- `Studio-3D-Setup-x.y.z.exe` : un installateur (installation dans ton compte, sans droits administrateur) ;
- `Studio-3D-portable-x.y.z.exe` : un seul fichier à lancer, sans installation.

Si tu pousses un tag `v1.0.0` (par exemple), les deux fichiers sont aussi publiés dans une **Release** GitHub.

Windows SmartScreen peut afficher « Windows a protégé votre ordinateur », parce que l'application n'est pas signée : clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

## Modifier le studio depuis l'application

Tout se fait dans le panneau : déplacer les meubles à la souris, les faire pivoter (touche R), changer les tailles et les couleurs, enregistrer des plans et les exporter en fichier `.json`. Tout est enregistré automatiquement sur l'ordinateur.

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
