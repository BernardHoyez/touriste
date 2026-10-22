// Initialize Lucide icons
lucide.createIcons();

// Global Variables
let map = null;
let currentTrackGeoJSON = null;
let bufferLayer = null;
let trackLayer = null;

// DOM Elements
const fileInput = document.getElementById('fileInput');
const bufferRange = document.getElementById('bufferRange');
const bufferValue = document.getElementById('bufferValue');
const promptOutput = document.getElementById('promptOutput');
const copyBtn = document.getElementById('copyBtn');
const copyBtnText = document.getElementById('copyBtnText');
const wordCountDisplay = document.getElementById('wordCount');

// Stats Elements
const statDistance = document.getElementById('statDistance');
const statArea = document.getElementById('statArea');
const coordBounds = document.getElementById('coordBounds');
const fileInfo = document.getElementById('fileInfo');
const fileNameDisplay = document.getElementById('fileName');
const fileTypeDisplay = document.getElementById('fileType');

// Initialize Leaflet Map
function initMap() {
    map = L.map('map').setView([46.603354, 1.888334], 6); // France center

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    fileInput.addEventListener('change', handleFileSelect);
    bufferRange.addEventListener('input', (e) => {
        const val = e.target.value;
        bufferValue.textContent = `${val} m`;
        if (currentTrackGeoJSON) {
            updateSpatialAnalysis();
        }
    });

    copyBtn.addEventListener('click', handleCopyPrompt);
});

// File Import Handler
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const ext = fileName.split('.').pop().toLowerCase();

    fileNameDisplay.textContent = fileName;
    fileTypeDisplay.textContent = ext;
    fileInfo.classList.remove('hidden');

    const reader = new FileReader();

    reader.onload = function (event) {
        const content = event.target.result;
        let geojson = null;

        try {
            if (ext === 'gpx') {
                geojson = parseGPX(content);
            } else if (ext === 'kml') {
                geojson = parseKML(content);
            } else {
                alert('Format de fichier non supporté. Choisissez du GPX ou du KML.');
                return;
            }

            if (geojson && geojson.features.length > 0) {
                currentTrackGeoJSON = geojson;
                updateSpatialAnalysis();
            } else {
                alert('Aucune trace ou coordonnées trouvées dans le fichier.');
            }
        } catch (err) {
            console.error(err);
            alert('Erreur lors de la lecture du fichier : ' + err.message);
        }
    };

    reader.readAsText(file);
}

// Simple GPX Parser to GeoJSON (Ignores Elevation)
function parseGPX(gpxText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
    const trkpts = xmlDoc.getElementsByTagName('trkpt');

    const coordinates = [];

    for (let i = 0; i < trkpts.length; i++) {
        const pt = trkpts[i];
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));

        if (!isNaN(lat) && !isNaN(lon)) {
            coordinates.push([lon, lat]);
        }
    }

    if (coordinates.length === 0) return null;

    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            },
            properties: {}
        }]
    };
}

// Simple KML Parser to GeoJSON (Ignores Elevation)
function parseKML(kmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
    const coordNodes = xmlDoc.getElementsByTagName('coordinates');

    let coordinates = [];

    for (let i = 0; i < coordNodes.length; i++) {
        const text = coordNodes[i].textContent.trim();
        const tuples = text.split(/\s+/);

        tuples.forEach(tuple => {
            const parts = tuple.split(',');
            if (parts.length >= 2) {
                const lon = parseFloat(parts[0]);
                const lat = parseFloat(parts[1]);

                if (!isNaN(lat) && !isNaN(lon)) {
                    coordinates.push([lon, lat]);
                }
            }
        });
    }

    if (coordinates.length === 0) return null;

    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            },
            properties: {}
        }]
    };
}

// Core Spatial Processing with Turf.js
function updateSpatialAnalysis() {
    if (!currentTrackGeoJSON) return;

    const lineFeature = currentTrackGeoJSON.features[0];
    const bufferDistanceMeters = parseFloat(bufferRange.value);

    // 1. Calculate Buffer Polygon using Turf.js
    let bufferedPolygon = null;
    if (bufferDistanceMeters > 0) {
        const bufferDistanceKm = bufferDistanceMeters / 1000;
        bufferedPolygon = turf.buffer(lineFeature, bufferDistanceKm, { units: 'kilometers' });
    } else {
        bufferedPolygon = lineFeature;
    }

    // 2. Clear old layers
    if (trackLayer) map.removeLayer(trackLayer);
    if (bufferLayer) map.removeLayer(bufferLayer);

    // 3. Render Buffer Polygon
    if (bufferDistanceMeters > 0) {
        bufferLayer = L.geoJSON(bufferedPolygon, {
            style: {
                color: '#2563eb',
                weight: 2,
                fillColor: '#3b82f6',
                fillOpacity: 0.2,
                dashArray: '4'
            }
        }).addTo(map);
    }

    // 4. Render Original Track Line
    trackLayer = L.geoJSON(lineFeature, {
        style: {
            color: '#dc2626',
            weight: 4,
            opacity: 0.9
        }
    }).addTo(map);

    // Zoom to fit bounds
    const boundsGroup = L.featureGroup([
        trackLayer,
        ...(bufferLayer ? [bufferLayer] : [])
    ]);
    map.fitBounds(boundsGroup.getBounds(), { padding: [30, 30] });

    // 5. Calculate Metrics
    const distanceKm = turf.length(lineFeature, { units: 'kilometers' });
    statDistance.textContent = `${distanceKm.toFixed(2)} km`;

    let areaKm2 = 0;
    if (bufferDistanceMeters > 0 && bufferedPolygon) {
        areaKm2 = turf.area(bufferedPolygon) / 1000000; // m² to km²
        statArea.textContent = `${areaKm2.toFixed(2)} km²`;
    } else {
        statArea.textContent = `0 km²`;
    }

    // Calculate Bounding Box
    const bbox = turf.bbox(bufferedPolygon || lineFeature);
    const bboxStr = `[${bbox[1].toFixed(4)}, ${bbox[0].toFixed(4)}] à [${bbox[3].toFixed(4)}, ${bbox[2].toFixed(4)}]`;
    coordBounds.textContent = `BBox: ${bboxStr}`;

    const coords = lineFeature.geometry.coordinates;

    // 6. Generate AI Prompt (Expert Prompt, No Elevation)
    generatePrompt({
        distanceKm: distanceKm.toFixed(2),
        bufferMeters: bufferDistanceMeters,
        areaKm2: areaKm2.toFixed(2),
        bboxStr: bboxStr,
        startCoord: `${coords[0][1].toFixed(4)}, ${coords[0][0].toFixed(4)}`,
        endCoord: `${coords[coords.length - 1][1].toFixed(4)}, ${coords[coords.length - 1][0].toFixed(4)}`
    });
}

// Generate Prompt (Expert Format, precise & structured)
function generatePrompt(data) {
    const prompt = `Agis en tant qu'historien local, géographe, naturaliste et guide expert du patrimoine.

J'effectue une randonnée de ${data.distanceKm} km (Départ : ${data.startCoord} / Arrivée : ${data.endCoord}). La zone d'étude correspond au polygone tamponné de ${data.bufferMeters} mètres de part et d'autre de la trace (Superficie totale : ${data.areaKm2} km², Bounding Box géographique : ${data.bboxStr}).

Ne fais AUCUNE généralité touristique générique. Fournis un inventaire précis, rigoureux et structuré des éléments remarquables situés STRICTEMENT dans l'emprise géographique de ce polygone :

1. Patrimoine historique, bâti et architectural caché : vestiges, ruines, chapelles, ponts anciens, murets de pierre sèche, moulins ou patrimoine vernaculaire traversés ou frôlés. Précise leur histoire exacte et leur époque en 2 phrases.
2. Biodiversité, écosystèmes et curiosités naturelles : flore spécifique, faune locale, arbres remarquables, zones humides, cours d'eau, sources ou particularités géologiques (grottes, affleurements, crêtes) propres à ce couloir.
3. Points de vue et micro-toponymie : panoramas exacts observables depuis le tracé et origine/signification des noms de lieux-dits traversés.

Présente les résultats sous forme de liste chronologique (du km 0 à l'arrivée), en situant précisément chaque élément au kilomètre approximatif de la trace. Sois factuel, précis et technique.`;

    promptOutput.value = prompt;
    copyBtn.disabled = false;

    // Count words
    const words = prompt.trim().split(/\s+/).length;
    wordCountDisplay.textContent = `${words} mots`;
}

// Copy Prompt to Clipboard
function handleCopyPrompt() {
    promptOutput.select();
    promptOutput.setSelectionRange(0, 99999); // Mobile compatibility

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            copyBtnText.textContent = 'Copié !';
            copyBtn.classList.replace('bg-blue-600', 'bg-green-600');
            setTimeout(() => {
                copyBtnText.textContent = 'Copier';
                copyBtn.classList.replace('bg-green-600', 'bg-blue-600');
            }, 2000);
        } else {
            fallbackCopy(promptOutput.value);
        }
    } catch (err) {
        fallbackCopy(promptOutput.value);
    }
}

function fallbackCopy(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            copyBtnText.textContent = 'Copié !';
            copyBtn.classList.replace('bg-blue-600', 'bg-green-600');
            setTimeout(() => {
                copyBtnText.textContent = 'Copier';
                copyBtn.classList.replace('bg-green-600', 'bg-blue-600');
            }, 2000);
        });
    }
}
