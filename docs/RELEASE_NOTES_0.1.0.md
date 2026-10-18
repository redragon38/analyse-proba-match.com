Première préversion de SEO Control Studio pour Windows x64.

## Télécharger et lancer

Téléchargez `SEO-Control-Studio-0.1.0-Portable.exe` dans les fichiers joints à cette Release, puis ouvrez-le sous Windows. Node.js n’est pas nécessaire sur le PC utilisateur. `SHA256SUMS.txt` permet de vérifier le téléchargement.

## État de validation

- Build de production réussi ; intégrité de l’archive de l’exécutable vérifiée.
- 38 tests unitaires et d’intégration, et 2 parcours Electron réussis sous Linux.
- Exécutable non signé ; démarrage et compatibilité Windows 10/11 non vérifiés.
- Il s’agit du portable, pas d’un installateur : la génération de l’installateur NSIS reste bloquée sous Wine.
- Les intégrations Google, PageSpeed, Lighthouse et IA nécessitent une configuration et une validation avec des accès réels.
- Le cahier des charges complet n’est pas terminé. Consultez PROGRESS.md et API_LIMITATIONS.md dans le dépôt pour le périmètre exact et les fonctions restantes.

Aucune donnée SEO simulée n’est présentée comme une donnée réelle.
