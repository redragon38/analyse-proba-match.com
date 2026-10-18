# Sécurité

Le renderer utilise `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`. Les nouvelles fenêtres et navigations sont bloquées. La CSP interdit les scripts tiers, objets et frames. Seule l’origine Vite locale est utilisée en développement ; la version packagée charge des fichiers locaux.

Chaque action IPC est validée par Zod et son appelant doit être la frame principale de la fenêtre de l’application. Aucun token ou module Node n’est renvoyé au renderer. Les erreurs ne journalisent pas les réponses contenant des secrets.

Le coffre utilise exclusivement safeStorage avec un véritable backend système. Le mode Linux `basic_text` et l’absence de chiffrement bloquent le stockage des secrets ; aucune clé n’est écrite en clair. L’API reste accessible sans IA ni Google.

Le crawler accepte uniquement HTTP/HTTPS sans identifiants ni ports non standards, bloque les adresses privées, locales et réservées, vérifie toutes les adresses DNS et épingle l’adresse de connexion. Les redirections du crawl restent dans l’origine autorisée. Il limite la taille des réponses et les délais et respecte robots.txt. Un crawl échoue par précaution si robots.txt rencontre une erreur serveur.

Lighthouse utilise une passerelle locale qui vérifie les destinations des requêtes HTTP et tunnels HTTPS. La sandbox Chromium n’est pas désactivée. Cette protection doit encore subir un audit et des tests d’évasion réseau avant une diffusion en production.

Les contenus collectés sont des données non fiables. Les exports HTML échappent le texte et appliquent une CSP sans scripts. Les cellules CSV neutralisent les préfixes de formules. Les sorties IA ne sont jamais exécutées, n’ont aucun outil et s’affichent comme texte. L’utilisateur autorise chaque envoi de contexte ; 20 000 caractères de données maximum et 4 000 caractères de question sont envoyés.

Les sauvegardes et rapports ne sont pas chiffrés : l’utilisateur choisit leur emplacement via les dialogues natifs. Les rapports peuvent contenir les données confidentielles de ses sites.

`npm audit --omit=dev` est le contrôle des dépendances distribuées. Les avertissements de développement et résultats datés sont conservés dans PROGRESS.md. Un audit npm ne prouve pas l’absence de vulnérabilité applicative. La signature numérique et la validation Windows restent nécessaires.
