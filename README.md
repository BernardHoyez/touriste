# touriste

PWA : charger une trace GPX/KML, l'afficher sur une carte Leaflet (OSM, IGN Plan V2, IGN BD Ortho),
puis rédiger un prompt d'environ 500 mots pour inventorier les curiosités proches du sentier.

## Déploiement GitHub Pages
1. Créer le dépôt `touriste` et y copier le contenu de ce dossier (à la racine du dépôt).
2. Settings > Pages > Deploy from a branch > `main` / root.
3. URL : https://bernardhoyez.github.io/touriste/

## Mise à jour (brise-cache)
À chaque modification d'un fichier statique, incrémenter `CACHE_NAME` dans `sw.js`
(`touriste-cache-v1` -> `touriste-cache-v2`, etc.). Les anciens caches sont purgés à l'activation
et la page se recharge automatiquement sur la nouvelle version.
