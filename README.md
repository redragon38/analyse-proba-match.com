# SEO Control Studio

Application de bureau Electron / React / TypeScript pour centraliser les mesures SEO réelles et les audits locaux. Développement initial dans un dépôt vide. **Version 0.1 : les critères d’acceptation complets ne sont pas encore tous satisfaits.** Voir [PROGRESS.md](PROGRESS.md).

## Démarrage

Node.js 24 LTS, npm 11 et un système graphique sont nécessaires au développement. Windows 10/11 x64 est la cible de distribution ; son installation reste à vérifier sur ces deux systèmes.

```sh
npm ci
npm run dev
```

```sh
npm run verify
npm run test:e2e
npm run dist:win
```

`npm run dev` lance Vite et Electron ; ouvrir Vite dans un navigateur seul ne fournit pas les fonctionnalités desktop. Après compilation : `npm start`. Aucun serveur personnel n’est nécessaire à l’utilisation de l’application installée.

## Fonctionnement

Ajoutez un site dans Paramètres. Les propriétés Google restent facultatives : le crawler et les exports utilisent les données locales. Configurez Google selon [GOOGLE_SETUP.md](GOOGLE_SETUP.md), associez les propriétés au site, puis synchronisez. Aucune donnée d’exemple n’est chargée automatiquement, y compris pour proba-match.com. Aucun appel payant IA n’est envoyé sans action et consentement dans l’interface.

Les problèmes du crawler comportent une preuve, une source, une date, une recommandation et un état modifiable. Le bouton de génération de prompt fonctionne sans fournisseur IA. Les rapports exportent les données collectées, sans compléter les données indisponibles.

## Documentation

- [Installation](INSTALLATION.md)
- [Configuration Google](GOOGLE_SETUP.md)
- [Architecture et données](ARCHITECTURE.md)
- [Sécurité](SECURITY.md)
- [Limites des API et modules](API_LIMITATIONS.md)
- [Tests](TESTING.md)
- [Distribution Windows](BUILD_WINDOWS.md)
- [État réel du projet](PROGRESS.md)
