# Configuration Google

## Préparer votre projet

1. Dans https://console.cloud.google.com/, créez ou sélectionnez votre propre projet.
2. Activez Google Search Console API, Google Analytics Data API et Google Analytics Admin API. Pour PageSpeed, activez PageSpeed Insights API si vous utilisez une clé.
3. Configurez l’écran de consentement OAuth et ajoutez votre compte comme utilisateur test si l’application reste en test. Une publication à d’autres utilisateurs peut nécessiter une validation Google des scopes.
4. Créez un identifiant OAuth de type **Application de bureau**, puis téléchargez son fichier JSON. Dans Paramètres → Connexion Google, cliquez sur **Importer le JSON OAuth Desktop** et sélectionnez ce fichier sur votre PC. Le JSON doit contenir une section `installed` ; les configurations Web et les comptes de service sont refusés. L’identifiant public est renseigné automatiquement. Si le JSON fournit un `client_secret`, il reste chiffré dans le coffre système et est utilisé uniquement par le processus principal pour l’échange et le renouvellement des jetons. Aucun mot de passe Google n’est demandé dans l’application. Aucun secret OAuth n’est inclus dans le code ou l’installateur.
5. Cliquez sur Enregistrer et connecter. Le navigateur système reçoit l’écran Google ; le callback utilise `http://127.0.0.1:<port>/callback`, un état aléatoire et PKCE SHA-256. La fenêtre expire après trois minutes.
6. Listez les propriétés. Le résultat conserve séparément les éventuelles erreurs Search Console et Analytics Admin. Recopiez le `siteUrl` exact (`https://.../` ou `sc-domain:...`) et l’identifiant numérique GA4 dans la configuration du site.
7. Synchronisez et vérifiez les sources et dates. Les scopes sont `webmasters.readonly` et `analytics.readonly`. Les tokens restent dans le processus principal et sont chiffrés avec safeStorage.

## Accès et validation

Le compte doit disposer d’un accès réel aux propriétés. Un domaine configuré dans l’application ne prouve aucune permission Google. En mode consentement externe de test, les refresh tokens peuvent expirer selon les règles Google. Reconnectez le compte si nécessaire.

Le code conserve PKCE et accepte la configuration Desktop complète importée localement. Un client Desktop reste un client public : son client_secret ne constitue pas une garantie de confidentialité d’un client serveur, mais Google peut le demander selon la configuration. Aucun identifiant propre à un utilisateur n’est intégré au code ou à la distribution. **La compatibilité exacte de l’échange de tokens avec votre configuration de client Google n’a pas été vérifiée ici.** N’ajoutez pas de secret confidentiel à l’installateur pour masquer une erreur : examinez la réponse et la documentation native-app actuelle de Google.

La déconnexion tente une révocation distante et efface la session locale. Si la révocation échoue, supprimez aussi l’accès dans les paramètres de sécurité du compte Google.

## PageSpeed et IA

La clé PageSpeed est facultative au niveau du client mais des quotas peuvent la rendre nécessaire. Dans Paramètres, enregistrez-la dans le coffre. Ne la publiez pas dans Git.

Pour l’IA, choisissez une URL HTTPS compatible Chat Completions, un modèle autorisé et une clé personnelle. L’envoi nécessite de cocher le consentement puis de cliquer Analyser. Il peut occasionner des frais auprès du fournisseur ; aucun appel IA n’a été effectué durant le développement.

## Erreur HTTP 400 après le consentement

La version 0.1.0 masquait le détail d’un rejet du point de terminaison de jetons derrière « Le service a répondu HTTP 400 ». La version 0.1.1 distingue les erreurs OAuth sans afficher le corps brut, les codes d’autorisation ou les secrets. Si Google indique un client_secret manquant, importez le JSON Desktop téléchargé dans le même projet puis reconnectez-vous. Pour invalid_grant, relancez une connexion neuve. Pour invalid_client ou redirect_uri_mismatch, vérifiez le type Application de bureau et la cohérence du client importé. Ne changez pas les URLs de redirection au hasard et ne transmettez pas le JSON dans un ticket ou dans le chat.

Documentation de référence : https://developers.google.com/identity/protocols/oauth2/native-app (rubriques PKCE, échange et renouvellement des jetons).
