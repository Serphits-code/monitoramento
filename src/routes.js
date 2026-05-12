const express = require('express');
const ixc = require('./ixcClient');
const cache = require('./cache');
const { buildElementosGeoJSON, rowsToGeoJSON } = require('./geojson');

const router = express.Router();

// Wrapper for async route handlers (Express 5 compatibility)
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ─── Projetos (derivado das CTOs — df_projeto bloqueado) ────
router.get('/projetos', asyncHandler(async (req, res) => {
  const cacheKey = 'projetos';
  let data = cache.get(cacheKey);
  if (!data) {
    // Tentar df_projeto primeiro
    try {
      const rows = await ixc.listar('df_projeto');
      data = rows.map((r) => ({
        id: r.id,
        nome: r.nome || r.descricao || `Projeto ${r.id}`,
        latitude: r.latitude || null,
        longitude: r.longitude || null,
        zoom: r.zoom || null,
      }));
    } catch {
      // Fallback: extrair projetos únicos das CTOs
      console.warn('[WARN] df_projeto bloqueado — extraindo projetos das CTOs');
      const ctos = await ixc.listar('rad_caixa_ftth');
      const projetoMap = {};
      for (const cto of ctos) {
        const pid = cto.id_projeto;
        if (!pid || pid === '0') continue;
        if (!projetoMap[pid]) {
          projetoMap[pid] = {
            id: pid,
            nome: `Projeto ${pid}`,
            latitude: cto.latitude || null,
            longitude: cto.longitude || null,
            zoom: null,
          };
        }
      }
      data = Object.values(projetoMap);
    }
    cache.set(cacheKey, data);
  }
  res.json(data);
}));

// ─── Elementos (GeoJSON com geometria reconstruída) ─────────
router.get('/elementos/:idProjeto', asyncHandler(async (req, res) => {
  const idProjeto = req.params.idProjeto;
  const geojson = await buildElementosGeoJSON(idProjeto);
  res.json(geojson);
}));

// ─── Caixas FTTH (CTO) ─────────────────────────────────────
router.get('/caixas-ftth', asyncHandler(async (req, res) => {
  const cacheKey = 'caixas_ftth';
  let data = cache.get(cacheKey);
  if (!data) {
    const [rows, onus] = await Promise.all([
      ixc.listar('rad_caixa_ftth'),
      ixc.listar('radpop_radio_cliente_fibra'),
    ]);

    // Contar portas ocupadas por CTO (cada ONU = 1 porta)
    const portasUsadas = {};
    for (const onu of onus) {
      const cid = onu.id_caixa_ftth;
      if (cid && cid !== '0') {
        portasUsadas[cid] = (portasUsadas[cid] || 0) + 1;
      }
    }

    data = rowsToGeoJSON(rows, 'latitude', 'longitude', (r) => {
      const cap = parseInt(r.capacidade) || 0;
      const usadas = portasUsadas[r.id] || 0;
      return {
        id: r.id,
        nome: r.descricao || '',
        tipo: 'CTO',
        status: r.status || '',
        capacidade: cap,
        portas_usadas: usadas,
        portas_disponiveis: Math.max(0, cap - usadas),
        id_projeto: r.id_projeto || '',
        endereco: r.endereco || '',
        id_transmissor: r.id_transmissor || '',
        id_interface: r.id_interface || '',
        id_tecnologia: r.id_tecnologia || '',
        estilo: r.codigo_estilo_caixa || '',
      };
    });
    cache.set(cacheKey, data);
  }
  res.json(data);
}));

// ─── Logins (radusuarios) ───────────────────────────────────
router.get('/logins', asyncHandler(async (req, res) => {
  const cacheKey = 'logins';
  let data = cache.get(cacheKey);
  if (!data) {
    const rows = await ixc.listar('radusuarios');
    data = rowsToGeoJSON(rows, 'latitude', 'longitude', (r) => {
      // Mapear código de autenticação para nome legível
      const authMap = { L: 'PPPoE', D: 'IPoE', H: 'Hotspot', V: 'VLan', M: 'IP X MAC', I: 'Integração' };
      // Mapear tipo_conexao_mapa para tipo de transmissão legível
      const txMap = { F: 'Fibra', '58': '5.8', '24': '2.4', C: 'Cabo', A: 'ADSL', L: 'LTE', LD: 'Link Dedicado' };
      return {
        id: r.id,
        login: r.login || '',
        tipo: 'Login',
        online: r.online === 'S' || r.online === 's',
        ativo: r.ativo === 'S',
        id_cliente: r.id_cliente || '',
        id_contrato: r.id_contrato || '',
        conexao: r.conexao || '',
        olt: (() => {
          let c = r.conexao || '';
          c = c.replace(/^vlan[-_]/i, '');
          c = c.replace(/-?vlan\d+$/i, '');
          c = c.replace(/-\d+$/, '');
          return /^OLT/i.test(c) ? c.toUpperCase() : '';
        })(),
        concentrador: r.concentrador || '',
        id_projeto: r.id_df_projeto || '',
        autenticacao: authMap[r.autenticacao] || r.autenticacao || '',
        transmissao: txMap[r.tipo_conexao_mapa] || r.tipo_conexao || '',
        ultima_conexao_inicial: r.ultima_conexao_inicial || '',
        ultima_conexao_final: r.ultima_conexao_final || '',
      };
    });
    cache.set(cacheKey, data);
  }
  res.json(data);
}));

// ─── ONUs ───────────────────────────────────────────────────
router.get('/onus', asyncHandler(async (req, res) => {
  const cacheKey = 'onus';
  let data = cache.get(cacheKey);
  if (!data) {
    const rows = await ixc.listar('radpop_radio_cliente_fibra');
    data = rowsToGeoJSON(rows, 'latitude', 'longitude', (r) => ({
      id: r.id,
      tipo: 'ONU',
      nome: r.nome || '',
      mac: r.mac || '',
      sinal_rx: r.sinal_rx || '',
      sinal_tx: r.sinal_tx || '',
      temperatura: r.temperatura || '',
      voltagem: r.voltagem || '',
      id_login: r.id_login || '',
      id_caixa_ftth: r.id_caixa_ftth || '',
      porta_ftth: r.porta_ftth || '',
      id_projeto: r.id_projeto || '',
      onu_tipo: r.onu_tipo || '',
      id_transmissor: r.id_transmissor || '',
      tipo_autenticacao: r.tipo_autenticacao || '',
      data_sinal: r.data_sinal || '',
      compartilhada: r.onu_rede_neutra === 'S' ? 'Sim' : 'Não',
    }));
    cache.set(cacheKey, data);
  }
  res.json(data);
}));

// ─── POPs ───────────────────────────────────────────────────
router.get('/pops', asyncHandler(async (req, res) => {
  const cacheKey = 'pops';
  let data = cache.get(cacheKey);
  if (!data) {
    const rows = await ixc.listar('radpop');
    data = rowsToGeoJSON(rows, 'latitude', 'longitude', (r) => ({
      id: r.id,
      nome: r.pop || r.nome || '',
      tipo: 'POP',
      endereco: r.endereco || '',
      id_projeto: r.id_projeto || '',
    }));
    cache.set(cacheKey, data);
  }
  res.json(data);
}));

// ─── Limpar cache ───────────────────────────────────────────
router.post('/cache/clear', (req, res) => {
  cache.clear();
  res.json({ ok: true, message: 'Cache limpo' });
});

module.exports = router;
