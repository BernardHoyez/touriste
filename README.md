# Touriste — PWA

Application statique pour GitHub Pages : importe une trace GPX/KML, l'affiche avec Leaflet sur OSM, IGN Plan V2 ou IGN BD Ortho, puis génère un prompt de recherche documentaire à copier dans une IA.

## Déploiement GitHub Pages
1. Décompresser l'archive.
2. Déposer `index.html`, `style.css`, `app.js`, `manifest.json` et `brise-caches.js` dans le dossier publié du dépôt GitHub Pages.
3. Dans **Settings → Pages**, choisir la branche et le dossier qui contiennent `index.html`.
4. Ouvrir l'URL HTTPS de la page. Le service worker et le presse-papiers nécessitent un contexte sécurisé (HTTPS ou localhost).

## Remarques
- L'application lit les fichiers localement dans le navigateur ; elle ne les téléverse pas.
- Le fond cartographique et les bibliothèques Leaflet sont chargés depuis des services externes, donc une connexion Internet est nécessaire pour la carte.
- Le service worker `brise-caches.js` met en cache les fichiers de l'application, mais pas les tuiles cartographiques. Après une mise à jour, le nom de cache est versionné (`touriste-static-v1`) ; l'incrémenter dans `brise-caches.js` pour forcer une nouvelle version.
- La distance est calculée à partir des coordonnées horizontales. Les données d'altitude/dénivelé sont ignorées.
- L'IGN peut modifier les services cartographiques ; si un fond ne s'affiche plus, vérifier l'URL et les conditions d'utilisation de Géoplateforme.
