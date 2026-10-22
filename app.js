// Initialize Lucide icons
lucide.createIcons();

// Global Variables
let map = null;
let currentTrackGeoJSON = null;
let bufferLayer = null;
let trackLayer = null;
let chartInstance = null;

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
const statEleGain = document.getElementById('statEleGain');
const statEleLoss = document.getElementById('statEleLoss');
const coordBounds = document.getElementById('coordBounds');
const fileInfo = document.getElementById('fileInfo');
const fileNameDisplay = document.getElementById('fileName');
const fileTypeDisplay = document.getElementById('fileType');
const chartContainer = document.getElementById('chartContainer');

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

// Simple GPX Parser to GeoJSON
function parseGPX(gpxText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
    const trkpts = xmlDoc.getElementsByTagName('trkpt');

    const coordinates = [];
    let elevations = [];

    for (let i = 0; i < trkpts.length; i++) {
        const pt = trkpts[i];
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon'));
        
        const eleNode = pt.getElementsByTagName('ele')[0];
        const ele = eleNode ? parseFloat(eleNode.textContent) : null;

        if (!isNaN(lat) && !isNaN(lon)) {
            if (ele !== null && !isNaN(ele)) {
                coordinates.push([lon, lat, ele]);
                elevations.push(ele);
            } else {
                coordinates.push([lon, lat]);
            }
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
            properties: {
                hasElevation: elevations.length === coordinates.length
            }
        }]
    };
}

// Simple KML Parser to GeoJSON
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
                const ele = parts[2] ? parseFloat(parts[2]) : null;

                if (!isNaN(lat) && !isNaN(lon)) {
                    if (ele !== null && !isNaN(ele)) {
                        coordinates.push([lon, lat, ele]);
                    } else {
                        coordinates.push([lon, lat]);
                    }
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

    // Elevations & Gain/Loss
    const coords = lineFeature.geometry.coordinates;
    let eleGain = 0;
    let eleLoss = 0;
    const elevations = [];
    const distances = [];

    let accumDist = 0;

    for (let i = 0; i < coords.length; i++) {
        if (i > 0) {
            const p1 = turf.point(coords[i - 1]);
            const p2 = turf.point(coords[i]);
            accumDist += turf.distance(p1, p2, { units: 'kilometers' });
        }
        distances.push(accumDist.toFixed(2));

        if (coords[i].length >= 3 && coords[i][2] !== null) {
            const ele = coords[i][2];
            elevations.push(ele);

            if (i > 0 && coords[i - 1].length >= 3) {
                const prevEle = coords[i - 1][2];
                const diff = ele - prevEle;
                if (diff > 0) eleGain += diff;
                else eleLoss += Math.abs(diff);
            }
        }
    }

    if (elevations.length > 0) {
        statEleGain.textContent = `${Math.round(eleGain)} m`;
        statEleLoss.textContent = `${Math.round(eleLoss)} m`;
        renderElevationChart(distances, elevations);
        chartContainer.classList.remove('hidden');
    } else {
        statEleGain.textContent = 'N/A';
        statEleLoss.textContent = 'N/A';
        chartContainer.classList.add('hidden');
    }

    // Calculate Bounding Box
    const bbox = turf.bbox(bufferedPolygon || lineFeature);
    const bboxStr = `[${bbox[1].toFixed(4)}, ${bbox[0].toFixed(4)}] à [${bbox[3].toFixed(4)}, ${bbox[2].toFixed(4)}]`;
    coordBounds.textContent = `BBox: ${bboxStr}`;

    // 6. Generate AI Prompt
    generatePrompt({
        distanceKm: distanceKm.toFixed(2),
        bufferMeters: bufferDistanceMeters,
        areaKm2: areaKm2.toFixed(2),
        eleGain: Math.round(eleGain),
        eleLoss: Math.round(eleLoss),
        bboxStr: bboxStr,
        hasElevation: elevations.length > 0,
        startCoord: `${coords[0][1].toFixed(4)}, ${coords[0][0].toFixed(4)}`,
        endCoord: `${coords[coords.length - 1][1].toFixed(4)}, ${coords[coords.length - 1][0].toFixed(4)}`
    });
}

// Render Elevation Chart with Chart.js
function renderElevationChart(labels, data) {
    const ctx = document.getElementById('elevationChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Altitude (m)',
                data: data,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.2,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.parsed.y} m`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Distance (km)', font: { size: 10 } },
                    ticks: { maxTicksLimit: 8, font: { size: 10 } }
                },
                y: {
                    title: { display: true, text: 'Altitude (m)', font: { size: 10 } },
                    ticks: { font: { size: 10 } }
                }
            }
        }
    });
}

// Generate Prompt (~200 words)
function generatePrompt(data) {
    const prompt = `Agis en tant qu'expert en patrimoine, géographie et tourisme local. Je réalise un itinéraire de randonnée de ${data.distanceKm} km (Départ: ${data.startCoord}, Arrivée: ${data.endCoord})${data.hasElevation ? `, avec un dénivelé positif de ${data.eleGain} m et négatif de ${data.eleLoss} m` : ''}.

Afin d'enrichir ce parcours, j'ai défini une zone d'étude correspondant au polygone circonscrit autour de la trace avec une marge d'extension de ${data.bufferMeters} mètres de chaque côté (surface totale analysée : ${data.areaKm2} km², Bounding Box géographique : ${data.bboxStr}).

Dans le strict périmètre de ce polygone étendu, identifie et détaille les éléments remarquables suivants :
1. Intérêts touristiques et points de vue : panoramas, curiosités locales, sites d'accueil et activités outdoor.
2. Patrimoine historique et architectural : monuments, ruines, édifices religieux, châteaux, ouvrages d'art ou patrimoine rural traditionnel.
3. Riqueze naturelle et environnementale : faune, flore, zones protégées (Natura 2000, réserves), formations géologiques, cours d'eau et forêts d'intérêt.

Pour chaque point identifié, précise son positionnement approximatif par rapport au parcours et explique brièvement son importance contextuelle. Rédige un guide explicatif structuré, captivant et argumenté à destination des randonneurs.`;

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
