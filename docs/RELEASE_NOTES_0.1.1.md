# SEO Control Studio 0.1.1 — Connexion Google

Cette version corrige le diagnostic générique « HTTP 400 » après consentement Google et permet d’importer le JSON d’un client OAuth « Application de bureau ».

## Mise à jour

1. Fermez l’ancienne version et ouvrez le nouveau portable. Les données locales sont conservées.
2. Dans Google Cloud → Google Auth Platform → Clients, choisissez votre client « Application de bureau » et téléchargez son JSON.
3. Dans l’application → Paramètres → Connexion Google → Importer le JSON OAuth Desktop, sélectionnez ce fichier. Il reste sur votre ordinateur et son contenu est chiffré dans le coffre système.
4. Cliquez sur Enregistrer et connecter puis autorisez votre compte dans le navigateur.

Le client_secret Desktop, lorsqu’il est fourni, est utilisé pour l’échange du code et le renouvellement des jetons, uniquement pour l’identifiant associé. Aucun secret n’est inclus dans le dépôt, le renderer ou l’exécutable. PKCE, state aléatoire et redirection loopback sont conservés. Les erreurs OAuth sont expliquées sans recopier des réponses contenant potentiellement des données sensibles.

La cause exacte du HTTP 400 rencontré avec le compte utilisateur n’a pas été vérifiée sans ses accès. Cette version corrige les limites du client et le diagnostic ; elle ne constitue pas une validation de la configuration Google du compte.

Tests de régression : import Desktop, refus des JSON Web, secret manquant, erreurs Google, liaison client/secret, renouvellement, vrai callback loopback avec Google simulé, PKCE, rejet de state invalide et échec d’ouverture du navigateur.

Exécutable portable Windows x64, non signé. Téléchargez le .exe dans les fichiers joints ; son empreinte est fournie dans SHA256SUMS.txt. Aucun installateur NSIS n’est revendiqué. Le périmètre incomplet de la version initiale reste décrit dans API_LIMITATIONS.md.
