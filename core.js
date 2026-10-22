/* touriste — logique pure (sans DOM) : lecture GPX/KML, mesures, rédaction du prompt */
(function (global) {
  'use strict';

  var EARTH_R = 6371008.8;
  function rad(d) { return d * Math.PI / 180; }

  /* Distance orthodromique (haversine), en mètres. Altitudes volontairement ignorées. */
  function distance(a, b) {
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var s = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function nodeName(n) { return n.localName || n.nodeName; }

  function childText(el, tag) {
    if (!el) return '';
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && nodeName(n) === tag) return (n.textContent || '').trim();
    }
    return '';
  }

  function valid(p) {
    return p && isFinite(p.lat) && isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0);
  }

  function parseTrack(text, fileName, ParserCtor) {
    var Parser = ParserCtor || global.DOMParser;
    var doc = new Parser().parseFromString(String(text).replace(/^\uFEFF/, ''), 'text/xml');
    if (!doc || !doc.documentElement || doc.getElementsByTagName('parsererror').length) {
      throw new Error('Fichier illisible : ce n’est pas un XML valide.');
    }
    var kind = nodeName(doc.documentElement).toLowerCase();
    var segments = [], name = '', i, j, list;

    if (kind === 'gpx') {
      list = doc.getElementsByTagName('trkseg');
      for (i = 0; i < list.length; i++) {
        var pts = list[i].getElementsByTagName('trkpt'), seg = [];
        for (j = 0; j < pts.length; j++) {
          seg.push({ lat: parseFloat(pts[j].getAttribute('lat')), lon: parseFloat(pts[j].getAttribute('lon')) });
        }
        segments.push(seg);
      }
      var holder = doc.getElementsByTagName('trk')[0];
      if (!segments.some(function (s) { return s.length > 1; })) {
        segments = [];
        list = doc.getElementsByTagName('rte');
        for (i = 0; i < list.length; i++) {
          var rp = list[i].getElementsByTagName('rtept'), rseg = [];
          for (j = 0; j < rp.length; j++) {
            rseg.push({ lat: parseFloat(rp[j].getAttribute('lat')), lon: parseFloat(rp[j].getAttribute('lon')) });
          }
          segments.push(rseg);
        }
        holder = doc.getElementsByTagName('rte')[0];
      }
      name = childText(holder, 'name') || childText(doc.getElementsByTagName('metadata')[0], 'name');
    } else if (kind === 'kml') {
      var first = null;
      list = doc.getElementsByTagName('coordinates');
      for (i = 0; i < list.length; i++) {
        if (nodeName(list[i].parentNode) !== 'LineString') continue;
        if (!first) first = list[i];
        var toks = (list[i].textContent || '').trim().split(/\s+/), kseg = [];
        for (j = 0; j < toks.length; j++) {
          var c = toks[j].split(',');
          kseg.push({ lon: parseFloat(c[0]), lat: parseFloat(c[1]) });
        }
        segments.push(kseg);
      }
      var tracks = doc.getElementsByTagName('gx:Track');
      for (i = 0; i < tracks.length; i++) {
        var gc = tracks[i].getElementsByTagName('gx:coord'), gseg = [];
        for (j = 0; j < gc.length; j++) {
          var g = (gc[j].textContent || '').trim().split(/\s+/);
          gseg.push({ lon: parseFloat(g[0]), lat: parseFloat(g[1]) });
        }
        segments.push(gseg);
        if (!first) first = tracks[i];
      }
      var n = first;
      while (n && nodeName(n) !== 'Placemark') n = n.parentNode;
      name = childText(n, 'name') || childText(doc.getElementsByTagName('Document')[0], 'name');
    } else {
      throw new Error('Format non reconnu : fournir un fichier GPX ou KML.');
    }

    segments = segments
      .map(function (s) { return s.filter(valid); })
      .filter(function (s) { return s.length >= 2; });
    if (!segments.length) throw new Error('Aucune trace (ligne) trouvée dans ce fichier.');

    var points = [], total = 0;
    segments.forEach(function (seg) {
      seg.forEach(function (p, k) {
        if (k > 0) total += distance(seg[k - 1], p);
        points.push({ lat: p.lat, lon: p.lon, d: total });
      });
    });

    var b = { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 };
    points.forEach(function (p) {
      if (p.lat < b.minLat) b.minLat = p.lat;
      if (p.lat > b.maxLat) b.maxLat = p.lat;
      if (p.lon < b.minLon) b.minLon = p.lon;
      if (p.lon > b.maxLon) b.maxLon = p.lon;
    });

    var start = points[0], end = points[points.length - 1];
    return {
      name: name || String(fileName || '').replace(/\.[^.]+$/, ''),
      segments: segments,
      points: points,
      length: total,
      bounds: b,
      centre: { lat: (b.minLat + b.maxLat) / 2, lon: (b.minLon + b.maxLon) / 2 },
      start: start,
      end: end,
      isLoop: distance(start, end) <= Math.max(100, total * 0.02)
    };
  }

  /* Points de passage régulièrement répartis le long du tracé (6 à 12). */
  function samplePoints(track) {
    var km = track.length / 1000;
    var n = Math.max(6, Math.min(12, Math.round(km / 1.5) + 2));
    var out = [], idx = 0, pts = track.points;
    for (var i = 0; i < n; i++) {
      var target = track.length * i / (n - 1);
      while (idx < pts.length - 1 && pts[idx].d < target) idx++;
      out.push({ km: pts[idx].d / 1000, lat: pts[idx].lat, lon: pts[idx].lon });
    }
    return out;
  }

  var AUDIENCES = {
    eclaires: {
      label: 'Amateurs éclairés',
      text: 'Le public visé est constitué d’amateurs éclairés : des randonneurs déjà familiers du patrimoine et de la nature, qui apprécient des explications précises (dates, noms propres, contexte historique) sans jargon excessif.'
    },
    curieux: {
      label: 'Randonneurs curieux',
      text: 'Le public visé est constitué de randonneurs curieux : des marcheurs attentifs à ce qui les entoure, sans connaissances particulières. Privilégie un langage simple, des anecdotes vivantes et ce qui se remarque facilement depuis le sentier.'
    },
    famille: {
      label: 'Public familial',
      text: 'Le public visé est familial, avec des enfants : privilégie les éléments faciles à repérer, les anecdotes, les légendes et les observations ludiques, avec un vocabulaire accessible. Signale ce qu’il vaut mieux ne pas approcher (ruines instables, abords de falaises ou de cours d’eau).'
    },
    expert: {
      label: 'Public expert',
      text: 'Le public visé est expert (historiens locaux, naturalistes, géologues) : emploie la terminologie technique, donne les datations, les noms scientifiques des espèces, les formations géologiques et leur âge, les statuts de protection et les références bibliographiques ou bases de données consultables.'
    }
  };

  function fmtKm(v) { return v.toFixed(1).replace('.', ','); }
  function fmtC(v) { return v.toFixed(5); }

  function buildPrompt(track, opts) {
    var radius = opts.radius || 500;
    var aud = AUDIENCES[opts.audience] || AUDIENCES.curieux;
    var extra = (opts.extra || '').trim();
    var b = track.bounds;
    var L = [];

    L.push('Tu es un guide-conférencier, historien local, naturaliste et géologue, spécialiste du territoire français. Je prépare une randonnée et je souhaite un inventaire précis, sourcé et structuré des curiosités situées à proximité immédiate du sentier.');
    L.push('');
    L.push('DONNÉES DE LA RANDONNÉE');
    L.push('- Nom du tracé : ' + track.name);
    L.push('- Longueur : ' + fmtKm(track.length / 1000) + ' km, ' + (track.isLoop ? 'boucle (départ et arrivée proches)' : 'itinéraire non bouclé'));
    L.push('- Départ : ' + fmtC(track.start.lat) + ', ' + fmtC(track.start.lon) + ' ; arrivée : ' + fmtC(track.end.lat) + ', ' + fmtC(track.end.lon));
    L.push('- Emprise : latitude ' + b.minLat.toFixed(4) + ' à ' + b.maxLat.toFixed(4) + ', longitude ' + b.minLon.toFixed(4) + ' à ' + b.maxLon.toFixed(4));
    L.push('- Points de passage successifs (distance depuis le départ, latitude, longitude) :');
    samplePoints(track).forEach(function (p, i) {
      L.push('  ' + (i + 1) + '. km ' + fmtKm(p.km) + ' : ' + fmtC(p.lat) + ', ' + fmtC(p.lon));
    });
    if (extra) L.push('- Précisions de ma part : ' + extra);
    L.push('');
    L.push('ZONE DE RECHERCHE');
    L.push('Ne retiens que les éléments situés à moins de ' + radius + ' mètres du tracé, de part et d’autre. Indique pour chacun sa distance approximative au sentier. Le dénivelé et les altitudes ne m’intéressent pas : ne les mentionne pas.');
    L.push('');
    L.push('PUBLIC VISÉ');
    L.push(aud.text);
    L.push('');
    L.push('CONTENU DEMANDÉ');
    L.push('1. Patrimoine historique, bâti et architectural caché : vestiges, ruines, chapelles, ponts anciens, murets de pierre sèche, anciens moulins, éléments d’architecture vernaculaire traversés ou frôlés par le sentier. Pour chacun, résume son histoire en une ou deux phrases.');
    L.push('2. Nature et géologie : spécificités de la flore et de la faune locales, arbres remarquables, zones humides, cours d’eau, sources, particularités géologiques (affleurements, grottes, crêtes).');
    L.push('3. Panoramas et toponymie : panoramas exacts visibles depuis le tracé (point d’observation, direction, ce que l’on y voit) et origine ou signification des noms de lieux-dits traversés.');
    L.push('');
    L.push('EXIGENCES DE FIABILITÉ');
    L.push('- Commence par identifier les communes traversées à partir des coordonnées et dis-moi lesquelles tu retiens.');
    L.push('- Ne cite que des éléments dont tu es sûr de l’existence et de la position ; n’invente rien. Si une information est incertaine, signale-la explicitement (« à vérifier »).');
    L.push('- Cite tes sources pour chaque élément (base Mérimée/POP, inventaires du patrimoine, INPN, BRGM/InfoTerre, Wikipédia, OpenStreetMap, sites communaux ou associatifs), avec un lien si possible.');
    L.push('- Raisonne à partir des coordonnées fournies et non du seul nom du tracé, qui peut être trompeur.');
    L.push('- Si peu d’éléments existent dans la zone, dis-le plutôt que de combler avec des lieux éloignés.');
    L.push('');
    L.push('FORMAT DE RÉPONSE');
    L.push('Structure la réponse par catégorie, en liste ou tableau : nom, localisation (commune et point de passage le plus proche, ou coordonnées), distance au sentier, description, source. Classe les éléments dans l’ordre de parcours, du départ vers l’arrivée. Précise s’ils sont visibles depuis le sentier ou demandent un court détour, et signale les accès privés ou interdits. Termine par les cinq incontournables, puis par la liste des points à vérifier sur place. Réponds en français.');

    return L.join('\n');
  }

  function countWords(t) {
    var m = String(t).trim().match(/\S+/g);
    return m ? m.length : 0;
  }

  var api = {
    distance: distance, parseTrack: parseTrack, samplePoints: samplePoints,
    buildPrompt: buildPrompt, countWords: countWords, AUDIENCES: AUDIENCES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TouristeCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
