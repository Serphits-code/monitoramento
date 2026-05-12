const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { authRouter, requireWebAuth, requireGpsToken } = require('./auth');
const routes = require('./routes');
const routesOS = require('./routesOS');
const monitoramentoRoutes = require('./routesMonitoramento');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Rotas publicas: login web e ingestao GPS autenticada por token.
app.get('/login', (_req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});
app.use('/api/auth', authRouter);
app.use('/api/monitoramento/gps', requireGpsToken, monitoramentoRoutes.publicRouter);

// Todo o sistema web abaixo exige login.
app.use(requireWebAuth);

app.get('/monitoramento', (_req, res) => {
  res.sendFile(path.join(publicDir, 'monitoramento.html'));
});

// Arquivos estáticos do frontend
app.use(express.static(publicDir));

// API routes
app.use('/api', routes);
app.use('/api/os', routesOS);
app.use('/api/monitoramento', monitoramentoRoutes.router);

// Error handler
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`Servidor rodando em http://localhost:${config.port}`);
  console.log(`Mapa de cobertura: http://localhost:${config.port}/`);
  console.log(`Mapa de rotas OS: http://localhost:${config.port}/rotas.html`);
  console.log(`Monitoramento GPS: http://localhost:${config.port}/monitoramento`);
  console.log(`API IXC: ${config.ixc.host}`);
  console.log(`OSRM: ${config.osrm.host} (${config.osrm.profile})`);
  console.log(`Sede: ${config.sede.lat}, ${config.sede.lng}`);
  console.log(`Cache TTL: ${config.cacheTtl / 1000}s`);
});
