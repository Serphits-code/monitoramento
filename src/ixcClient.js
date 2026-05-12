const fetch = require('node-fetch');
const config = require('./config');

const AUTH = Buffer.from(config.ixc.token).toString('base64');

/**
 * Lista registros de uma tabela da API IXC com paginação automática.
 * @param {string} tabela  Nome da tabela (ex: 'df_elemento')
 * @param {object} opts
 * @param {string} [opts.qtype]     Campo para filtro
 * @param {string} [opts.query]     Valor do filtro
 * @param {string} [opts.oper]      Operador (=, >, <, like, !=)
 * @param {number} [opts.rp]        Registros por página (max 500)
 * @param {string} [opts.sortname]  Campo para ordenação
 * @param {string} [opts.sortorder] asc | desc
 * @param {number} [opts.maxPages]  Limite de páginas (segurança)
 * @returns {Promise<Array>} Todos os registros encontrados
 */
async function listar(tabela, opts = {}) {
  const {
    qtype = '',
    query = '',
    oper = '=',
    rp = 500,
    sortname = 'id',
    sortorder = 'asc',
    maxPages = 200,
  } = opts;

  const url = `${config.ixc.host}/webservice/v1/${tabela}`;
  let page = 1;
  const all = [];

  while (page <= maxPages) {
    const body = new URLSearchParams({
      qtype,
      query,
      oper,
      page: String(page),
      rp: String(rp),
      sortname,
      sortorder,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${AUTH}`,
        ixcsoft: 'listar',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`IXC API ${tabela} HTTP ${res.status}: ${text}`);
    }

    const json = await res.json();

    // IXC retorna {"type":"error","message":"..."} com HTTP 200 para erros de permissão
    if (json.type === 'error') {
      throw new Error(`IXC API ${tabela}: ${json.message || 'Erro desconhecido'}`);
    }

    const registros = json.registros;

    if (!Array.isArray(registros) || registros.length === 0) break;

    all.push(...registros);

    const total = parseInt(json.total, 10) || 0;
    if (all.length >= total) break;

    page++;
  }

  return all;
}

module.exports = { listar };
