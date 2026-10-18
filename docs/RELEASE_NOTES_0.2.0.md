# SEO Control Studio 0.2.0

## Bilan complet

Le bouton « Lancer tous les tests » exécute les analyses du site sélectionné : synchronisation Search Console et GA4, crawl, PageSpeed mobile/desktop, Lighthouse mobile/desktop si sélectionné, inspection de la page d’accueil et audience temps réel. Les concurrents configurés sont optionnels (10 maximum). L’IA payante et les imports manuels ne sont pas lancés automatiquement. Chaque étape conserve son état : réussi, partiel, échec, non exécuté ou annulé. Un échec n’empêche pas les suivantes. L’annulation arrête les étapes restantes et demande l’arrêt du crawl ; les autres appels déjà lancés peuvent terminer avant l’arrêt.

## Mises à jour du portable

Installez cette version une première fois en téléchargeant le nouveau portable. Les versions précédentes ne possèdent pas le mécanisme de mise à jour. Pour les suivantes : Paramètres → Chercher les mises à jour → Télécharger la mise à jour → Mettre à jour et redémarrer. Les préversions GitHub sont incluses.

L’original du portable est identifié par la variable standard d’electron-builder PORTABLE_EXECUTABLE_FILE. L’application télécharge exclusivement les assets du dépôt officiel via HTTPS, contrôle la taille, le format exécutable et SHA-256, puis lance un programme PowerShell local qui attend la fermeture, conserve un ancien .exe .previous-… et remplace le fichier. Les données SQLite et clés restent dans le dossier utilisateur. Le dossier du portable doit être accessible en écriture. La fonction ne s’applique pas aux lancements de développement ou à une installation NSIS.

Les exécutables sont non signés. SHA-256 contrôle l’intégrité du téléchargement, sans remplacer une signature d’éditeur. La sauvegarde de repli permet une récupération manuelle en cas d’échec ; une coupure système pendant le remplacement ne peut pas être déclarée sans risque.

## Statistiques et précision

- Search Console : même pagination pour les périodes courante/précédente, jusqu’à 25 000 lignes par tableau. Les totaux restent ceux des agrégats API, sans sommer les requêtes anonymisées manquantes.
- Jours Search Console calculés dans le fuseau du Pacifique, fin à J−3 en données finalisées.
- CTR comparé en points de pourcentage ; gains de position exprimés en positions moyennes, sans variation en pourcentage trompeuse. Lignes absentes et bases nulles restent indisponibles.
- GA4 : jusqu’à 10 000 lignes par tableau, rapports conservés indépendamment en cas de panne partielle ; nouveaux utilisateurs, utilisateurs totaux, sessions engagées, taux d’engagement et de rebond, événements clés, durées et vues par session.
- Performance : LCP, CLS, FCP, TBT et Speed Index de laboratoire ; INP terrain affiché uniquement lorsqu’il existe, avec distinction page/origine.
- Crawl : réponses HTTP, noindex, pages potentiellement indexables, redirections, titres/descriptions manquants, images sans alt et durée médiane de récupération HTML locale. Ce ne sont pas des confirmations d’indexation Google.
- Panneau de qualité : dates, fuseaux, couverture, seuils de confidentialité et limitations. Les chiffres absents ne sont pas remplacés par des données fictives.

Aucune garantie d’exactitude exhaustive ou de classement SEO : les APIs Google ont leurs propres limites, délais et quotas. Aucun compte ni aucune clé de l’utilisateur n’ont été utilisés pour la validation automatisée.

Validation : 73 tests unitaires/UI, TypeScript, compilation et 2 parcours Electron sous Linux réussis. Le programme de remplacement a été exécuté sur Windows : remplacement après fermeture du processus parent, sauvegarde de l’ancien exécutable et refus d’une empreinte incorrecte. Le workflow UI Windows général échoue encore sur un délai de clic ; une validation complète sur le poste utilisateur reste nécessaire.
