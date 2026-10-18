# Distribution Windows

## Construire sur Windows

Node 24 et npm 11 sont nécessaires à la compilation, pas à l’utilisation de l’exécutable. Dans PowerShell à la racine :

```powershell
npm ci
npm run verify
npm run test:e2e
npm run dist:win
```

Sorties configurées : `release/SEO-Control-Studio-0.1.0-Setup.exe` et `release/SEO-Control-Studio-0.1.0-Portable.exe`. L’icône est dans `assets/icon.ico`. Le nom d’éditeur est configurable dans `package.json` (`author` et options Windows de signature).

NSIS permet de choisir le dossier et crée une désinstallation. Les données utilisateur sont conservées à la désinstallation (`deleteAppDataOnUninstall: false`). La version portable utilise aussi le dossier utilisateur Electron : elle n’est pas un mode de stockage sur clé USB.

## Signature

Aucun certificat n’est fourni. Ne qualifiez pas les artefacts de signés. Configurez les secrets de signature supportés par electron-builder dans votre CI sécurisée, sans les committer. Les avertissements SmartScreen sont possibles pour les exécutables non signés et les nouveaux éditeurs.

## Compilation croisée

La génération Linux nécessite l’accès aux releases officielles Electron et aux outils electron-builder ; certains outils et versions peuvent nécessiter Wine. Les caches doivent être accessibles en écriture. Voir PROGRESS.md pour le résultat réel de la tentative courante. Ne désactivez ni la vérification TLS, ni les checksums, ni la sandbox pour contourner un échec.

Le workflow `.github/workflows/windows.yml` compile et teste sur un runner Windows x64 et conserve les artefacts ; sa présence ne signifie pas qu’il a déjà été exécuté. La validation d’installation sur Windows 10 et 11 reste manuelle.
