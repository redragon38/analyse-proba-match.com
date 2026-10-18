# SEO Control Studio 0.1.2 — Correction du crawler

Correction de l’erreur « Invalid IP address: undefined » au lancement d’un crawl.

## Cause et correction

Les versions récentes de Node demandent un tableau d’adresses au callback DNS lorsque l’option all:true est active pour la sélection automatique IPv4/IPv6. Le callback personnalisé renvoyait une adresse scalaire dans tous les cas. Un test HTTP avec un véritable serveur local a reproduit exactement l’erreur de la capture, puis réussi après correction.

Un adaptateur commun respecte maintenant les deux formats, pour le crawler, les requêtes JSON publiques et le proxy HTTP de Lighthouse. L’adresse est toujours épinglée après validation : aucune désactivation du contrôle SSRF, aucun accès nouveau aux adresses privées, aucune désactivation de la sélection IPv4/IPv6 ni des vérifications TLS.

## Mise à jour

1. Fermez l’application 0.1.1.
2. Téléchargez et lancez SEO-Control-Studio-0.1.2-Portable.exe dans les fichiers de cette Release.
3. Sélectionnez votre site, ouvrez Audit SEO et cliquez sur Lancer le crawl.

Les sites et la configuration Google restent dans le dossier utilisateur ; ne supprimez pas ce dossier. Aucune nouvelle clé API ou propriété Search Console n’est nécessaire pour corriger cette erreur.

Exécutable portable Windows x64 non signé. Tests de régression sur une vraie connexion HTTP Node et sur les contrats DNS IPv4/IPv6 ; la réalisation d’un audit complet du site utilisateur sur son PC reste à vérifier. Les autres limites de la version initiale figurent dans API_LIMITATIONS.md.
