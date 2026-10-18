# Installation et utilisation

## Application Windows

Les exécutables sont générés dans `release/` par `npm run dist:win` :

- `SEO-Control-Studio-0.1.0-Setup.exe` : installateur NSIS, choix du dossier, désinstallation Windows.
- `SEO-Control-Studio-0.1.0-Portable.exe` : exécutable portable.

La présence de ces fichiers doit être confirmée dans PROGRESS.md. Un build n’est pas un test d’installation. Les distributions comprennent Electron et Node ; Node n’est pas requis sur le PC utilisateur. L’éditeur doit signer les exécutables avant une diffusion professionnelle. Sans certificat, SmartScreen peut signaler l’application inconnue.

Lancez l’application, ajoutez un site HTTPS et saisissez uniquement les propriétés que votre compte peut consulter. Vous pouvez ajouter proba-match.com manuellement ; il n’est pas présumé autorisé ou prérempli avec des statistiques.

## Développement

Node 24, npm 11, Git. `npm ci`, puis `npm run dev`. Chromium/Chrome est facultatif pour les modules Google, requis pour Lighthouse local. `CHROME_PATH` peut désigner son exécutable. Le code ne désactive pas sa sandbox.

## Données et sauvegardes

Les données se trouvent dans le dossier `app.getPath('userData')` Electron, généralement `%APPDATA%/SEO Control Studio` ou `%APPDATA%/seo-control-studio` sous Windows selon le packaging. `studio.sqlite` contient les mesures. `vault/` contient les secrets chiffrés par safeStorage. Le dossier d’installation ne contient pas les données utilisateur.

Paramètres → Créer une sauvegarde produit une sauvegarde SQLite cohérente. La restauration requiert une confirmation et remplace les données de la base. Les secrets sont exclus : reconnectez Google et renseignez vos clés sur une autre machine. Traitez les sauvegardes et rapports comme confidentiels.

## Dépannage

- Navigateur seul : lancez Electron, pas uniquement Vite.
- Coffre indisponible : configurez le trousseau système. Sous Linux, `basic_text` est refusé ; aucune solution de repli en clair n’est utilisée.
- Erreur Google 403 : API activées, permissions des propriétés et consentement à vérifier.
- Quota 429 : attendre ; les API disposent de deux nouvelles tentatives pour les erreurs transitoires.
- Réseau cloud : les domaines à analyser et les API doivent être autorisés dans les paramètres d’environnement. La résolution DNS et les sockets sortants peuvent rester indisponibles même avec une autorisation HTTPS par proxy.
- Lighthouse : installez un Chrome récent compatible, indiquez CHROME_PATH si nécessaire. Ne contournez pas une erreur de certificat ou de sandbox.
