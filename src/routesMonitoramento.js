const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const config = require('./config');
const { haversineMeters, processStopDetection } = require('./gpsStopDetector');

const publicRouter = express.Router();
const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function toNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function localDate(iso) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.app.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeCapturedAt(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizePoint(raw, defaults) {
  const idTecnico = parseInt(raw.id_tecnico || defaults.id_tecnico, 10);
  const latitude = toNumber(raw.latitude);
  const longitude = toNumber(raw.longitude);
  const capturedAt = normalizeCapturedAt(raw.captured_at || raw.timestamp);
  const deviceId = String(raw.device_id || defaults.device_id || 'android-test').trim();

  if (!Number.isInteger(idTecnico) || idTecnico <= 0) throw new Error('id_tecnico invalido');
  if (latitude === null || latitude < -90 || latitude > 90) throw new Error('latitude invalida');
  if (longitude === null || longitude < -180 || longitude > 180) throw new Error('longitude invalida');
  if (!capturedAt) throw new Error('captured_at invalido');
  if (!deviceId) throw new Error('device_id obrigatorio');

  const fallbackId = crypto
    .createHash('sha1')
    .update(`${deviceId}:${idTecnico}:${capturedAt}:${latitude.toFixed(6)}:${longitude.toFixed(6)}`)
    .digest('hex');

  return {
    id_tecnico: idTecnico,
    device_id: deviceId,
    client_point_id: String(raw.client_point_id || raw.id || fallbackId),
    latitude,
    longitude,
    accuracy: toNumber(raw.accuracy),
    speed: toNumber(raw.speed),
    bearing: toNumber(raw.bearing),
    battery: toNumber(raw.battery),
    captured_at: capturedAt,
    captured_date_local: localDate(capturedAt),
    received_at: new Date().toISOString(),
  };
}

function getTecnico(idTecnico) {
  return db.prepare('SELECT id, nome FROM tecnicos WHERE id = ?').get(idTecnico);
}

const insertPoint = db.prepare(`
  INSERT OR IGNORE INTO gps_points (
    id_tecnico, device_id, client_point_id, latitude, longitude, accuracy,
    speed, bearing, battery, captured_at, captured_date_local, received_at
  ) VALUES (
    @id_tecnico, @device_id, @client_point_id, @latitude, @longitude, @accuracy,
    @speed, @bearing, @battery, @captured_at, @captured_date_local, @received_at
  )
`);

const upsertLatest = db.prepare(`
  INSERT INTO gps_latest (
    id_tecnico, device_id, latitude, longitude, accuracy, speed, bearing,
    battery, captured_at, captured_date_local, received_at
  ) VALUES (
    @id_tecnico, @device_id, @latitude, @longitude, @accuracy, @speed, @bearing,
    @battery, @captured_at, @captured_date_local, @received_at
  )
  ON CONFLICT(id_tecnico) DO UPDATE SET
    device_id = excluded.device_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy = excluded.accuracy,
    speed = excluded.speed,
    bearing = excluded.bearing,
    battery = excluded.battery,
    captured_at = excluded.captured_at,
    captured_date_local = excluded.captured_date_local,
    received_at = excluded.received_at
  WHERE excluded.captured_at >= gps_latest.captured_at
`);

function calculateStats(points, stops) {
  let distanceMeters = 0;
  for (let idx = 1; idx < points.length; idx += 1) {
    const distance = haversineMeters(points[idx - 1], points[idx]);
    if (distance >= 3 && distance <= 3000) distanceMeters += distance;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const totalSeconds = first && last
    ? Math.max(0, Math.round((new Date(last.captured_at) - new Date(first.captured_at)) / 1000))
    : 0;
  const stoppedSeconds = stops.reduce((sum, stop) => sum + (stop.duration_seconds || 0), 0);

  return {
    points: points.length,
    distance_meters: Math.round(distanceMeters),
    total_seconds: totalSeconds,
    stopped_seconds: stoppedSeconds,
    moving_seconds: Math.max(0, totalSeconds - stoppedSeconds),
    first_at: first ? first.captured_at : null,
    last_at: last ? last.captured_at : null,
  };
}

function groupHistory(points, stops) {
  const tecnicos = db.prepare('SELECT id, nome FROM tecnicos ORDER BY id').all();
  const tecnicoMap = new Map(tecnicos.map((tecnico) => [tecnico.id, tecnico]));
  const stopMap = new Map();

  stops.forEach((stop) => {
    if (!stopMap.has(stop.id_tecnico)) stopMap.set(stop.id_tecnico, []);
    stopMap.get(stop.id_tecnico).push(stop);
  });

  const pointMap = new Map();
  points.forEach((point) => {
    if (!pointMap.has(point.id_tecnico)) pointMap.set(point.id_tecnico, []);
    pointMap.get(point.id_tecnico).push(point);
  });

  return Array.from(pointMap.entries()).map(([idTecnico, tecnicoPoints]) => {
    const tecnicoStops = stopMap.get(idTecnico) || [];
    return {
      id_tecnico: idTecnico,
      tecnico_nome: tecnicoMap.get(idTecnico)?.nome || `Tecnico ${idTecnico}`,
      points: tecnicoPoints,
      stops: tecnicoStops,
      route: {
        type: 'Feature',
        properties: { id_tecnico: idTecnico },
        geometry: {
          type: 'LineString',
          coordinates: tecnicoPoints.map((point) => [point.longitude, point.latitude]),
        },
      },
      stats: calculateStats(tecnicoPoints, tecnicoStops),
    };
  });
}

publicRouter.post('/batch', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const rawPoints = Array.isArray(body.points) ? body.points : [body];
  const defaults = { id_tecnico: body.id_tecnico, device_id: body.device_id };
  const errors = [];
  const accepted = [];

  rawPoints.forEach((raw, index) => {
    try {
      const point = normalizePoint(raw, defaults);
      if (!getTecnico(point.id_tecnico)) throw new Error(`tecnico ${point.id_tecnico} nao encontrado`);
      accepted.push(point);
    } catch (err) {
      errors.push({ index, error: err.message });
    }
  });

  accepted.sort((a, b) => new Date(a.captured_at) - new Date(b.captured_at));

  const result = db.transaction((points) => {
    let saved = 0;
    let duplicates = 0;

    points.forEach((point) => {
      const inserted = insertPoint.run(point).changes;
      if (inserted) {
        saved += 1;
        upsertLatest.run(point);
        processStopDetection(db, point);
      } else {
        duplicates += 1;
      }
    });

    return { saved, duplicates };
  })(accepted);

  res.json({ ok: true, received: rawPoints.length, accepted: accepted.length, errors, ...result });
}));

router.get('/live', (req, res) => {
  const rows = db.prepare(`
    SELECT t.id, t.nome, l.device_id, l.latitude, l.longitude, l.accuracy, l.speed,
           l.bearing, l.battery, l.captured_at, l.captured_date_local, l.received_at
    FROM tecnicos t
    LEFT JOIN gps_latest l ON l.id_tecnico = t.id
    ORDER BY t.id
  `).all();

  const activeStops = db.prepare(`
    SELECT * FROM gps_stops WHERE status = 'active' ORDER BY started_at DESC
  `).all().reduce((map, stop) => {
    if (!map[stop.id_tecnico]) map[stop.id_tecnico] = stop;
    return map;
  }, {});

  const now = Date.now();
  const technicians = rows.map((row) => {
    const ageSeconds = row.captured_at ? Math.round((now - new Date(row.captured_at).getTime()) / 1000) : null;
    const activeStop = activeStops[row.id] || null;
    let status = 'offline';
    if (row.captured_at && ageSeconds <= config.gps.staleSeconds) status = activeStop ? 'parado' : 'online';

    return {
      id: row.id,
      nome: row.nome,
      status,
      age_seconds: ageSeconds,
      active_stop: activeStop,
      latest: row.captured_at ? {
        device_id: row.device_id,
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy,
        speed: row.speed,
        bearing: row.bearing,
        battery: row.battery,
        captured_at: row.captured_at,
        captured_date_local: row.captured_date_local,
        received_at: row.received_at,
      } : null,
    };
  });

  res.json({ technicians, stale_seconds: config.gps.staleSeconds, server_time: new Date().toISOString() });
});

router.get('/history', (req, res) => {
  const data = req.query.data || localDate(new Date().toISOString());
  const tecnico = req.query.tecnico ? parseInt(req.query.tecnico, 10) : null;
  const params = [data];

  let pointSql = `
    SELECT p.*, t.nome AS tecnico_nome
    FROM gps_points p
    JOIN tecnicos t ON t.id = p.id_tecnico
    WHERE p.captured_date_local = ?
  `;
  let stopSql = `
    SELECT s.*, t.nome AS tecnico_nome
    FROM gps_stops s
    JOIN tecnicos t ON t.id = s.id_tecnico
    WHERE s.captured_date_local = ?
  `;

  if (tecnico) {
    pointSql += ' AND p.id_tecnico = ?';
    stopSql += ' AND s.id_tecnico = ?';
    params.push(tecnico);
  }

  pointSql += ' ORDER BY p.id_tecnico, p.captured_at';
  stopSql += ' ORDER BY s.id_tecnico, s.started_at';

  const points = db.prepare(pointSql).all(...params);
  const stops = db.prepare(stopSql).all(...params);
  res.json({ data, routes: groupHistory(points, stops), stops });
});

router.get('/stops', (req, res) => {
  const data = req.query.data || localDate(new Date().toISOString());
  const tecnico = req.query.tecnico ? parseInt(req.query.tecnico, 10) : null;
  const params = [data];
  let sql = `
    SELECT s.*, t.nome AS tecnico_nome
    FROM gps_stops s
    JOIN tecnicos t ON t.id = s.id_tecnico
    WHERE s.captured_date_local = ?
  `;
  if (tecnico) {
    sql += ' AND s.id_tecnico = ?';
    params.push(tecnico);
  }
  sql += ' ORDER BY s.started_at';
  res.json(db.prepare(sql).all(...params));
});

router.get('/summary', (req, res) => {
  const data = req.query.data || localDate(new Date().toISOString());
  const points = db.prepare('SELECT * FROM gps_points WHERE captured_date_local = ? ORDER BY id_tecnico, captured_at').all(data);
  const stops = db.prepare('SELECT * FROM gps_stops WHERE captured_date_local = ? ORDER BY id_tecnico, started_at').all(data);
  const summaries = groupHistory(points, stops).map((route) => ({
    id_tecnico: route.id_tecnico,
    tecnico_nome: route.tecnico_nome,
    stats: route.stats,
    stops: route.stops.length,
  }));
  res.json({ data, summaries });
});

router.get('/settings', (_req, res) => {
  res.json({
    stop_radius_meters: config.gps.stopRadiusMeters,
    stop_min_seconds: config.gps.stopMinSeconds,
    stale_seconds: config.gps.staleSeconds,
    time_zone: config.app.timeZone,
  });
});

module.exports = {
  publicRouter,
  router,
};