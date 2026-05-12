const ixc = require('./ixcClient');
const cache = require('./cache');

/**
 * Tenta buscar tipos de elemento (pode falhar por permissão).
 * Se falhar, retorna mapa vazio — modo degradado.
 */
async function getTiposElemento() {
  const cached = cache.get('tipos_elemento');
  if (cached) return cached;

  try {
    const rows = await ixc.listar('df_tipo_elemento');
    const map = {};
    for (const r of rows) map[r.id] = r;
    cache.set('tipos_elemento', map);
    return map;
  } catch {
    console.warn('[WARN] Sem permissão para df_tipo_elemento — usando fallback');
    cache.set('tipos_elemento', {});
    return {};
  }
}

/**
 * Tenta reconstruir geometria dos elementos via df_elemento_coordenada + df_coordenada.
 * Se tabelas estiverem bloqueadas por permissão, retorna FeatureCollection vazio.
 */
async function buildElementosGeoJSON(idProjeto) {
  const cacheKey = `elementos_geojson_${idProjeto}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 1. Elementos do projeto
  const elementos = await ixc.listar('df_elemento', {
    qtype: 'id_projeto',
    query: String(idProjeto),
    oper: '=',
  });

  if (elementos.length === 0) {
    const empty = { type: 'FeatureCollection', features: [] };
    cache.set(cacheKey, empty);
    return empty;
  }

  // 2. Tentar buscar coordenadas (pode falhar por permissão)
  let todasVinculacoes, todasCoords;
  try {
    [todasVinculacoes, todasCoords] = await Promise.all([
      ixc.listar('df_elemento_coordenada', { sortname: 'id_elemento', sortorder: 'asc' }),
      ixc.listar('df_coordenada'),
    ]);
  } catch (err) {
    console.warn('[WARN] Sem permissão para tabelas de coordenadas:', err.message);
    const result = {
      type: 'FeatureCollection',
      features: [],
      _warning: 'Sem permissão para df_coordenada/df_elemento_coordenada. Libere no IXC.',
    };
    cache.set(cacheKey, result);
    return result;
  }

  // 3. Tipos de elemento (tentativa)
  const tipos = await getTiposElemento();

  const elementoIds = new Set(elementos.map((e) => e.id));

  const coordMap = {};
  for (const c of todasCoords) coordMap[c.id] = c;

  const vincsPorElemento = {};
  for (const v of todasVinculacoes) {
    if (!elementoIds.has(v.id_elemento)) continue;
    if (!vincsPorElemento[v.id_elemento]) vincsPorElemento[v.id_elemento] = [];
    vincsPorElemento[v.id_elemento].push(v);
  }
  for (const key of Object.keys(vincsPorElemento)) {
    vincsPorElemento[key].sort((a, b) => parseInt(a.sequencia, 10) - parseInt(b.sequencia, 10));
  }

  const features = [];
  for (const elem of elementos) {
    const tipo = tipos[elem.id_tipo_elemento] || {};
    const vincs = vincsPorElemento[elem.id] || [];
    if (vincs.length === 0) continue;

    const coords = vincs
      .map((v) => {
        const c = coordMap[v.id_coordenada];
        if (!c) return null;
        const rawLat = parseFloat(c.latitude);
        const rawLng = parseFloat(c.longitude);
        if (isNaN(rawLat) || isNaN(rawLng)) return null;
        const fixed = fixCoord(rawLat, rawLng);
        if (!fixed) return null;
        return [fixed[1], fixed[0]]; // [lng, lat]
      })
      .filter(Boolean);

    if (coords.length === 0) continue;

    const isLine = elem.tipo === 'CB' || (tipo.classificacao_tipo && tipo.classificacao_tipo !== 'Point');
    let geometry;
    if (!isLine || coords.length === 1) {
      geometry = { type: 'Point', coordinates: coords[0] };
    } else {
      geometry = { type: 'LineString', coordinates: coords };
    }

    // Garantir que cores tenham prefixo #
    const fixColor = (c, fallback) => {
      if (!c) return fallback;
      return c.startsWith('#') ? c : '#' + c;
    };

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: elem.id,
        descricao: elem.descricao || '',
        tipo_id: elem.id_tipo_elemento,
        tipo_nome: tipo.nome_tipo || '',
        categoria: tipo.categoria_tipo || '',
        classificacao: geometry.type,
        tipo_elem: elem.tipo || '',
        cor_ativa: fixColor(tipo.cor_ativa, '#3388ff'),
        cor_inativa: fixColor(tipo.cor_inativa, '#999999'),
        cor_fundo: fixColor(tipo.cor_fundo, '#ffffff'),
        espessura: parseInt(tipo.especura_linha, 10) || 2,
        icone_url: tipo.url_icone || '',
        pontilhada: tipo.pontilhada === 'S',
        z_index: parseInt(tipo.z_index, 10) || 0,
        cabo_fibras: tipo.cabo_numero_fibras || '',
        cabo_loose_tube: tipo.cabo_loose_tube || '',
        cabo_padrao: tipo.cabo_padrao || '',
        fabricante: tipo.fabricante || '',
        modelo: tipo.modelo || '',
        id_projeto: elem.id_projeto || '',
      },
    });
  }

  features.sort((a, b) => a.properties.z_index - b.properties.z_index);
  const geojson = { type: 'FeatureCollection', features };
  cache.set(cacheKey, geojson);
  return geojson;
}

/**
 * Garante que lat/lng estejam no hemisfério correto (Brasil: sempre negativo).
 * Se o valor vier positivo por erro de cadastro, força negativo.
 * Retorna null se a coordenada for absurda (fora dos limites do Brasil).
 */
function fixCoord(lat, lng) {
  lat = lat > 0 ? -lat : lat;
  lng = lng > 0 ? -lng : lng;
  // Limites aproximados do Brasil: lat -34 a +5, lng -74 a -34
  if (lat < -35 || lat > 6 || lng < -75 || lng > -33) return null;
  return [lat, lng];
}

/**
 * Converte registros com lat/lng direto para GeoJSON FeatureCollection.
 */
function rowsToGeoJSON(rows, latField, lngField, propsMapper) {
  const features = [];
  for (const row of rows) {
    const rawLat = parseFloat(row[latField]);
    const rawLng = parseFloat(row[lngField]);
    if (isNaN(rawLat) || isNaN(rawLng) || (rawLat === 0 && rawLng === 0)) continue;
    const fixed = fixCoord(rawLat, rawLng);
    if (!fixed) continue;
    const [lat, lng] = fixed;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: propsMapper(row),
    });
  }
  return { type: 'FeatureCollection', features };
}

module.exports = { buildElementosGeoJSON, rowsToGeoJSON, getTiposElemento };
