# Configuration Google

## Préparer votre projet

1. Dans https://console.cloud.google.com/, créez ou sélectionnez votre propre projet.
2. Activez Google Search Console API, Google Analytics Data API et Google Analytics Admin API. Pour PageSpeed, activez PageSpeed Insights API si vous utilisez une clé.
3. Configurez l’écran de consentement OAuth et ajoutez votre compte comme utilisateur test si l’application reste en test. Une publication à d’autres utilisateurs peut nécessiter une validation Google des scopes.
4. Créez un identifiant OAuth de type **Application de bureau**. Copiez son identifiant public se terminant par `.apps.googleusercontent.com` dans Paramètres. Aucun mot de passe Google n’est demandé dans l’application. Aucun secret OAuth n’est inclus dans le code ou l’installateur.
5. Cliquez sur Enregistrer et connecter. Le navigateur système reçoit l’écran Google ; le callback utilise `http://127.0.0.1:<port>/callback`, un état aléatoire et PKCE SHA-256. La fenêtre expire après trois minutes.
6. Listez les propriétés. Le résultat conserve séparément les éventuelles erreurs Search Console et Analytics Admin. Recopiez le `siteUrl` exact (`https://.../` ou `sc-domain:...`) et l’identifiant numérique GA4 dans la configuration du site.
7. Synchronisez et vérifiez les sources et dates. Les scopes sont `webmasters.readonly` et `analytics.readonly`. Les tokens restent dans le processus principal et sont chiffrés avec safeStorage.

## Accès et validation

Le compte doit disposer d’un accès réel aux propriétés. Un domaine configuré dans l’application ne prouve aucune permission Google. En mode consentement externe de test, les refresh tokens peuvent expirer selon les règles Google. Reconnectez le compte si nécessaire.

Le code implémente le flux public PKCE sans secret confidentiel. **La compatibilité exacte de l’échange de tokens avec votre configuration de client Google n’a pas été vérifiée ici.** N’ajoutez pas de secret confidentiel à l’installateur pour masquer une erreur : examinez la réponse et la documentation native-app actuelle de Google.

La déconnexion tente une révocation distante et efface la session locale. Si la révocation échoue, supprimez aussi l’accès dans les paramètres de sécurité du compte Google.

## PageSpeed et IA

La clé PageSpeed est facultative au niveau du client mais des quotas peuvent la rendre nécessaire. Dans Paramètres, enregistrez-la dans le coffre. Ne la publiez pas dans Git.

Pour l’IA, choisissez une URL HTTPS compatible Chat Completions, un modèle autorisé et une clé personnelle. L’envoi nécessite de cocher le consentement puis de cliquer Analyser. Il peut occasionner des frais auprès du fournisseur ; aucun appel IA n’a été effectué durant le développement.
