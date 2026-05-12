const config = require('./config');

function haversineMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function secondsBetween(startIso, endIso) {
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
}

function effectiveRadius(point) {
  const accuracy = Number(point.accuracy || 0);
  const accuracyRadius = accuracy > 0 ? Math.min(accuracy * 2, config.gps.maxAccuracyMeters) : 0;
  return Math.max(config.gps.stopRadiusMeters, accuracyRadius);
}

function averagePoint(points) {
  const total = points.reduce((acc, point) => {
    acc.latitude += point.latitude;
    acc.longitude += point.longitude;
    return acc;
  }, { latitude: 0, longitude: 0 });

  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  };
}

function closeActiveStop(db, activeStop, point, radiusMeters) {
  const duration = secondsBetween(activeStop.started_at, point.captured_at);
  db.prepare(`
    UPDATE gps_stops
    SET ended_at = ?, duration_seconds = ?, radius_meters = ?, status = 'closed', updated_at = datetime('now')
    WHERE id = ?
  `).run(point.captured_at, duration, radiusMeters, activeStop.id);
}

function updateActiveStop(db, activeStop, point, radiusMeters) {
  const count = activeStop.points_count + 1;
  const latitude = ((activeStop.center_latitude * activeStop.points_count) + point.latitude) / count;
  const longitude = ((activeStop.center_longitude * activeStop.points_count) + point.longitude) / count;
  const duration = secondsBetween(activeStop.started_at, point.captured_at);

  db.prepare(`
    UPDATE gps_stops
    SET center_latitude = ?, center_longitude = ?, duration_seconds = ?, radius_meters = ?, points_count = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(latitude, longitude, duration, Math.max(activeStop.radius_meters || 0, radiusMeters), count, activeStop.id);
}

function createStopIfNeeded(db, point) {
  const radiusMeters = effectiveRadius(point);
  const candidates = db.prepare(`
    SELECT id_tecnico, device_id, latitude, longitude, accuracy, captured_at, captured_date_local
    FROM gps_points
    WHERE id_tecnico = ? AND captured_at <= ? AND captured_at >= datetime(?, '-20 minutes')
    ORDER BY captured_at DESC
    LIMIT 80
  `).all(point.id_tecnico, point.captured_at, point.captured_at);

  const cluster = [];
  for (const candidate of candidates) {
    const distance = haversineMeters(point, candidate);
    if (distance > radiusMeters) break;
    cluster.push(candidate);
  }

  if (cluster.length < 2) return;
  const ordered = cluster.slice().reverse();
  const start = ordered[0];
  const duration = secondsBetween(start.captured_at, point.captured_at);
  if (duration < config.gps.stopMinSeconds) return;

  const center = averagePoint(ordered);
  db.prepare(`
    INSERT INTO gps_stops (
      id_tecnico, device_id, started_at, ended_at, duration_seconds,
      center_latitude, center_longitude, radius_meters, status, points_count, captured_date_local
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    point.id_tecnico,
    point.device_id,
    start.captured_at,
    duration,
    center.latitude,
    center.longitude,
    radiusMeters,
    ordered.length,
    point.captured_date_local
  );
}

function processStopDetection(db, point) {
  const activeStop = db.prepare(`
    SELECT * FROM gps_stops
    WHERE id_tecnico = ? AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1
  `).get(point.id_tecnico);

  const radiusMeters = effectiveRadius(point);
  if (activeStop) {
    const distance = haversineMeters(
      { latitude: activeStop.center_latitude, longitude: activeStop.center_longitude },
      point
    );

    if (distance > radiusMeters) closeActiveStop(db, activeStop, point, distance);
    else updateActiveStop(db, activeStop, point, distance);
    return;
  }

  createStopIfNeeded(db, point);
}

module.exports = {
  haversineMeters,
  processStopDetection,
};