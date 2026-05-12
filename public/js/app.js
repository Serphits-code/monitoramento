/* ─── FiberMap — Leaflet frontend ──────────────────────── */

(function () {
  'use strict';

  const API = '/api';

  // ─── DOM refs ──────────────────────────────────────────
  const $projetoTags = document.getElementById('projeto-tags');
  const $projetoSearch = document.getElementById('projeto-search');
  const $projetoDropdown = document.getElementById('projeto-dropdown');
  const $status = document.getElementById('status');
  const $loading = document.getElementById('loading');
  const $btnRefresh = document.getElementById('btn-refresh');
  const $btnClearCache = document.getElementById('btn-clear-cache');
  const $filterInterface = document.getElementById('filter-interface');
  const $filterOlt = document.getElementById('filter-olt');
  const $filterStatus = document.getElementById('filter-status');
  const $filterAtivo = document.getElementById('filter-ativo');
  const $filterAutenticacao = document.getElementById('filter-autenticacao');
  const $filterTransmissao = document.getElementById('filter-transmissao');
  const $btnClearFilters = document.getElementById('btn-clear-filters');
  const $searchInput = document.getElementById('search-input');
  const $btnClearSearch = document.getElementById('btn-clear-search');

  // CTO filter refs
  const $ctoExibirDescricao = document.getElementById('cto-exibir-descricao');
  const $ctoOutrosProjetos = document.getElementById('cto-outros-projetos');
  const $ctoColorir = document.getElementById('cto-colorir');
  const $ctoStatus = document.getElementById('cto-status');
  const $ctoPortas = document.getElementById('cto-portas');
  const $ctoCapacidade = document.getElementById('cto-capacidade');
  const $ctoTransmissor = document.getElementById('cto-transmissor');
  const $ctoInterfaceFibra = document.getElementById('cto-interface-fibra');
  const $ctoTecnologia = document.getElementById('cto-tecnologia');
  const $ctoEstilo = document.getElementById('cto-estilo');
  const $btnClearCtoFilters = document.getElementById('btn-clear-cto-filters');

  // Cabo filter refs
  const $caboDirecao = document.getElementById('cabo-direcao');
  const $caboOutrosProjetos = document.getElementById('cabo-outros-projetos');
  const $caboReservas = document.getElementById('cabo-reservas');
  const $caboTipo = document.getElementById('cabo-tipo');
  const $caboPadrao = document.getElementById('cabo-padrao');
  const $caboFibras = document.getElementById('cabo-fibras');
  const $caboFabricante = document.getElementById('cabo-fabricante');
  const $caboModelo = document.getElementById('cabo-modelo');
  const $btnClearCaboFilters = document.getElementById('btn-clear-cabo-filters');

  // ONU filter refs
  const $onuOutrosProjetos = document.getElementById('onu-outros-projetos');
  const $onuColorir = document.getElementById('onu-colorir');
  const $onuTipo = document.getElementById('onu-tipo');
  const $onuStatusPotencia = document.getElementById('onu-status-potencia');
  const $onuPotencia = document.getElementById('onu-potencia');
  const $onuTransmissor = document.getElementById('onu-transmissor');
  const $btnClearOnuFilters = document.getElementById('btn-clear-onu-filters');

  // ─── Multi-select projetos ─────────────────────────────
  let allProjetos = [];       // [{id, nome, latitude, longitude, zoom}]
  let selectedProjetos = [];  // [{id, nome, ...}]
  let highlightIdx = -1;

  function getSelectedIds() {
    return selectedProjetos.map((p) => String(p.id));
  }

  function isAllSelected() {
    return selectedProjetos.length > 0 && selectedProjetos[0].id === 'all';
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function renderTags() {
    // Remove existing tags (keep input)
    $projetoTags.querySelectorAll('.multiselect-tag').forEach((t) => t.remove());
    selectedProjetos.forEach((p) => {
      const tag = document.createElement('span');
      tag.className = 'multiselect-tag';
      tag.innerHTML = `<span class="tag-text">${escapeHtml(p.nome)}</span><span class="tag-remove">×</span>`;
      tag.querySelector('.tag-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeProject(p.id);
      });
      $projetoTags.insertBefore(tag, $projetoSearch);
    });
    $projetoSearch.placeholder = selectedProjetos.length === 0 ? 'Selecione projetos...' : '';
  }

  function renderDropdown(filter) {
    const term = (filter || '').toLowerCase();
    const selIds = new Set(getSelectedIds());
    let html = '';

    // "Todos os projetos" option
    const allSel = selIds.has('all');
    html += `<div class="multiselect-option multiselect-option-all${allSel ? ' selected' : ''}" data-id="all">Todos os projetos</div>`;

    for (const p of allProjetos) {
      if (term && !p.nome.toLowerCase().includes(term)) continue;
      const sel = selIds.has(String(p.id));
      html += `<div class="multiselect-option${sel ? ' selected' : ''}" data-id="${escapeHtml(String(p.id))}">${escapeHtml(p.nome)}</div>`;
    }
    $projetoDropdown.innerHTML = html;
    highlightIdx = -1;
  }

  function showDropdown() {
    renderDropdown($projetoSearch.value);
    $projetoDropdown.classList.remove('hidden');
  }

  function hideDropdown() {
    $projetoDropdown.classList.add('hidden');
    highlightIdx = -1;
  }

  function addProject(id) {
    if (id === 'all') {
      selectedProjetos = [{ id: 'all', nome: 'Todos os projetos' }];
    } else {
      // Remove "all" if present
      selectedProjetos = selectedProjetos.filter((p) => p.id !== 'all');
      const proj = allProjetos.find((p) => String(p.id) === String(id));
      if (proj && !selectedProjetos.some((p) => String(p.id) === String(id))) {
        selectedProjetos.push(proj);
      }
    }
    $projetoSearch.value = '';
    renderTags();
    renderDropdown('');
    onSelectionChange();
  }

  function removeProject(id) {
    selectedProjetos = selectedProjetos.filter((p) => String(p.id) !== String(id));
    renderTags();
    renderDropdown($projetoSearch.value);
    onSelectionChange();
  }

  function onSelectionChange() {
    // Fly to first selected project coords if available
    if (selectedProjetos.length === 1 && selectedProjetos[0].id !== 'all') {
      const p = selectedProjetos[0];
      const lat = parseFloat(p.latitude);
      const lng = parseFloat(p.longitude);
      const zoom = parseInt(p.zoom, 10) || 14;
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
        map.setView([lat, lng], zoom);
      }
    }
    loadAllData();
  }

  // Events
  $projetoSearch.addEventListener('focus', showDropdown);
  $projetoSearch.addEventListener('input', () => {
    showDropdown();
  });

  $projetoTags.addEventListener('click', () => $projetoSearch.focus());

  $projetoDropdown.addEventListener('click', (e) => {
    const opt = e.target.closest('.multiselect-option');
    if (!opt) return;
    const id = opt.dataset.id;
    const selIds = new Set(getSelectedIds());
    if (selIds.has(String(id))) {
      removeProject(id);
    } else {
      addProject(id);
    }
    $projetoSearch.focus();
  });

  $projetoSearch.addEventListener('keydown', (e) => {
    const options = $projetoDropdown.querySelectorAll('.multiselect-option');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, options.length - 1);
      options.forEach((o, i) => o.classList.toggle('highlighted', i === highlightIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      options.forEach((o, i) => o.classList.toggle('highlighted', i === highlightIdx));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < options.length) {
        options[highlightIdx].click();
      }
    } else if (e.key === 'Backspace' && $projetoSearch.value === '' && selectedProjetos.length > 0) {
      removeProject(selectedProjetos[selectedProjetos.length - 1].id);
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#projeto-multiselect')) {
      hideDropdown();
    }
  });

  // ─── Map setup ─────────────────────────────────────────
  const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,       // Canvas renderer — handles 10k+ circleMarkers fast
    worldCopyJump: false,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0,
    maxZoom: 20,
  }).setView([-8.49, -36.24], 13);

  // Base layers
  const osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '&copy; OpenStreetMap', maxZoom: 20, maxNativeZoom: 19, noWrap: true }
  );

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '&copy; Esri', maxZoom: 20, maxNativeZoom: 18, noWrap: true }
  );

  const googleStreetLayer = L.tileLayer(
    'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    { attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20, noWrap: true }
  );

  const googleSatLayer = L.tileLayer(
    'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    { attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20, noWrap: true }
  );

  const googleHybridLayer = L.tileLayer(
    'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    { attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20, noWrap: true }
  );

  osmLayer.addTo(map);

  L.control.layers(
    {
      'OSM': osmLayer,
      'Google Ruas': googleStreetLayer,
      'Google Satélite': googleSatLayer,
      'Google Híbrido': googleHybridLayer,
      'Satélite (Esri)': satelliteLayer,
    },
    {},
    { position: 'topright' }
  ).addTo(map);

  // ─── Layer groups (layerGroup simples + Canvas para performance) ──
  const layers = {
    caixaEmenda: L.layerGroup().addTo(map),
    cabos: L.layerGroup().addTo(map),
    postes: L.layerGroup().addTo(map),
    caixaSubterranea: L.layerGroup().addTo(map),
    outrosElementos: L.layerGroup().addTo(map),
    caixasFtth: L.layerGroup().addTo(map),
    pops: L.layerGroup().addTo(map),
    logins: L.featureGroup().addTo(map),
    onus: L.layerGroup(),
    caboArrows: L.layerGroup().addTo(map),
  };

  // ─── Layer toggles ────────────────────────────────────
  document.querySelectorAll('.layer-toggle').forEach((label) => {
    const layerName = label.dataset.layer;
    const checkbox = label.querySelector('input');

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        map.addLayer(layers[layerName]);
      } else {
        map.removeLayer(layers[layerName]);
      }
    });

    // Sync initial state
    if (!checkbox.checked && map.hasLayer(layers[layerName])) {
      map.removeLayer(layers[layerName]);
    }
  });

  // ─── Helpers ───────────────────────────────────────────
  function setStatus(msg) {
    $status.textContent = msg;
  }

  function showLoading(show) {
    $loading.classList.toggle('hidden', !show);
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function popupHTML(props) {
    const rows = Object.entries(props)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false)
      .map(([k, v]) => {
        const escaped = String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<tr><td>${k}</td><td>${escaped}</td></tr>`;
      })
      .join('');
    return `<table class="popup-table">${rows}</table>`;
  }

  /**
   * Filtra um GeoJSON FeatureCollection pelo(s) id_projeto selecionado(s).
   * Aceita um único ID (string) ou um array de IDs.
   * Se null/vazio, retorna tudo.
   */
  function filterByProjeto(geojson, idProjetos) {
    if (!idProjetos) return geojson;
    const ids = Array.isArray(idProjetos) ? idProjetos : [idProjetos];
    if (ids.length === 0) return geojson;
    const idSet = new Set(ids.map(String));
    return {
      ...geojson,
      features: geojson.features.filter(
        (f) => idSet.has(String(f.properties.id_projeto))
      ),
    };
  }

  // ─── 24h helper ────────────────────────────────────────
  function isWithin24h(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(d)) return false;
    return (Date.now() - d.getTime()) <= 24 * 60 * 60 * 1000;
  }

  function applyFilters(geojson) {
    const iface = $filterInterface.value;
    const olt = $filterOlt.value;
    const status = $filterStatus.value;
    const ativo = $filterAtivo.value;
    const auth = $filterAutenticacao.value;
    const tx = $filterTransmissao.value;
    if (!iface && !olt && !status && !ativo && !auth && !tx) return geojson;
    return {
      ...geojson,
      features: geojson.features.filter((f) => {
        const p = f.properties;
        if (iface && p.conexao !== iface) return false;
        if (olt && p.olt !== olt) return false;
        // Status (Ativo/Inativo)
        if (ativo === 'ativo' && !p.ativo) return false;
        if (ativo === 'inativo' && p.ativo) return false;
        // Status de acesso — usa ultima_conexao_final para cálculo de 24h
        if (status === 'online' && !p.online) return false;
        if (status === 'online_24h' && (!p.online || !isWithin24h(p.ultima_conexao_final))) return false;
        if (status === 'offline' && p.online) return false;
        if (status === 'offline_24h' && (p.online || !isWithin24h(p.ultima_conexao_final))) return false;
        if (status === 'all_24h' && !isWithin24h(p.ultima_conexao_final)) return false;
        // Autenticação
        if (auth && p.autenticacao !== auth) return false;
        // Tipo de conexão
        if (tx && p.transmissao !== tx) return false;
        return true;
      }),
    };
  }

  function populateFilters(loginsGeoJSON) {
    const interfaces = new Set();
    const olts = new Set();
    for (const f of loginsGeoJSON.features) {
      if (f.properties.conexao) interfaces.add(f.properties.conexao);
      if (f.properties.olt) olts.add(f.properties.olt);
    }
    const prevIface = $filterInterface.value;
    const prevOlt = $filterOlt.value;
    $filterInterface.innerHTML = '<option value="">Todas</option>' +
      [...interfaces].sort().map((v) =>
        `<option value="${v}"${v === prevIface ? ' selected' : ''}>${v}</option>`
      ).join('');
    $filterOlt.innerHTML = '<option value="">Todas</option>' +
      [...olts].sort().map((v) =>
        `<option value="${v}"${v === prevOlt ? ' selected' : ''}>${v}</option>`
      ).join('');
    $filterInterface.classList.toggle('filter-active', !!prevIface);
    $filterOlt.classList.toggle('filter-active', !!prevOlt);
  }

  // ─── Camadas que se escondem quando filtro está ativo ─────
  const nonLoginLayerNames = [
    'caixaEmenda', 'cabos', 'postes', 'caixaSubterranea',
    'outrosElementos', 'caixasFtth', 'pops', 'onus',
  ];
  let layersHiddenByFilter = [];   // guarda quais camadas foram escondidas pelo filtro

  function hideNonLoginLayers() {
    layersHiddenByFilter = [];
    for (const name of nonLoginLayerNames) {
      if (map.hasLayer(layers[name])) {
        map.removeLayer(layers[name]);
        layersHiddenByFilter.push(name);
      }
    }
  }

  function restoreNonLoginLayers() {
    for (const name of layersHiddenByFilter) {
      map.addLayer(layers[name]);
    }
    layersHiddenByFilter = [];
  }

  // ─── Raw data store (para re-render nos filtros sem refetch) ──
  const rawData = {};

  // ─── Text search helper ────────────────────────────────
  function matchesSearch(properties, term) {
    if (!term) return true;
    const lower = term.toLowerCase();
    return Object.values(properties).some((v) => {
      if (v === null || v === undefined || v === false) return false;
      return String(v).toLowerCase().includes(lower);
    });
  }

  function filterBySearch(geojson, term) {
    if (!term) return geojson;
    return {
      ...geojson,
      features: geojson.features.filter((f) => matchesSearch(f.properties, term)),
    };
  }

  function renderLoginsWithFilters() {
    if (!rawData.loginsAll) return;
    const searchTerm = $searchInput.value.trim();
    const logins = filterBySearch(applyFilters(filterByProjeto(rawData.loginsAll, rawData.idProjetos)), searchTerm);
    renderPointLayer(logins, layers.logins, (p) => (p.online ? '#2ecc71' : '#e74c3c'), (p) => ({
      Login: p.login,
      Status: p.online ? '🟢 Online' : '🔴 Offline',
      Ativo: p.ativo ? 'Sim' : 'Não',
      Conexão: p.conexao,
      OLT: p.olt,
      Autenticação: p.autenticacao,
      Transmissão: p.transmissao,
      Concentrador: p.concentrador,
    }));

    $filterInterface.classList.toggle('filter-active', !!$filterInterface.value);
    $filterOlt.classList.toggle('filter-active', !!$filterOlt.value);
    $filterStatus.classList.toggle('filter-active', !!$filterStatus.value);
    $filterAtivo.classList.toggle('filter-active', !!$filterAtivo.value);
    $filterAutenticacao.classList.toggle('filter-active', !!$filterAutenticacao.value);
    $filterTransmissao.classList.toggle('filter-active', !!$filterTransmissao.value);

    const anyFilter = $filterInterface.value || $filterOlt.value || $filterStatus.value || $filterAtivo.value || $filterAutenticacao.value || $filterTransmissao.value || searchTerm;
    const total = layers.logins.getLayers().length;

    if (anyFilter) {
      // Esconder camadas que confundem a visualização dos filtros
      hideNonLoginLayers();
      // Zoom nos pontos filtrados
      if (total > 0) {
        const bounds = layers.logins.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
      }
      setStatus(`Filtrado: ${total} logins`);
    } else {
      // Restaurar camadas quando filtro limpo
      restoreNonLoginLayers();
      setStatus('Pronto');
    }
  }

  // ─── CTO filter logic ───────────────────────────────────
  function applyCtoFilters(geojson) {
    const status = $ctoStatus.value;
    const portas = $ctoPortas.value;
    const capacidade = $ctoCapacidade.value;
    const transmissor = $ctoTransmissor.value.trim().toLowerCase();
    const interfaceFibra = $ctoInterfaceFibra.value.trim().toLowerCase();
    const tecnologia = $ctoTecnologia.value.trim().toLowerCase();
    const estilo = $ctoEstilo.value.trim().toLowerCase();

    if (!status && !portas && !capacidade && !transmissor && !interfaceFibra && !tecnologia && !estilo) return geojson;

    return {
      ...geojson,
      features: geojson.features.filter((f) => {
        const p = f.properties;

        // Status
        if (status === 'ativo' && p.status !== 'A') return false;
        if (status === 'inativo' && p.status === 'A') return false;

        // Portas disponíveis (capacidade - ONUs conectadas)
        const disp = parseInt(p.portas_disponiveis);
        if (portas === '0' && disp !== 0) return false;
        if (portas === '1-3' && (disp < 1 || disp > 3)) return false;
        if (portas === '4-8' && (disp < 4 || disp > 8)) return false;
        if (portas === '8+' && disp <= 8) return false;

        // Capacidade total
        const cap = parseInt(p.capacidade) || 0;
        if (capacidade === '1-4' && cap > 4) return false;
        if (capacidade === '5-8' && (cap < 5 || cap > 8)) return false;
        if (capacidade === '9-16' && (cap < 9 || cap > 16)) return false;
        if (capacidade === '16+' && cap <= 16) return false;

        // Text fields
        if (transmissor && !String(p.id_transmissor).toLowerCase().includes(transmissor)) return false;
        if (interfaceFibra && !String(p.id_interface).toLowerCase().includes(interfaceFibra)) return false;
        if (tecnologia && !String(p.id_tecnologia).toLowerCase().includes(tecnologia)) return false;
        if (estilo && !String(p.estilo).toLowerCase().includes(estilo)) return false;

        return true;
      }),
    };
  }

  function getCtoColor(props) {
    const mode = $ctoColorir.value;
    if (mode === 'status') return props.status === 'A' ? '#2ecc71' : '#e74c3c';
    if (mode === 'portas') {
      const disp = parseInt(props.portas_disponiveis);
      if (disp === 0) return '#e74c3c';
      if (disp <= 3) return '#f39c12';
      if (disp <= 8) return '#3498db';
      return '#2ecc71';
    }
    if (mode === 'capacidade') {
      const cap = parseInt(props.capacidade) || 0;
      if (cap <= 4) return '#95a5a6';
      if (cap <= 8) return '#f39c12';
      if (cap <= 16) return '#3498db';
      return '#2ecc71';
    }
    return '#3498db'; // padrão
  }

  function renderCtoWithFilters() {
    if (!rawData.caixasFtthAll) return;
    const searchTerm = $searchInput.value.trim();
    const idProjetos = $ctoOutrosProjetos.checked ? null : rawData.idProjetos;
    const caixas = filterBySearch(applyCtoFilters(filterByProjeto(rawData.caixasFtthAll, idProjetos)), searchTerm);

    const showDesc = $ctoExibirDescricao.checked;

    layers.caixasFtth.clearLayers();
    if (!caixas.features) return;

    for (const feature of caixas.features) {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties;
      const marker = L.circleMarker([lat, lng], {
        radius: 5,
        fillColor: getCtoColor(props),
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.9,
      });
      marker.bindPopup(popupHTML({
        Nome: props.nome,
        Tipo: 'CTO',
        Status: props.status === 'A' ? 'Ativo' : 'Inativo',
        Capacidade: props.capacidade,
        'Portas Usadas': props.portas_usadas,
        'Portas Disponíveis': props.portas_disponiveis,
        Endereço: props.endereco,
        Transmissor: props.id_transmissor,
        Interface: props.id_interface,
        Tecnologia: props.id_tecnologia,
      }));
      if (showDesc && props.nome) {
        marker.bindTooltip(props.nome, { permanent: true, direction: 'right', className: 'cto-label', offset: [8, 0] });
      }
      layers.caixasFtth.addLayer(marker);
    }

    setStatus(`CTOs: ${caixas.features.length}`);
  }

  // ─── Categorize element by tipo_nome / categoria ──────
  // Map known names to our layer groups
  function categorizeElemento(props) {
    const nome = (props.tipo_nome || '').toLowerCase();
    const cat = (props.categoria || '').toLowerCase();

    if (props.classificacao !== 'Point') return 'cabos';
    if (nome.includes('emenda') || cat.includes('emenda')) return 'caixaEmenda';
    if (nome.includes('poste') || cat.includes('poste')) return 'postes';
    if (nome.includes('subterr') || cat.includes('subterr')) return 'caixaSubterranea';
    return 'outrosElementos';
  }

  // ─── Render elementos (GeoJSON from backend) ─────────
  function renderElementos(geojson) {
    // Clear all element layers
    ['caixaEmenda', 'cabos', 'postes', 'caixaSubterranea', 'outrosElementos'].forEach((k) =>
      layers[k].clearLayers()
    );

    if (!geojson.features || geojson.features.length === 0) {
      console.log('[FiberMap] renderElementos: nenhuma feature para renderizar');
      return;
    }

    const lineCount = geojson.features.filter(f => f.geometry.type === 'LineString').length;
    const pointCount = geojson.features.filter(f => f.geometry.type === 'Point').length;
    console.log(`[FiberMap] renderElementos: ${lineCount} linhas (cabos), ${pointCount} pontos`);

    for (const feature of geojson.features) {
      const props = feature.properties;
      const layerName = categorizeElemento(props);

      if (feature.geometry.type === 'LineString') {
        // Cable / line
        const coords = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        const line = L.polyline(coords, {
          color: props.cor_ativa || '#3498db',
          weight: props.espessura || 2,
          dashArray: props.pontilhada ? '8, 6' : null,
          opacity: 0.85,
        });
        line.feature = feature; // Guardar referência para filtros
        line.bindPopup(popupHTML({
          Tipo: props.tipo_nome,
          Descrição: props.descricao,
          Fibras: props.cabo_fibras,
          'Loose Tube': props.cabo_loose_tube,
          'Padrão': caboPadraoLabel(props.cabo_padrao),
          Fabricante: props.fabricante,
          Modelo: props.modelo,
        }));
        layers.cabos.addLayer(line);
      } else {
        // Point
        const [lng, lat] = feature.geometry.coordinates;
        const marker = L.circleMarker([lat, lng], {
          radius: 6,
          fillColor: props.cor_ativa || '#e74c3c',
          color: props.cor_fundo || '#fff',
          weight: 2,
          fillOpacity: 0.9,
        });
        marker.bindPopup(popupHTML({
          Tipo: props.tipo_nome,
          Descrição: props.descricao,
          Categoria: props.categoria,
        }));
        layers[layerName].addLayer(marker);
      }
    }
  }

  // ─── Render simple point layers (CTO, POP, Logins, ONUs) ──
  function renderPointLayer(geojson, targetLayer, color, popupMapper) {
    targetLayer.clearLayers();
    if (!geojson.features) return;

    for (const feature of geojson.features) {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties;
      const marker = L.circleMarker([lat, lng], {
        radius: 5,
        fillColor: color(props),
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.9,
      });
      marker.bindPopup(popupHTML(popupMapper(props)));
      targetLayer.addLayer(marker);
    }
  }

  // ─── Load projetos ────────────────────────────────────
  async function loadProjetos() {
    try {
      setStatus('Carregando projetos...');
      const projetos = await fetchJSON(`${API}/projetos`);
      allProjetos = projetos.map((p) => ({
        id: p.id,
        nome: p.nome,
        latitude: p.latitude || '',
        longitude: p.longitude || '',
        zoom: p.zoom || '',
      }));
      renderDropdown('');
      setStatus(`${projetos.length} projetos carregados`);
    } catch (err) {
      setStatus('Erro ao carregar projetos: ' + err.message);
    }
  }

  // ─── Load all data for selected projects ───────────────
  async function loadAllData() {
    const ids = getSelectedIds();
    if (ids.length === 0) {
      // Clear all layers when no project selected
      Object.values(layers).forEach((lg) => { if (lg.clearLayers) lg.clearLayers(); });
      rawData.loginsAll = null;
      rawData.elementos = null;
      setStatus('Selecione um projeto');
      return;
    }

    const isAll = isAllSelected();
    const idProjetos = isAll ? null : ids;  // null = todos

    showLoading(true);
    setStatus('Carregando dados...');

    try {
      // Fetch elementos para cada projeto selecionado (ou skip se "todos")
      const elementosFetches = isAll
        ? [Promise.resolve({ type: 'FeatureCollection', features: [] })]
        : ids.map((id) => fetchJSON(`${API}/elementos/${encodeURIComponent(id)}`));

      const [caixasFtthAll, loginsAll, onusAll, popsAll, ...elementosArr] = await Promise.all([
        fetchJSON(`${API}/caixas-ftth`),
        fetchJSON(`${API}/logins`),
        fetchJSON(`${API}/onus`),
        fetchJSON(`${API}/pops`),
        ...elementosFetches,
      ]);

      // Merge all elementos into one FeatureCollection
      const elementos = {
        type: 'FeatureCollection',
        features: elementosArr.flatMap((e) => e.features || []),
      };

      // Guardar dados crus para re-render nos filtros sem refetch
      rawData.loginsAll = loginsAll;
      rawData.caixasFtthAll = caixasFtthAll;
      rawData.onusAll = onusAll;
      rawData.popsAll = popsAll;
      rawData.elementos = elementos;
      rawData.idProjetos = idProjetos;
      rawData.isAll = isAll;

      // Filtrar por projeto e busca
      const searchTerm = $searchInput.value.trim();
      const pops = filterBySearch(filterByProjeto(popsAll, idProjetos), searchTerm);

      // Popular dropdowns com valores únicos dos projetos atuais
      populateFilters(filterByProjeto(loginsAll, idProjetos));

      // Render elementos (cabos, caixas de emenda, postes, etc)
      console.log(`[FiberMap] Elementos carregados: ${elementos.features.length} features`);
      renderElementos(elementos);
      populateCaboDropdowns();

      // Render point layers — CTO with filters
      renderCtoWithFilters();

      // Logins com filtros ativos
      renderLoginsWithFilters();

      renderOnusWithFilters();
      populateOnuDropdowns();

      renderPointLayer(pops, layers.pops, () => '#e67e22', (p) => ({
        Nome: p.nome,
        Tipo: 'POP',
        Endereço: p.endereco,
      }));

      // Count features
      const totalFeatures =
        elementos.features.length +
        layers.caixasFtth.getLayers().length +
        layers.logins.getLayers().length +
        layers.onus.getLayers().length +
        pops.features.length;

      const label = isAll ? '' : ` em ${ids.length} projeto${ids.length > 1 ? 's' : ''}`;
      setStatus(`${totalFeatures} elementos${label}`);

      // Auto-fit map bounds to visible data
      const allBounds = [];
      Object.values(layers).forEach((lg) => {
        if (map.hasLayer(lg) && lg.getLayers && lg.getLayers().length > 0) {
          try {
            const b = lg.getBounds();
            if (b.isValid()) allBounds.push(b);
          } catch {}
        }
      });
      if (allBounds.length > 0) {
        const combined = L.latLngBounds(allBounds[0]);
        for (let i = 1; i < allBounds.length; i++) combined.extend(allBounds[i]);
        if (combined.isValid()) {
          map.fitBounds(combined, { padding: [40, 40], maxZoom: 16 });
        }
      }
    } catch (err) {
      setStatus('Erro: ' + err.message);
      console.error(err);
    } finally {
      showLoading(false);
    }
  }

  // ─── Events ────────────────────────────────────────────

  $btnRefresh.addEventListener('click', loadAllData);

  $filterInterface.addEventListener('change', renderLoginsWithFilters);
  $filterOlt.addEventListener('change', renderLoginsWithFilters);
  $filterStatus.addEventListener('change', renderLoginsWithFilters);
  $filterAtivo.addEventListener('change', renderLoginsWithFilters);
  $filterAutenticacao.addEventListener('change', renderLoginsWithFilters);
  $filterTransmissao.addEventListener('change', renderLoginsWithFilters);

  $btnClearFilters.addEventListener('click', () => {
    $filterInterface.value = '';
    $filterOlt.value = '';
    $filterStatus.value = '';
    $filterAtivo.value = '';
    $filterAutenticacao.value = '';
    $filterTransmissao.value = '';
    $searchInput.value = '';
    $btnClearSearch.classList.add('hidden');
    if (rawData.elementos) renderElementos(rawData.elementos);
    renderAllWithSearch();
  });

  // CTO filter events
  $ctoExibirDescricao.addEventListener('change', renderCtoWithFilters);
  $ctoOutrosProjetos.addEventListener('change', renderCtoWithFilters);
  $ctoColorir.addEventListener('change', renderCtoWithFilters);
  $ctoStatus.addEventListener('change', renderCtoWithFilters);
  $ctoPortas.addEventListener('change', renderCtoWithFilters);
  $ctoCapacidade.addEventListener('change', renderCtoWithFilters);

  let ctoSearchTimeout;
  [$ctoTransmissor, $ctoInterfaceFibra, $ctoTecnologia, $ctoEstilo].forEach((el) => {
    el.addEventListener('input', () => {
      clearTimeout(ctoSearchTimeout);
      ctoSearchTimeout = setTimeout(renderCtoWithFilters, 300);
    });
  });

  $btnClearCtoFilters.addEventListener('click', () => {
    $ctoExibirDescricao.checked = false;
    $ctoOutrosProjetos.checked = false;
    $ctoColorir.value = 'padrao';
    $ctoStatus.value = '';
    $ctoPortas.value = '';
    $ctoCapacidade.value = '';
    $ctoTransmissor.value = '';
    $ctoInterfaceFibra.value = '';
    $ctoTecnologia.value = '';
    $ctoEstilo.value = '';
    renderCtoWithFilters();
  });

  // ─── Cable (Cabo) filter logic ─────────────────────────

  // Mapeamento de código IXC → nome legível do padrão
  const CABO_PADRAO_MAP = { A: 'ABNT', E: 'EIA598-A' };
  function caboPadraoLabel(code) { return CABO_PADRAO_MAP[code] || code; }

  // Populate dynamic dropdown options from loaded cable data
  function populateCaboDropdowns() {
    if (!rawData.elementos || !rawData.elementos.features) return;
    const cables = rawData.elementos.features.filter((f) => f.geometry.type === 'LineString');

    // Padrão
    const padroes = [...new Set(cables.map((c) => c.properties.cabo_padrao).filter(Boolean))].sort();
    $caboPadrao.innerHTML = '<option value="">Todos</option>' +
      padroes.map((p) => `<option value="${p}">${caboPadraoLabel(p)}</option>`).join('');

    // Fibras
    const fibras = [...new Set(cables.map((c) => c.properties.cabo_fibras).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    $caboFibras.innerHTML = '<option value="">Todas</option>' +
      fibras.map((f) => `<option value="${f}">${f}</option>`).join('');
  }

  function renderCabosWithFilters() {
    if (!rawData.elementos || !rawData.elementos.features) return;

    const filtroTipo = ($caboTipo.value || '').trim().toLowerCase();
    const filtroPadrao = $caboPadrao.value;
    const filtroFibras = $caboFibras.value;
    const filtroFab = ($caboFabricante.value || '').trim().toLowerCase();
    const filtroModelo = ($caboModelo.value || '').trim().toLowerCase();
    const mostrarOutros = $caboOutrosProjetos.checked;
    const mostrarDirecao = $caboDirecao.checked;

    layers.cabos.clearLayers();
    layers.caboArrows.clearLayers();

    const cables = rawData.elementos.features.filter((f) => f.geometry.type === 'LineString');

    for (const feature of cables) {
      const p = feature.properties;

      // Filtro por projeto
      if (!mostrarOutros && rawData.idProjetos && rawData.idProjetos.length > 0) {
        const projSet = new Set(rawData.idProjetos.map(String));
        if (p.id_projeto && !projSet.has(String(p.id_projeto))) continue;
      }

      // Filtro por tipo (nome)
      if (filtroTipo && !(p.tipo_nome || '').toLowerCase().includes(filtroTipo)) continue;

      // Filtro por padrão
      if (filtroPadrao && p.cabo_padrao !== filtroPadrao) continue;

      // Filtro por fibras
      if (filtroFibras && String(p.cabo_fibras) !== filtroFibras) continue;

      // Filtro por fabricante
      if (filtroFab && !(p.fabricante || '').toLowerCase().includes(filtroFab)) continue;

      // Filtro por modelo
      if (filtroModelo && !(p.modelo || '').toLowerCase().includes(filtroModelo)) continue;

      const coords = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const line = L.polyline(coords, {
        color: p.cor_ativa || '#3498db',
        weight: p.espessura || 2,
        dashArray: p.pontilhada ? '8, 6' : null,
        opacity: 0.85,
      });
      line.feature = feature;
      line.bindPopup(popupHTML({
        Tipo: p.tipo_nome,
        Descrição: p.descricao,
        Fibras: p.cabo_fibras,
        'Loose Tube': p.cabo_loose_tube,
        'Padrão': caboPadraoLabel(p.cabo_padrao),
        Fabricante: p.fabricante,
        Modelo: p.modelo,
      }));
      layers.cabos.addLayer(line);

      // Setas de direção
      if (mostrarDirecao && coords.length >= 2) {
        addDirectionArrows(coords, p.cor_ativa || '#3498db', p.espessura || 2);
      }
    }
  }

  // Adicionar setas de direção ao longo de uma polyline
  function addDirectionArrows(coords, color, weight) {
    const minSegLen = 0.0003; // graus (~30m), mínimo para mostrar seta
    for (let i = 0; i < coords.length - 1; i++) {
      const [lat1, lng1] = coords[i];
      const [lat2, lng2] = coords[i + 1];
      const dx = lng2 - lng1;
      const dy = lat2 - lat1;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (segLen < minSegLen) continue;

      // Ponto médio do segmento
      const midLat = (lat1 + lat2) / 2;
      const midLng = (lng1 + lng2) / 2;

      // Ângulo em graus (0 = leste, sentido anti-horário)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      const arrowIcon = L.divIcon({
        className: 'cabo-arrow',
        html: `<svg viewBox="0 0 12 12" width="12" height="12" style="transform:rotate(${-angle + 90}deg)">
          <path d="M6 0L12 12L6 8L0 12Z" fill="${color}" opacity="0.9"/>
        </svg>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      layers.caboArrows.addLayer(L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }));
    }
  }

  // Cabo filter events
  $caboDirecao.addEventListener('change', renderCabosWithFilters);
  $caboOutrosProjetos.addEventListener('change', renderCabosWithFilters);
  $caboReservas.addEventListener('change', renderCabosWithFilters);
  $caboPadrao.addEventListener('change', renderCabosWithFilters);
  $caboFibras.addEventListener('change', renderCabosWithFilters);

  let caboSearchTimeout;
  [$caboTipo, $caboFabricante, $caboModelo].forEach((el) => {
    el.addEventListener('input', () => {
      clearTimeout(caboSearchTimeout);
      caboSearchTimeout = setTimeout(renderCabosWithFilters, 300);
    });
  });

  $btnClearCaboFilters.addEventListener('click', () => {
    $caboDirecao.checked = false;
    $caboOutrosProjetos.checked = false;
    $caboReservas.checked = false;
    $caboTipo.value = '';
    $caboPadrao.value = '';
    $caboFibras.value = '';
    $caboFabricante.value = '';
    $caboModelo.value = '';
    renderCabosWithFilters();
  });

  // ─── ONU filter logic ──────────────────────────────────

  // Transmitter name map (id_transmissor → name)
  const TRANSMISSOR_MAP = {
    '1': 'CACHOEIRINHA-CENTRO', '2': 'POP', '3': 'OLT',
    '4': 'OLT_RIACHO_FECHADO', '5': 'TAPIRAIM', '6': 'POP IBRA/ALTO',
    '7': 'POP_IBIRAJUBA', '8': 'OLT_VARZEA DA COBRA', '9': 'POP ITUGUAÇU',
    '10': 'CHURRASCARIA',
  };
  function transmissorLabel(id) { return TRANSMISSOR_MAP[String(id)] || id || ''; }

  // Color palettes
  const POTENCIA_COLORS = {
    'gt-10': '#e74c3c',    // > -10 (muito alto, possível problema)
    '-11:-20': '#2ecc71',  // -11 a -20 (ótimo)
    '-21:-23': '#27ae60',  // -21 a -23 (bom)
    '-24:-26': '#f1c40f',  // -24 a -26 (regular)
    '-27:-30': '#f39c12',  // -27 a -30 (atenção)
    '-31:-35': '#e67e22',  // -31 a -35 (ruim)
    'lt-36':   '#e74c3c',  // < -36 (crítico)
    'none':    '#9b59b6',  // sem sinal
  };

  const STATUS_COLORS = {
    regular: '#2ecc71',
    irregular: '#e74c3c',
    indefinido: '#9b59b6',
  };

  // Auto-generate tipo colors
  const tipoColorCache = {};
  let tipoHue = 0;
  function tipoColor(tipo) {
    if (!tipo) return '#9b59b6';
    if (tipoColorCache[tipo]) return tipoColorCache[tipo];
    tipoHue = (tipoHue + 47) % 360; // golden angle-ish distribution
    tipoColorCache[tipo] = `hsl(${tipoHue}, 70%, 50%)`;
    return tipoColorCache[tipo];
  }

  function classifyPotencia(rx) {
    if (isNaN(rx)) return 'none';
    if (rx > -10) return 'gt-10';
    if (rx >= -20) return '-11:-20';
    if (rx >= -23) return '-21:-23';
    if (rx >= -26) return '-24:-26';
    if (rx >= -30) return '-27:-30';
    if (rx >= -35) return '-31:-35';
    return 'lt-36';
  }

  function classifyStatus(rx) {
    if (isNaN(rx)) return 'indefinido';
    if (rx > -25) return 'regular';
    return 'irregular';
  }

  function onuColor(p) {
    const mode = $onuColorir.value;
    const rx = parseFloat(p.sinal_rx);
    if (mode === 'status') return STATUS_COLORS[classifyStatus(rx)] || '#9b59b6';
    if (mode === 'tipo') return tipoColor(p.onu_tipo);
    // default: potencia
    return POTENCIA_COLORS[classifyPotencia(rx)] || '#9b59b6';
  }

  function onuPopupMapper(p) {
    return {
      ID: p.id,
      Nome: p.nome,
      Tipo: 'ONU',
      'Tipo Autenticação': p.tipo_autenticacao || '',
      MAC: p.mac,
      'Sinal RX': p.sinal_rx ? p.sinal_rx + ' dBm' : '',
      'Sinal TX': p.sinal_tx ? p.sinal_tx + ' dBm' : '',
      Temperatura: p.temperatura ? p.temperatura + '°C' : '',
      Voltagem: p.voltagem ? p.voltagem + ' V' : '',
      'Tipo ONU': p.onu_tipo || '',
      Transmissor: transmissorLabel(p.id_transmissor),
      CTO: p.id_caixa_ftth,
      'Porta FTTH': p.porta_ftth,
      'Última atualização': p.data_sinal || '',
      Compartilhada: p.compartilhada || '',
    };
  }

  function populateOnuDropdowns() {
    if (!rawData.onusAll || !rawData.onusAll.features) return;
    const idProjetos = rawData.idProjetos;
    const projSet = idProjetos ? new Set(idProjetos.map(String)) : null;
    const feats = rawData.onusAll.features.filter((f) =>
      !projSet || projSet.has(String(f.properties.id_projeto)) || $onuOutrosProjetos.checked
    );
    const tipos = [...new Set(feats.map((f) => f.properties.onu_tipo).filter(Boolean))].sort();
    $onuTipo.innerHTML = '<option value="">Todas</option>' +
      tipos.map((t) => `<option value="${t}">${t}</option>`).join('');
  }

  function renderOnusWithFilters() {
    if (!rawData.onusAll || !rawData.onusAll.features) return;

    const searchTerm = $searchInput.value.trim();
    const idProjetos = rawData.idProjetos;
    const mostrarOutros = $onuOutrosProjetos.checked;
    const filtroTipo = $onuTipo.value;
    const filtroStatus = $onuStatusPotencia.value;
    const filtroPotencia = $onuPotencia.value;
    const filtroTransmissor = ($onuTransmissor.value || '').trim().toLowerCase();

    let filtered = rawData.onusAll;

    // Filtro por projeto
    if (!mostrarOutros && idProjetos) {
      filtered = filterByProjeto(filtered, idProjetos);
    }

    // Filtro por busca
    filtered = filterBySearch(filtered, searchTerm);

    // Filtros adicionais no features
    filtered = {
      type: 'FeatureCollection',
      features: filtered.features.filter((f) => {
        const p = f.properties;
        const rx = parseFloat(p.sinal_rx);

        // Tipo
        if (filtroTipo && p.onu_tipo !== filtroTipo) return false;

        // Status de potência
        if (filtroStatus && classifyStatus(rx) !== filtroStatus) return false;

        // Faixa de potência
        if (filtroPotencia && classifyPotencia(rx) !== filtroPotencia) return false;

        // Transmissor (busca por nome)
        if (filtroTransmissor) {
          const txName = transmissorLabel(p.id_transmissor).toLowerCase();
          if (!txName.includes(filtroTransmissor)) return false;
        }

        return true;
      }),
    };

    renderPointLayer(filtered, layers.onus, (p) => onuColor(p), onuPopupMapper);
  }

  // ONU filter events
  $onuOutrosProjetos.addEventListener('change', () => { populateOnuDropdowns(); renderOnusWithFilters(); });
  $onuColorir.addEventListener('change', renderOnusWithFilters);
  $onuTipo.addEventListener('change', renderOnusWithFilters);
  $onuStatusPotencia.addEventListener('change', renderOnusWithFilters);
  $onuPotencia.addEventListener('change', renderOnusWithFilters);

  let onuSearchTimeout;
  $onuTransmissor.addEventListener('input', () => {
    clearTimeout(onuSearchTimeout);
    onuSearchTimeout = setTimeout(renderOnusWithFilters, 300);
  });

  $btnClearOnuFilters.addEventListener('click', () => {
    $onuOutrosProjetos.checked = false;
    $onuColorir.value = 'potencia';
    $onuTipo.value = '';
    $onuStatusPotencia.value = '';
    $onuPotencia.value = '';
    $onuTransmissor.value = '';
    populateOnuDropdowns();
    renderOnusWithFilters();
  });

  $btnClearCache.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API}/cache/clear`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('Cache limpo. Clique em Atualizar.');
    } catch (err) {
      setStatus('Erro ao limpar cache: ' + err.message);
    }
  });

  // Keyboard shortcut: Escape to close dropdown
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  // ─── Re-render all layers with current search term ────
  function renderAllWithSearch() {
    if (!rawData.loginsAll) return;
    const searchTerm = $searchInput.value.trim();
    const idProjetos = rawData.idProjetos;

    // Re-render logins (respects dropdown filters + search)
    renderLoginsWithFilters();

    // Re-render CTO (respects CTO filters + search)
    renderCtoWithFilters();

    // Re-render cabos (respects cabo filters)
    renderCabosWithFilters();

    // Re-render ONUs
    renderOnusWithFilters();

    // Re-render POPs
    if (rawData.popsAll) {
      const pops = filterBySearch(filterByProjeto(rawData.popsAll, idProjetos), searchTerm);
      renderPointLayer(pops, layers.pops, () => '#e67e22', (p) => ({
        Nome: p.nome,
        Tipo: 'POP',
        Endereço: p.endereco,
      }));
    }
  }

  // ─── Search input with debounce ────────────────────────
  let searchTimeout;
  $searchInput.addEventListener('input', () => {
    const val = $searchInput.value;
    $btnClearSearch.classList.toggle('hidden', val === '');
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (val.trim() === '' && rawData.elementos) {
        // Busca limpa: restaurar elementos (cabos) e re-render tudo
        renderElementos(rawData.elementos);
      }
      renderAllWithSearch();
    }, 300);
  });

  $btnClearSearch.addEventListener('click', () => {
    $searchInput.value = '';
    $btnClearSearch.classList.add('hidden');
    if (rawData.elementos) renderElementos(rawData.elementos);
    renderAllWithSearch();
    $searchInput.focus();
  });

  // ─── Sidebar tabs ──────────────────────────────────────
  document.querySelectorAll('.sidebar-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.sidebar-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');
    });
  });

  // ─── Init ──────────────────────────────────────────────
  loadProjetos();
})();
