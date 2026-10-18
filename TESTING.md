# Tests

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
```

Vitest exécute les fichiers `tests/**/*.test.ts`. Les fixtures et tokens factices sont exclusivement dans les tests. Les clients Google sont testés avec mocks : aucun compte Google réel n’est revendiqué validé par ces tests.

Le test Playwright démarre Electron, crée deux sites, navigue dans les 14 sections, ajoute un mot-clé, contrôle l’isolation et le refus d’un IPC inconnu puis ferme et redémarre l’application avec le même dossier utilisateur pour vérifier la persistance.

Sous Linux headless, utilisez un serveur X fourni par le système (Xvfb ou Xorg dummy). Dans cet environnement cloud, `bash scripts/cloud-display.sh` lance Xorg dummy sur :99 ; puis `DISPLAY=:99 npm run test:e2e`. Le script ne modifie aucun fichier système et n’altère pas la sandbox Electron. Aucun lien localhost de prévisualisation n’est nécessaire.

À faire avec les vrais accès : consentement/refus OAuth depuis le navigateur système, récupération de chaque propriété et comparaison des chiffres avec les interfaces Google, quota réel, PageSpeed public, Lighthouse public, fournisseur IA choisi et coût autorisé.

À faire sur Windows 10 et 11 x64 : installation/désinstallation, premier lancement, coffre Windows, reprise des tokens, exports ouverts dans les logiciels cibles, sauvegarde/restauration, démarrage automatique et contrôles réseau. Le résultat Linux ne remplace pas ces tests.
