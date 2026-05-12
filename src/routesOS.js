const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const ixc = require('./ixcClient');
const cache = require('./cache');
const { rowsToGeoJSON } = require('./geojson');
const { otimizarRota } = require('./vroomClient');
const config = require('./config');

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ─── Normalizar texto (remover acentos, uppercase) ──────
function normalizar(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

// ─── GET /api/os/tecnicos ───────────────────────────────
router.get('/tecnicos', (req, res) => {
  const tecnicos = db.prepare('SELECT * FROM tecnicos ORDER BY id').all();
  res.json(tecnicos);
});

// ─── GET /api/os/servicos ────────────────────────────────
router.get('/servicos', (req, res) => {
  const { tecnico, data } = req.query;
  let sql = 'SELECT s.*, t.nome as tecnico_nome FROM servicos s JOIN tecnicos t ON s.id_tecnico = t.id WHERE 1=1';
  const params = [];

  if (tecnico) {
    sql += ' AND s.id_tecnico = ?';
    params.push(tecnico);
  }
  if (data) {
    sql += ' AND s.data_servico = ?';
    params.push(data);
  }

  sql += ' ORDER BY s.id_tecnico, s.id';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// ─── POST /api/os/servicos ──────────────────────────────
router.post('/servicos', express.json(), (req, res) => {
  const { id_tecnico, nome_cliente, endereco, localidade, tipo_servico, periodo, latitude, longitude, data_servico } = req.body;
  if (!id_tecnico || !nome_cliente) {
    return res.status(400).json({ error: 'id_tecnico e nome_cliente são obrigatórios' });
  }
  const stmt = db.prepare(`
    INSERT INTO servicos (id_tecnico, nome_cliente, endereco, localidade, tipo_servico, periodo, latitude, longitude, data_servico)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    id_tecnico,
    nome_cliente || '',
    endereco || '',
    localidade || '',
    tipo_servico || 'instalação',
    periodo || 'manhã',
    latitude || 0,
    longitude || 0,
    data_servico || new Date().toISOString().split('T')[0]
  );
  res.json({ id: result.lastInsertRowid });
});

// ─── PUT /api/os/servicos/:id/coords ────────────────────
router.put('/servicos/:id/coords', express.json(), (req, res) => {
  const { latitude, longitude } = req.body;
  db.prepare('UPDATE servicos SET latitude = ?, longitude = ? WHERE id = ?')
    .run(latitude, longitude, req.params.id);
  res.json({ ok: true });
});

// ─── DELETE /api/os/servicos/:id ─────────────────────────
router.delete('/servicos/:id', (req, res) => {
  db.prepare('DELETE FROM servicos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── GET /api/os/servicos/ixc — Buscar OS no IXC ────────
router.get('/servicos/ixc', asyncHandler(async (req, res) => {
  const { nome_cliente } = req.query;
  if (!nome_cliente || nome_cliente.length < 3) {
    return res.status(400).json({ error: 'nome_cliente deve ter pelo menos 3 caracteres' });
  }

  try {
    // Tentar buscar na tabela de OS do IXC
    const os = await ixc.listar('su_oss_chamado', {
      qtype: 'su_oss_chamado.id_cliente',
      query: nome_cliente,
      oper: '%',
      sortname: 'id',
      sortorder: 'desc',
      rp: 50,
    });

    // Se retornou resultados, enriquecer com dados do cliente
    if (os.length > 0) {
      res.json({ source: 'ixc_os', data: os });
      return;
    }

    // Fallback: buscar na tabela de clientes pelo nome
    const clientes = await ixc.listar('cliente', {
      qtype: 'razao',
      query: nome_cliente,
      oper: '%',
      rp: 20,
    });

    res.json({ source: 'ixc_cliente', data: clientes });
  } catch (err) {
    console.warn('[OS] IXC bloqueado ou erro:', err.message);
    res.json({
      source: 'manual',
      data: [],
      warning: 'Tabela su_oss_chamado bloqueada ou inacessível. Usando dados manuais.',
    });
  }
}));

// ─── Pontos de Sítios do KML ────────────────────────────
let _kmlPointsCache = null;

function getKmlPoints() {
  if (_kmlPointsCache) return _kmlPointsCache;
  try {
    const kmlPath = path.join(__dirname, '..', 'kml', 'PONTOS DE SÍTIOS.kml');
    const content = fs.readFileSync(kmlPath, 'utf8');
    const placemarks = content.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || [];
    _kmlPointsCache = [];
    for (const pm of placemarks) {
      const nameMatch = pm.match(/<name>(.*?)<\/name>/);
      const coordsMatch = pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
      if (!nameMatch || !coordsMatch) continue;
      const raw = coordsMatch[1].trim();
      // Ignorar polígonos (têm múltiplos pares separados por espaço)
      if (raw.includes(' ')) continue;
      const [lng, lat] = raw.split(',').map(Number);
      if (!lat || !lng) continue;
      const name = nameMatch[1].trim();
      _kmlPointsCache.push({ name, nameNorm: normalizar(name), lat, lng });
    }
    console.log(`[GEOCODE] ${_kmlPointsCache.length} pontos de sítios carregados do KML`);
  } catch (err) {
    console.warn('[GEOCODE] Falha ao ler KML:', err.message);
    _kmlPointsCache = [];
  }
  return _kmlPointsCache;
}

/**
 * Encontra a melhor zona de cobertura para uma localidade.
 * Usa fuzzy match por nome normalizado.
 */
function matchKmlPoint(points, termoLocal) {
  if (!termoLocal || points.length === 0) return null;

  const stopWords = new Set(['SITIO', 'SÍTIO', 'POVOADO', 'VILA', 'RUA', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'EM', 'TORRE', 'POP']);
  let bestPoint = null;
  let bestScore = 0;

  for (const p of points) {
    let score = 0;

    // Match exato do nome completo normalizado
    if (p.nameNorm === termoLocal) { score += 100; }
    // Nome do ponto contém o termo
    else if (p.nameNorm.includes(termoLocal)) { score += 50; }
    // Termo contém o nome do ponto
    else if (termoLocal.includes(p.nameNorm)) { score += 40; }
    else {
      // Match por palavras-chave significativas
      const termoWords = termoLocal.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
      const pointWords = p.nameNorm.split(/[\s\/\-]+/).filter((w) => w.length > 2 && !stopWords.has(w));

      for (const tw of termoWords) {
        for (const pw of pointWords) {
          if (tw === pw) score += 30;
          else if (tw.includes(pw) || pw.includes(tw)) score += 15;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPoint = p;
    }
  }

  return bestScore >= 15 ? { point: bestPoint, score: bestScore } : null;
}

// ─── GET /api/os/geocode — Prioriza zonas do mapa de cobertura ──
router.get('/geocode', asyncHandler(async (req, res) => {
  const { localidade, nome_cliente } = req.query;
  if (!localidade && !nome_cliente) {
    return res.status(400).json({ error: 'localidade ou nome_cliente obrigatório' });
  }

  const termoLocal = normalizar(localidade || '');
  const termoCliente = normalizar(nome_cliente || '');
  const results = [];

  // 1. PRIORIDADE: Buscar nos pontos de sítios do KML
  const kmlPoints = getKmlPoints();
  if (termoLocal) {
    const match = matchKmlPoint(kmlPoints, termoLocal);
    if (match) {
      results.push({
        score: 100 + match.score,
        lat: match.point.lat,
        lng: match.point.lng,
        source: 'kml',
        info: `KML: ${match.point.name}`,
      });
    }
  }

  // 2. Buscar nos logins (radusuarios) — complementar
  let loginsGeo = cache.get('logins');
  if (!loginsGeo) {
    try {
      const rows = await ixc.listar('radusuarios');
      loginsGeo = rowsToGeoJSON(rows, 'latitude', 'longitude', (r) => ({
        id: r.id,
        login: r.login || '',
        endereco: r.endereco || '',
        bairro: r.bairro || '',
        cidade: r.cidade || '',
        complemento: r.complemento || '',
        id_cliente: r.id_cliente || '',
      }));
      cache.set('logins_geo_os', loginsGeo);
    } catch {
      loginsGeo = { type: 'FeatureCollection', features: [] };
    }
  }

  for (const feat of loginsGeo.features) {
    const p = feat.properties;
    const textoFull = normalizar(`${p.login} ${p.endereco} ${p.bairro} ${p.cidade} ${p.complemento}`);

    let score = 0;
    if (termoLocal && textoFull.includes(termoLocal)) score += 10;
    if (termoCliente && textoFull.includes(termoCliente)) score += 20;
    if (termoLocal) {
      const words = termoLocal.split(/\s+/).filter((w) => w.length > 2);
      for (const w of words) { if (textoFull.includes(w)) score += 3; }
    }
    if (termoCliente) {
      const words = termoCliente.split(/\s+/).filter((w) => w.length > 2);
      for (const w of words) { if (textoFull.includes(w)) score += 5; }
    }
    if (score > 0) {
      results.push({
        score,
        lat: feat.geometry.coordinates[1],
        lng: feat.geometry.coordinates[0],
        source: 'login',
        info: `${p.login} — ${p.endereco}, ${p.bairro}`,
      });
    }
  }

  // 3. Fallback: Nominatim
  if (results.length === 0 && localidade) {
    try {
      const q = encodeURIComponent(`${localidade}, Pernambuco, Brasil`);
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=3`,
        { headers: { 'User-Agent': 'FiberMap-Rotas/1.0' } }
      );
      const nomData = await nomRes.json();
      for (const r of nomData) {
        results.push({
          score: 1,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          source: 'nominatim',
          info: r.display_name,
        });
      }
    } catch (err) {
      console.warn('[GEOCODE] Nominatim falhou:', err.message);
    }
  }

  results.sort((a, b) => b.score - a.score);
  res.json(results.slice(0, 10));
}));

// ─── POST /api/os/otimizar ──────────────────────────────
router.post('/otimizar', express.json(), asyncHandler(async (req, res) => {
  const { id_tecnico, servico_ids } = req.body;
  if (!id_tecnico) {
    return res.status(400).json({ error: 'id_tecnico obrigatório' });
  }

  // Buscar serviços do técnico
  let servicos;
  if (servico_ids && servico_ids.length > 0) {
    const placeholders = servico_ids.map(() => '?').join(',');
    servicos = db.prepare(`SELECT * FROM servicos WHERE id IN (${placeholders}) AND id_tecnico = ?`)
      .all(...servico_ids, id_tecnico);
  } else {
    servicos = db.prepare('SELECT * FROM servicos WHERE id_tecnico = ? AND latitude != 0 AND longitude != 0')
      .all(id_tecnico);
  }

  // Filtrar serviços sem coordenadas
  const comCoords = servicos.filter((s) => s.latitude && s.longitude && s.latitude !== 0 && s.longitude !== 0);

  if (comCoords.length === 0) {
    return res.status(400).json({ error: 'Nenhum serviço com coordenadas para otimizar. Geocodifique os serviços primeiro.' });
  }

  const depot = { lat: config.sede.lat, lng: config.sede.lng };
  const jobs = comCoords.map((s) => ({
    id: s.id,
    lat: s.latitude,
    lng: s.longitude,
    nome: s.nome_cliente,
  }));

  const result = await otimizarRota(jobs, depot);

  // Salvar rota no banco
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT OR REPLACE INTO rotas (id_tecnico, data, geojson_rota, waypoints_order)
    VALUES (?, ?, ?, ?)
  `).run(
    id_tecnico,
    today,
    JSON.stringify(result.geometry),
    JSON.stringify(result.orderedJobs.map((j) => j.id))
  );

  res.json({
    tecnico_id: id_tecnico,
    orderedJobs: result.orderedJobs,
    geometry: result.geometry,
    legs: result.legs || [],
    totalDistance: result.totalDistance,
    totalDuration: result.totalDuration,
    depot,
  });
}));

// ─── GET /api/os/rotas ──────────────────────────────────
router.get('/rotas', (req, res) => {
  const { tecnico, data } = req.query;
  let sql = 'SELECT r.*, t.nome as tecnico_nome FROM rotas r JOIN tecnicos t ON r.id_tecnico = t.id WHERE 1=1';
  const params = [];

  if (tecnico) {
    sql += ' AND r.id_tecnico = ?';
    params.push(tecnico);
  }
  if (data) {
    sql += ' AND r.data = ?';
    params.push(data);
  }

  sql += ' ORDER BY r.criado_em DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// ─── POST /api/os/geocode-auto — Geocodifica todos os serviços sem coords
router.post('/geocode-auto', asyncHandler(async (req, res) => {
  // Resetar coordenadas de todos os serviços para re-geocodificar
  const forceReset = req.body && req.body.force;
  let servicos;
  if (forceReset) {
    db.prepare('UPDATE servicos SET latitude = 0, longitude = 0').run();
    servicos = db.prepare('SELECT * FROM servicos').all();
  } else {
    servicos = db.prepare('SELECT * FROM servicos WHERE latitude = 0 OR longitude = 0').all();
  }

  if (servicos.length === 0) {
    return res.json({ message: 'Todos os serviços já possuem coordenadas', updated: 0 });
  }

  // 1. PRIORIDADE: Pontos de sítios do KML
  const kmlPoints = getKmlPoints();

  // 2. Carregar logins do IXC  como fallback
  let loginsGeo = cache.get('logins');
  if (!loginsGeo) {
    try {
      const rows = await ixc.listar('radusuarios');
      loginsGeo = rowsToGeoJSON(rows, 'latitude', 'longitude', (r) => ({
        login: r.login || '',
        endereco: r.endereco || '',
        bairro: r.bairro || '',
        cidade: r.cidade || '',
        complemento: r.complemento || '',
      }));
    } catch {
      loginsGeo = { type: 'FeatureCollection', features: [] };
    }
  }

  let updated = 0;
  const updateStmt = db.prepare('UPDATE servicos SET latitude = ?, longitude = ? WHERE id = ?');
  const details = [];

  for (const s of servicos) {
    const termoLocal = normalizar(s.localidade);
    const termoCliente = normalizar(s.nome_cliente);
    let bestLat = 0;
    let bestLng = 0;
    let bestSource = '';

    // 1. Tentar match no KML PRIMEIRO
    if (termoLocal && kmlPoints.length > 0) {
      const kMatch = matchKmlPoint(kmlPoints, termoLocal);
      if (kMatch) {
        bestLat = kMatch.point.lat;
        bestLng = kMatch.point.lng;
        bestSource = `kml: ${kMatch.point.name}`;
      }
    }

    // 2. Se não encontrou na zona, tentar nos logins do IXC
    if (!bestLat && loginsGeo.features) {
      let bestScore = 0;
      for (const feat of loginsGeo.features) {
        const p = feat.properties;
        const textoFull = normalizar(`${p.login} ${p.endereco} ${p.bairro} ${p.cidade} ${p.complemento}`);

        let score = 0;
        if (termoLocal) {
          if (textoFull.includes(termoLocal)) score += 10;
          const words = termoLocal.split(/\s+/).filter((w) => w.length > 2);
          for (const w of words) { if (textoFull.includes(w)) score += 3; }
        }
        if (termoCliente) {
          const words = termoCliente.split(/\s+/).filter((w) => w.length > 2);
          for (const w of words) { if (textoFull.includes(w)) score += 5; }
        }

        if (score > bestScore) {
          bestScore = score;
          bestLat = feat.geometry.coordinates[1];
          bestLng = feat.geometry.coordinates[0];
          bestSource = 'login IXC';
        }
      }
    }

    // 3. Fallback: Nominatim
    if (!bestLat && s.localidade) {
      try {
        const q = encodeURIComponent(`${s.localidade}, ${s.endereco}, Cachoeirinha, Pernambuco, Brasil`);
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`,
          { headers: { 'User-Agent': 'FiberMap-Rotas/1.0' } }
        );
        const nomData = await nomRes.json();
        if (nomData.length > 0) {
          bestLat = parseFloat(nomData[0].lat);
          bestLng = parseFloat(nomData[0].lon);
          bestSource = 'nominatim';
        }
        await new Promise((r) => setTimeout(r, 1100));
      } catch { /* ignore */ }
    }

    if (bestLat && bestLng) {
      updateStmt.run(bestLat, bestLng, s.id);
      updated++;
      details.push({ id: s.id, nome: s.nome_cliente, local: s.localidade, source: bestSource, lat: bestLat, lng: bestLng });
    }
  }

  res.json({ message: `${updated} de ${servicos.length} serviços geocodificados`, updated, details });
}));

module.exports = router;
