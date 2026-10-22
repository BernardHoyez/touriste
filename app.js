(() => {
'use strict';
const $ = id => document.getElementById(id);
let map, trackLayer, currentBounds, trackPoints = [], trackName = '';
const layers = {
  osm: () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}),
  ign: () => L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',{maxZoom:19,attribution:'© IGN — Géoplateforme'}),
  ortho: () => L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',{maxZoom:19,attribution:'© IGN — Géoplateforme'})
};
let activeBase;
function initMap(){
  map=L.map('map',{zoomControl:true});
  activeBase=layers.osm(); activeBase.addTo(map);
  map.setView([46.7,2.4],6);
}
function switchBase(){if(!map)return; if(activeBase)map.removeLayer(activeBase);activeBase=layers[$('baseLayer').value]();activeBase.addTo(map);}
function parseGPX(xml){
  const points=[...xml.getElementsByTagNameNS('*','trkpt'),...xml.getElementsByTagNameNS('*','rtept')];
  let out=points.map(p=>[Number(p.getAttribute('lat')),Number(p.getAttribute('lon'))]).filter(p=>p.every(Number.isFinite));
  if(!out.length){const segs=[...xml.getElementsByTagNameNS('*','trkseg')]; for(const seg of segs) out.push(...[...seg.getElementsByTagNameNS('*','trkpt')].map(p=>[+p.getAttribute('lat'),+p.getAttribute('lon')]).filter(p=>p.every(Number.isFinite)));}
  return out;
}
function parseKML(xml){
  const out=[];
  for(const node of [...xml.getElementsByTagNameNS('*','LineString'),...xml.getElementsByTagNameNS('*','Track')]){
    const coord=node.getElementsByTagNameNS('*','coordinates')[0];
    if(coord){coord.textContent.trim().split(/\s+/).forEach(s=>{const a=s.split(',');if(a.length>=2){const lon=+a[0],lat=+a[1];if(Number.isFinite(lat)&&Number.isFinite(lon))out.push([lat,lon]);}});}
    const whens=[...node.getElementsByTagNameNS('*','coord')];
    whens.forEach(c=>{const a=c.textContent.trim().split(/\s+/).map(Number);if(a.length>=2&&a.slice(0,2).every(Number.isFinite))out.push([a[1],a[0]]);});
  }
  return out;
}
function haversine(a,b){const r=Math.PI/180, dLat=(b[0]-a[0])*r,dLon=(b[1]-a[1])*r;const x=Math.sin(dLat/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function distance(points){let d=0;for(let i=1;i<points.length;i++)d+=haversine(points[i-1],points[i]);return d;}
function loadTrack(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const xml=new DOMParser().parseFromString(reader.result,'application/xml');
      if(xml.querySelector('parsererror'))throw Error('Le fichier XML est invalide.');
      const ext=file.name.toLowerCase().split('.').pop();
      trackPoints=ext==='gpx'?parseGPX(xml):ext==='kml'?parseKML(xml):[];
      if(trackPoints.length<2)throw Error('Aucun tracé linéaire exploitable trouvé. Choisissez un GPX ou un KML contenant une trace/route.');
      trackName=file.name;
      if(trackLayer)map.removeLayer(trackLayer);
      trackLayer=L.polyline(trackPoints,{color:'#d34b32',weight:5,opacity:.9}).addTo(map);
      L.circleMarker(trackPoints[0],{radius:6,color:'#176b45',fillOpacity:1}).addTo(trackLayer);
      L.circleMarker(trackPoints[trackPoints.length-1],{radius:6,color:'#532b80',fillOpacity:1}).addTo(trackLayer);
      currentBounds=trackLayer.getBounds();map.fitBounds(currentBounds.pad(.08),{maxZoom:16});
      const km=distance(trackPoints)/1000;
      $('fileInfo').textContent='Fichier chargé : '+file.name;
      $('stats').textContent=`Distance calculée : ${km.toFixed(2)} km · ${trackPoints.length.toLocaleString('fr-FR')} points · altitudes ignorées`;
      $('generate').disabled=false;
      $('copy').disabled=false;$('download').disabled=false;
      $('copyStatus').textContent='';
    }catch(e){trackPoints=[];$('fileInfo').textContent=e.message;$('generate').disabled=true;$('copy').disabled=true;$('download').disabled=true;}
  };
  reader.readAsText(file);
}
function rounded(n,d=5){return Number(n.toFixed(d));}
function makePrompt(){
  if(trackPoints.length<2){$('copyStatus').textContent='Importez d’abord une trace valide.';return;}
  const radius=$('radius').value, audience=$('audience').value;
  const lats=trackPoints.map(p=>p[0]),lons=trackPoints.map(p=>p[1]);
  const bounds=`latitude ${Math.min(...lats).toFixed(5)} à ${Math.max(...lats).toFixed(5)} ; longitude ${Math.min(...lons).toFixed(5)} à ${Math.max(...lons).toFixed(5)}`;
  const samples=[];
  const count=Math.min(24,trackPoints.length);
  for(let i=0;i<count;i++){const p=trackPoints[Math.round(i*(trackPoints.length-1)/Math.max(1,count-1))];samples.push(`${rounded(p[0])}, ${rounded(p[1])}`);}
  const extra=$('notes').value.trim();
  const prompt=`RÔLE ET OBJECTIF
Agis comme un documentaliste spécialisé en patrimoine, géographie, histoire locale, écologie et tourisme culturel. Produis un inventaire précis, structuré et sourcé des curiosités situées sur le parcours ou à proximité immédiate de cette randonnée, pour un lectorat : ${audience}.

TRACE ET PÉRIMÈTRE
Fichier de référence : ${trackName}. Trace linéaire de ${distance(trackPoints)/1000>=0?(distance(trackPoints)/1000).toFixed(2):'—'} km calculés à partir des coordonnées horizontales. Rayon de recherche autour du tracé : ${radius} mètres. Emprise géographique approximative : ${bounds}. Points représentatifs de la trace (latitude, longitude ; échantillonnage, non exhaustif) : ${samples.join(' ; ')}.
IMPORTANT : ne tiens aucun compte du dénivelé ni des altitudes du fichier, qui peuvent être inexacts. Ne déduis pas la difficulté ou la visibilité à partir de ces données. Les points fournis ne remplacent pas l'analyse de la totalité du tracé : recherche aussi les lieux entre ces points. ${extra?'Contexte ou préférences supplémentaires : '+extra:''}

RECHERCHES À EFFECTUER
1. Patrimoine historique, bâti et architectural discret : vestiges, ruines, chapelles, croix, calvaires, ponts anciens, gués, murs et murets de pierre sèche, anciennes limites parcellaires, moulins, lavoirs, fontaines, sources aménagées, fermes anciennes, bâtiments agricoles, architecture vernaculaire, ouvrages hydrauliques, sites archéologiques et traces d'activités disparues. Pour chaque élément, résume l'histoire en une ou deux phrases et indique s'il est sur le sentier, visible depuis celui-ci ou seulement proche.
2. Nature et géologie : flore et habitats caractéristiques, espèces animales locales pertinentes, arbres remarquables, haies, mares, zones humides, cours d'eau, sources, affleurements, formations rocheuses, grottes, falaises, crêtes et formes du relief. Distingue les observations vérifiables des espèces seulement possibles ; n'affirme pas qu'une espèce rare est présente sans preuve.
3. Paysages et toponymie : panoramas précisément localisés et réellement visibles depuis le tracé (direction ou repère, si la source le permet), éléments qui composent la vue, ainsi que l'origine et la signification documentées des noms de lieux-dits traversés ou proches. Signale explicitement toute visibilité incertaine.
4. Contexte : explique brièvement l'intérêt culturel, écologique ou géologique des sites retenus, sans digressions éloignées de l'itinéraire.

MÉTHODE, SOURCES ET PRÉSENTATION
- Recherche dans des sources identifiables : Inventaire général du patrimoine culturel, bases Mérimée/Palissy, POP, Atlas des patrimoines, archives et sites des collectivités, bases naturalistes officielles, INPN, Conservatoires d'espaces naturels, BRGM/InfoTerre, IGN, cartes anciennes, publications scientifiques et associations locales reconnues. Utilise aussi les sources locales fiables pertinentes.
- Pour chaque curiosité, donne un nom, une catégorie, sa localisation, sa distance approximative au tracé, le rapport au sentier (traversé/frôlé/visible/proche), une description ou histoire concise et au moins une source précise avec URL directe consultable. Ajoute si possible l'auteur ou l'organisme et la date de publication/consultation.
- Vérifie les noms, coordonnées et distances en croisant les sources lorsque c'est possible. Ne crée aucun site, fait historique, citation, espèce, panorama ni URL. Si une donnée est incertaine ou non trouvée, écris-le explicitement.
- Écarte les attractions éloignées sans rapport avec le parcours. Priorise les curiosités dans le rayon indiqué et explique tout dépassement.
- N'invente pas une orientation de panorama ou une visibilité que les sources ne permettent pas de confirmer. Distingue les panoramas potentiels des vues attestées.
- Organise le résultat en tableau ou fiches numérotées, puis fournis une courte synthèse des points d'intérêt majeurs et une bibliographie/liens classés par type de source. Évite les doublons.
- Termine par une section « Limites de l'inventaire » indiquant les secteurs insuffisamment documentés et les vérifications de terrain utiles.

N'inclus pas de dénivelé. N'écris pas de généralités touristiques non sourcées à la place d'un inventaire localisé. La priorité est la précision géographique, la traçabilité des sources et la distinction entre faits établis et hypothèses.`;
  $('prompt').value=prompt;
  $('copyStatus').textContent='Prompt rédigé. Relisez-le, puis copiez-le dans l’IA de votre choix.';
}
async function copyPrompt(){
  const text=$('prompt').value;
  if(!text.trim())return;
  try{await navigator.clipboard.writeText(text);$('copyStatus').textContent='Prompt copié dans le presse-papiers.';}
  catch(e){$('prompt').focus();$('prompt').select();const ok=document.execCommand('copy');$('copyStatus').textContent=ok?'Prompt copié dans le presse-papiers.':'Copie automatique impossible : sélectionnez le texte et copiez-le manuellement.';}
}
function downloadPrompt(){
  const blob=new Blob([$('prompt').value],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='prompt-touriste.txt';a.click();URL.revokeObjectURL(url);
}
initMap();
$('trackFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)loadTrack(f);});
$('baseLayer').addEventListener('change',switchBase);
$('generate').addEventListener('click',makePrompt);
$('copy').addEventListener('click',copyPrompt);
$('download').addEventListener('click',downloadPrompt);
$('generate').disabled=true;$('copy').disabled=true;$('download').disabled=true;
if('serviceWorker' in navigator && location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./brise-caches.js').catch(err=>console.warn('Service worker non enregistré',err)));
})();