/* touriste — interface */
(function () {
  'use strict';

  var Core = window.TouristeCore;
  function $(s) { return document.querySelector(s); }

  var state = {
    track: null,
    fileName: '',
    edited: false,     // le texte a été modifié à la main
    generated: false,  // un prompt a déjà été rédigé
    radius: 500
  };

  /* ---------- Carte ---------- */
  function ignUrl(layer, matrixSet, format) {
    return 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
      '&LAYER=' + layer + '&STYLE=normal&FORMAT=' + encodeURIComponent(format) +
      '&TILEMATRIXSET=' + matrixSet + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
  }

  var bases = {
    'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© contributeurs OpenStreetMap'
    }),
    'IGN Plan V2': L.tileLayer(ignUrl('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'PM', 'image/png'), {
      maxZoom: 19, attribution: '© IGN'
    }),
    'IGN BD Ortho': L.tileLayer(ignUrl('ORTHOIMAGERY.ORTHOPHOTOS', 'PM_0_19', 'image/jpeg'), {
      maxZoom: 19, attribution: '© IGN'
    })
  };

  var savedBase = 'OpenStreetMap';
  try { savedBase = localStorage.getItem('touriste.base') || savedBase; } catch (e) { /* stockage indisponible */ }
  if (!bases[savedBase]) savedBase = 'OpenStreetMap';

  var map = L.map('map', { layers: [bases[savedBase]] }).setView([46.6, 2.5], 6);
  L.control.layers(bases, null, { collapsed: false }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  map.on('baselayerchange', function (e) {
    try { localStorage.setItem('touriste.base', e.name); } catch (err) { /* ignoré */ }
  });

  var trackLayer = L.layerGroup().addTo(map);
  var corridor = null;

  /* Corridor de proximité : trait dont l'épaisseur (px) équivaut à 2 × rayon (m) au zoom courant. */
  function corridorWeight() {
    var lat = state.track ? state.track.centre.lat : map.getCenter().lat;
    var mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom());
    return (2 * state.radius) / mpp;
  }
  function updateCorridor() {
    if (!corridor) return;
    var w = corridorWeight();
    corridor.setStyle({ weight: Math.max(2, Math.min(w, 2500)), opacity: w > 2500 ? 0 : 0.28 });
  }
  map.on('zoomend', updateCorridor);

  function drawTrack(track) {
    trackLayer.clearLayers();
    var latlngs = track.segments.map(function (seg) {
      return seg.map(function (p) { return [p.lat, p.lon]; });
    });
    corridor = L.polyline(latlngs, {
      color: '#ffb703', lineCap: 'round', lineJoin: 'round', interactive: false, smoothFactor: 1.5
    }).addTo(trackLayer);
    L.polyline(latlngs, { color: '#d62828', weight: 3.5, opacity: 0.95, lineJoin: 'round' }).addTo(trackLayer);
    L.circleMarker([track.start.lat, track.start.lon], {
      radius: 8, color: '#fff', weight: 2, fillColor: '#2d9d5a', fillOpacity: 1
    }).bindTooltip('Départ').addTo(trackLayer);
    L.circleMarker([track.end.lat, track.end.lon], {
      radius: 8, color: '#fff', weight: 2, fillColor: '#222', fillOpacity: 1
    }).bindTooltip('Arrivée').addTo(trackLayer);

    map.invalidateSize();
    map.fitBounds([[track.bounds.minLat, track.bounds.minLon], [track.bounds.maxLat, track.bounds.maxLon]], { padding: [30, 30] });
    updateCorridor();
  }

  /* ---------- Messages ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function showError(msg) {
    var e = $('#error');
    e.textContent = msg || '';
    e.hidden = !msg;
  }

  /* ---------- Chargement de la trace ---------- */
  function fmtKm(v) { return v.toFixed(1).replace('.', ','); }

  function loadFile(file) {
    if (!file) return;
    showError('');
    file.text().then(function (text) {
      var track = Core.parseTrack(text, file.name);
      state.track = track;
      state.fileName = file.name;
      drawTrack(track);
      $('#trackInfo').innerHTML = '<strong></strong> — ' + fmtKm(track.length / 1000) + ' km, ' +
        track.points.length + ' points' + (track.isLoop ? ', boucle' : '');
      $('#trackInfo strong').textContent = track.name;
      $('#mapHint').hidden = true;
      $('#btnGen').disabled = false;
      // nouvelle trace : ancien prompt devenu caduc
      if (state.generated && !state.edited) {
        generate(true);
      } else if (state.generated) {
        markStale();
      }
    }).catch(function (err) {
      showError(err && err.message ? err.message : 'Impossible de lire ce fichier.');
    });
  }

  $('#file').addEventListener('change', function (e) {
    loadFile(e.target.files[0]);
    e.target.value = ''; // permet de recharger le même fichier
  });

  var mapCol = document.querySelector('.map-col');
  ['dragenter', 'dragover'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); mapCol.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); mapCol.classList.remove('dragover'); });
  });
  document.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
  });

  /* ---------- Paramètres ---------- */
  function currentRadius() { return parseInt(document.querySelector('input[name="radius"]:checked').value, 10); }
  function currentAudience() { return document.querySelector('input[name="audience"]:checked').value; }

  function markStale() { if (state.generated) $('#stale').hidden = false; }

  document.querySelectorAll('input[name="radius"]').forEach(function (r) {
    r.addEventListener('change', function () {
      state.radius = currentRadius();
      updateCorridor();
      markStale();
    });
  });
  document.querySelectorAll('input[name="audience"]').forEach(function (r) { r.addEventListener('change', markStale); });
  $('#extra').addEventListener('input', markStale);

  /* ---------- Prompt ---------- */
  var promptEl = $('#prompt');

  function refreshPromptUi() {
    var n = Core.countWords(promptEl.value);
    $('#wc').textContent = n + (n > 1 ? ' mots' : ' mot');
    $('#btnCopy').disabled = $('#btnDl').disabled = !promptEl.value.trim();
  }

  function generate(silent) {
    if (!state.track) return;
    if (!silent && state.edited && promptEl.value.trim() &&
        !window.confirm('Le texte a été modifié à la main. Le remplacer par un nouveau prompt ?')) return;
    promptEl.value = Core.buildPrompt(state.track, {
      radius: currentRadius(),
      audience: currentAudience(),
      extra: $('#extra').value
    });
    state.generated = true;
    state.edited = false;
    $('#stale').hidden = true;
    refreshPromptUi();
    if (!silent) promptEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#btnGen').addEventListener('click', function () { generate(false); });
  promptEl.addEventListener('input', function () { state.edited = true; refreshPromptUi(); });

  $('#btnCopy').addEventListener('click', function () {
    var text = promptEl.value;
    function fallback() {
      promptEl.focus();
      promptEl.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      toast(ok ? 'Prompt copié dans le presse-papier' : 'Copie impossible : sélectionnez le texte manuellement');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('Prompt copié dans le presse-papier'); }, fallback);
    } else {
      fallback();
    }
  });

  $('#btnDl').addEventListener('click', function () {
    var slug = (state.track ? state.track.name : 'randonnee')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'randonnee';
    var blob = new Blob([promptEl.value], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'touriste_' + slug + '_' + currentRadius() + 'm.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('Texte téléchargé');
  });

  refreshPromptUi();

  /* ---------- Service worker (brise-cache) ---------- */
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    var refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || refreshing) return; // premier install : pas de rechargement
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'VERSION') $('#version').textContent = e.data.cache;
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(function (reg) {
        reg.update();
        return navigator.serviceWorker.ready;
      }).then(function (reg) {
        if (reg.active) reg.active.postMessage('GET_VERSION');
      }).catch(function () { /* hors HTTPS ou refusé : l'appli fonctionne sans cache */ });
    });
  }
})();
