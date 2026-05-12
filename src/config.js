require('dotenv').config();

function intEnv(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) ? value : fallback;
}

function floatEnv(name, fallback) {
  const value = parseFloat(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

module.exports = {
  ixc: {
    host: process.env.IXC_HOST || '',
    token: process.env.IXC_TOKEN || '',
  },
  port: intEnv('PORT', 3000),
  cacheTtl: intEnv('CACHE_TTL_MINUTES', 5) * 60 * 1000,
  osrm: {
    host: process.env.OSRM_HOST || 'https://router.project-osrm.org',
    profile: process.env.OSRM_PROFILE || 'bike',
  },
  sede: {
    lat: floatEnv('SEDE_LAT', -8.489729),
    lng: floatEnv('SEDE_LNG', -36.231432),
  },
  auth: {
    user: process.env.AUTH_USER || 'Objetivo',
    password: process.env.AUTH_PASSWORD || '',
    cookieSecret: process.env.AUTH_COOKIE_SECRET || '',
    sessionHours: intEnv('AUTH_SESSION_HOURS', 12),
  },
  gps: {
    ingestToken: process.env.GPS_INGEST_TOKEN || '',
    stopRadiusMeters: intEnv('GPS_STOP_RADIUS_METERS', 35),
    stopMinSeconds: intEnv('GPS_STOP_MIN_SECONDS', 120),
    staleSeconds: intEnv('GPS_STALE_SECONDS', 180),
    maxAccuracyMeters: intEnv('GPS_MAX_ACCURACY_METERS', 120),
  },
  app: {
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    timeZone: process.env.APP_TIMEZONE || 'America/Recife',
  },
};
