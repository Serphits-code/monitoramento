const crypto = require('crypto');
const express = require('express');
const config = require('./config');

const COOKIE_NAME = 'objetivo_session';

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest();
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(hash(a), hash(b));
}

function isWebAuthConfigured() {
  return Boolean(config.auth.user && config.auth.password && config.auth.cookieSecret);
}

function sign(payload) {
  return crypto.createHmac('sha256', config.auth.cookieSecret).update(payload).digest('base64url');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function createSession(user) {
  const expiresAt = Date.now() + config.auth.sessionHours * 60 * 60 * 1000;
  const payload = base64Url(JSON.stringify({ user, expiresAt }));
  return `${payload}.${sign(payload)}`;
}

function verifySession(token) {
  if (!isWebAuthConfigured() || !token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  try {
    const session = JSON.parse(fromBase64Url(payload));
    if (!session.expiresAt || Date.now() > session.expiresAt) return null;
    if (session.user !== config.auth.user) return null;
    return session;
  } catch {
    return null;
  }
}

function cookieOptions(req, maxAgeSeconds) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts;
}

function setSessionCookie(req, res, user) {
  const token = createSession(user);
  const parts = cookieOptions(req, config.auth.sessionHours * 60 * 60);
  parts[0] = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', cookieOptions(req, 0).join('; '));
}

function wantsJson(req) {
  return req.path.startsWith('/api/') || (req.headers.accept || '').includes('application/json');
}

function getSession(req) {
  return verifySession(parseCookies(req)[COOKIE_NAME]);
}

function requireWebAuth(req, res, next) {
  const session = getSession(req);
  if (session) {
    req.user = { name: session.user };
    return next();
  }

  if (wantsJson(req)) {
    return res.status(401).json({ error: 'Autenticacao obrigatoria' });
  }

  const returnTo = encodeURIComponent(req.originalUrl || '/monitoramento');
  return res.redirect(`/login?return=${returnTo}`);
}

function requireGpsToken(req, res, next) {
  if (!config.gps.ingestToken) {
    return res.status(503).json({ error: 'GPS_INGEST_TOKEN nao configurado no servidor' });
  }

  const header = req.headers.authorization || '';
  const bearer = header.match(/^Bearer\s+(.+)$/i);
  const token = bearer ? bearer[1] : req.headers['x-gps-token'];

  if (!token || !safeEqual(token, config.gps.ingestToken)) {
    return res.status(401).json({ error: 'Token GPS invalido' });
  }

  return next();
}

const authRouter = express.Router();

authRouter.post('/login', (req, res) => {
  if (!isWebAuthConfigured()) {
    return res.status(503).json({ error: 'Configure AUTH_PASSWORD e AUTH_COOKIE_SECRET no .env' });
  }

  const { usuario, senha } = req.body || {};
  if (!safeEqual(usuario, config.auth.user) || !safeEqual(senha, config.auth.password)) {
    return res.status(401).json({ error: 'Usuario ou senha invalidos' });
  }

  setSessionCookie(req, res, config.auth.user);
  return res.json({ ok: true, user: config.auth.user });
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  const session = getSession(req);
  res.json({ authenticated: Boolean(session), user: session ? session.user : null });
});

module.exports = {
  authRouter,
  requireWebAuth,
  requireGpsToken,
};