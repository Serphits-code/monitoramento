(function () {
  'use strict';

  const API = '/api';
  const API_OS = '/api/os';
  const API_MON = '/api/monitoramento';
  const POLL_MS = 5000;

  const CORES = {
    1: '#e74c3c',
    2: '#3498db',
    3: '#2ecc71',
    4: '#f39c12',
  };
  const CORES_FALLBACK = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#c0392b'];

  const $data = document.getElementById('data-monitoramento');
  const $tecnico = document.getElementById('tecnico-select');
  const $modoLive = document.getElementById('modo-live');
  const $status = document.getElementById('status');
  const $container = document.getElementById('tecnicos-container');
  const $projeto = document.getElementById('projeto-select');
  const $loading = document.getElementById('loading');
  const $loadingText = document.getElementById('loading-text');

  function todayLocal() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().split('T')[0];
  }

  $data.value = todayLocal();

  const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
    worldCopyJump: false,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0,
    maxZoom: 20,
  }).setView([-8.49, -36.24], 13);

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 20, maxNativeZoom: 19, noWrap: true,
  });
  const googleStreetLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20, noWrap: true,
  });
  const googleSatLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20, noWrap: true,
  });
  const googleHybridLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: '&copy; Google', maxZoom: 20, maxNativeZoom: 20, noWrap: true,
  });
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Esri', maxZoom: 20, maxNativeZoom: 18, noWrap: true,
  });

  osmLayer.addTo(map);
  L.control.layers({
    OSM: osmLayer,
    'Google Ruas': googleStreetLayer,
    'Google Satelite': googleSatLayer,
    'Google Hibrido': googleHybridLayer,
    'Satelite Esri': satelliteLayer,
  }, {}, { position: 'topright' }).addTo(map);

  const historyLayer = L.layerGroup().addTo(map);
  const liveLayer = L.layerGroup().addTo(map);
  const stopLayer = L.layerGroup().addTo(map);
  const endpointLayer = L.layerGroup().addTo(map);
  const coverageLayers = {
    caixasFtth: L.layerGroup(),
    logins: L.layerGroup(),
    onus: L.layerGroup(),
    pops: L.layerGroup(),
    elementos: L.layerGroup(),
  };
  const loadedCoverage = {};

  let tecnicos = [];
  let liveState = [];
  let historyRoutes = [];
  let pollTimer = null;

  function corTecnico(id) {
    return CORES[id] || CORES_FALLBACK[(Number(id) - 1) % CORES_FALLBACK.length];
  }

  function escapeHtml(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function setStatus(message) { $status.textContent = message; }
  function showLoading(show, message) {
    $loading.classList.toggle('hidden', !show);
    if (message) $loadingText.textContent = message;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.href = `/login?return=${encodeURIComponent(window.location.pathname)}`;
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function formatDuration(seconds) {
    if (seconds === null || seconds === undefined) return 'Sem dados';
    const value = Math.max(0, Number(seconds) || 0);
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = value % 60;
    if (h) return `${h}h ${m}min`;
    if (m) return `${m}min ${s}s`;
    return `${s}s`;
  }

  function formatDistance(meters) {
    const value = Number(meters) || 0;
    return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
  }

  function formatSpeed(speed) {
    if (speed === null || speed === undefined) return 'Sem dados';
    return `${Math.max(0, speed * 3.6).toFixed(1)} km/h`;
  }

  function formatTime(iso) {
    if (!iso) return 'Sem dados';
    return new Date(iso).toLocaleString('pt-BR');
  }

  function selectedTecnicoId() {
    return $tecnico.value ? Number($tecnico.value) : null;
  }

  function isLiveEnabled() {
    return $modoLive.checked && $data.value === todayLocal();
  }

  function techIcon(tech, status) {
    const initials = tech.nome.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    return L.divIcon({
      className: '',
      html: `<div class="tech-marker ${status}" style="background:${corTecnico(tech.id)}">${escapeHtml(initials)}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -18],
    });
  }

  function stopIcon() {
    return L.divIcon({ className: '', html: '<div class="stop-marker">P</div>', iconSize: [24, 24], iconAnchor: [12, 12] });
  }

  function endpointIcon(label, color) {
    return L.divIcon({
      className: '',
      html: `<div class="endpoint-marker" style="background:${color}">${label}</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  async function loadTecnicos() {
    tecnicos = await fetchJSON(`${API_OS}/tecnicos`) || [];
    $tecnico.innerHTML = '<option value="">Todos</option>' + tecnicos
      .map((tecnico) => `<option value="${tecnico.id}">${escapeHtml(tecnico.nome)}</option>`)
      .join('');
  }

  async function loadProjetos() {
    try {
      const projetos = await fetchJSON(`${API}/projetos`) || [];
      $projeto.innerHTML = '<option value="">Selecione</option>' + projetos
        .map((projeto) => `<option value="${escapeHtml(projeto.id)}">${escapeHtml(projeto.nome)}</option>`)
        .join('');
    } catch (err) {
      console.warn('[MONITORAMENTO] Projetos indisponiveis:', err.message);
    }
  }

  async function loadLive() {
    if (!isLiveEnabled()) {
      liveState = [];
      liveLayer.clearLayers();
      return;
    }
    const data = await fetchJSON(`${API_MON}/live`);
    liveState = data ? data.technicians : [];
    renderLive();
  }

  async function loadHistory() {
    const params = new URLSearchParams({ data: $data.value });
    if (selectedTecnicoId()) params.set('tecnico', selectedTecnicoId());
    const data = await fetchJSON(`${API_MON}/history?${params.toString()}`);
    historyRoutes = data ? data.routes : [];
    renderHistory();
  }

  function renderLive() {
    liveLayer.clearLayers();
    const filterId = selectedTecnicoId();

    liveState.forEach((item) => {
      if (filterId && item.id !== filterId) return;
      if (!item.latest) return;

      const marker = L.marker([item.latest.latitude, item.latest.longitude], {
        icon: techIcon(item, item.status),
        zIndexOffset: 2000,
      });
      marker.bindPopup(`
        <table class="popup-table">
          <tr><td>Tecnico</td><td>${escapeHtml(item.nome)}</td></tr>
          <tr><td>Status</td><td>${escapeHtml(item.status)}</td></tr>
          <tr><td>Ultimo GPS</td><td>${escapeHtml(formatTime(item.latest.captured_at))}</td></tr>
          <tr><td>Velocidade</td><td>${escapeHtml(formatSpeed(item.latest.speed))}</td></tr>
          <tr><td>Precisao</td><td>${item.latest.accuracy ? Math.round(item.latest.accuracy) + ' m' : 'Sem dados'}</td></tr>
          <tr><td>Bateria</td><td>${item.latest.battery ? Math.round(item.latest.battery) + '%' : 'Sem dados'}</td></tr>
        </table>
      `);
      liveLayer.addLayer(marker);
    });
  }

  function renderHistory() {
    historyLayer.clearLayers();
    stopLayer.clearLayers();
    endpointLayer.clearLayers();

    historyRoutes.forEach((route) => {
      const color = corTecnico(route.id_tecnico);
      const coords = route.route.geometry.coordinates.map((coord) => [coord[1], coord[0]]);
      if (coords.length >= 2) {
        L.polyline(coords, { color, weight: 5, opacity: 0.82, lineCap: 'round', lineJoin: 'round' }).addTo(historyLayer);
        L.marker(coords[0], { icon: endpointIcon('I', color) }).bindTooltip('Inicio da rota').addTo(endpointLayer);
        L.marker(coords[coords.length - 1], { icon: endpointIcon('F', color) }).bindTooltip('Fim da rota').addTo(endpointLayer);
      }

      route.stops.forEach((stop) => {
        const marker = L.marker([stop.center_latitude, stop.center_longitude], { icon: stopIcon(), zIndexOffset: 1500 });
        marker.bindPopup(`
          <table class="popup-table">
            <tr><td>Tecnico</td><td>${escapeHtml(route.tecnico_nome)}</td></tr>
            <tr><td>Inicio</td><td>${escapeHtml(formatTime(stop.started_at))}</td></tr>
            <tr><td>Fim</td><td>${escapeHtml(stop.ended_at ? formatTime(stop.ended_at) : 'Em andamento')}</td></tr>
            <tr><td>Duracao</td><td>${escapeHtml(formatDuration(stop.duration_seconds))}</td></tr>
            <tr><td>Raio</td><td>${Math.round(stop.radius_meters || 0)} m</td></tr>
          </table>
        `);
        marker.addTo(stopLayer);
      });
    });
  }

  function renderCards() {
    const filterId = selectedTecnicoId();
    const cards = tecnicos
      .filter((tecnico) => !filterId || tecnico.id === filterId)
      .map((tecnico) => {
        const live = liveState.find((item) => item.id === tecnico.id) || { status: 'offline', latest: null, age_seconds: null };
        const route = historyRoutes.find((item) => item.id_tecnico === tecnico.id);
        const stats = route ? route.stats : { points: 0, distance_meters: 0, stopped_seconds: 0, moving_seconds: 0 };
        const color = corTecnico(tecnico.id);
        const activeStop = live.active_stop;
        return `
          <div class="tecnico-card" style="border-left-color:${color}" data-id="${tecnico.id}">
            <div class="tecnico-card-header">
              <div class="tecnico-name"><span class="dot" style="background:${color}"></span><span>${escapeHtml(tecnico.nome)}</span></div>
              <span class="status-pill ${live.status}">${escapeHtml(live.status)}</span>
            </div>
            <div class="tecnico-body">
              <div class="metric-grid">
                <div class="metric"><label>Ultimo envio</label><strong>${escapeHtml(live.latest ? formatDuration(live.age_seconds) : 'Sem GPS')}</strong></div>
                <div class="metric"><label>Velocidade</label><strong>${escapeHtml(live.latest ? formatSpeed(live.latest.speed) : 'Sem dados')}</strong></div>
                <div class="metric"><label>Rota do dia</label><strong>${escapeHtml(formatDistance(stats.distance_meters))}</strong></div>
                <div class="metric"><label>Tempo parado</label><strong>${escapeHtml(formatDuration(stats.stopped_seconds))}</strong></div>
                <div class="metric"><label>Pontos</label><strong>${stats.points}</strong></div>
                <div class="metric"><label>Parada ativa</label><strong>${activeStop ? escapeHtml(formatDuration(activeStop.duration_seconds)) : 'Nao'}</strong></div>
              </div>
              <div class="tecnico-actions">
                <button class="btn btn-secondary" data-action="zoom" data-id="${tecnico.id}">Zoom</button>
                <button class="btn btn-secondary" data-action="solo" data-id="${tecnico.id}">Ver tecnico</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

    $container.innerHTML = cards || '<div class="status-bar">Nenhum tecnico encontrado</div>';
  }

  function fitAll() {
    const bounds = [];
    historyRoutes.forEach((route) => {
      route.route.geometry.coordinates.forEach((coord) => bounds.push([coord[1], coord[0]]));
      route.stops.forEach((stop) => bounds.push([stop.center_latitude, stop.center_longitude]));
    });
    liveState.forEach((item) => {
      if (item.latest) bounds.push([item.latest.latitude, item.latest.longitude]);
    });
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }

  function zoomTecnico(id) {
    const bounds = [];
    const route = historyRoutes.find((item) => item.id_tecnico === id);
    if (route) route.route.geometry.coordinates.forEach((coord) => bounds.push([coord[1], coord[0]]));
    const live = liveState.find((item) => item.id === id);
    if (live && live.latest) bounds.push([live.latest.latitude, live.latest.longitude]);
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  }

  async function refreshAll(showOverlay) {
    if (showOverlay) showLoading(true, 'Atualizando monitoramento...');
    try {
      await Promise.all([loadHistory(), loadLive()]);
      renderCards();
      setStatus(`Atualizado em ${new Date().toLocaleTimeString('pt-BR')} | ${historyRoutes.length} rota(s) no dia`);
    } catch (err) {
      setStatus(`Erro: ${err.message}`);
      console.error(err);
    } finally {
      if (showOverlay) showLoading(false);
    }
  }

  function resetPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (isLiveEnabled()) pollTimer = setInterval(() => refreshAll(false), POLL_MS);
  }

  function pointStyle(feature) {
    const props = feature.properties || {};
    if (props.online === true) return '#2ecc71';
    if (props.tipo === 'POP') return '#e67e22';
    if (props.tipo === 'ONU') return '#8e44ad';
    return '#3498db';
  }

  function renderGeoJson(layer, geojson) {
    layer.clearLayers();
    L.geoJSON(geojson, {
      pointToLayer(feature, latLng) {
        return L.circleMarker(latLng, {
          radius: 4,
          color: pointStyle(feature),
          fillColor: pointStyle(feature),
          fillOpacity: 0.78,
          weight: 1,
        });
      },
      style(feature) {
        const props = feature.properties || {};
        return {
          color: props.cor_ativa || '#5dade2',
          weight: props.espessura || 2,
          opacity: 0.72,
          dashArray: props.pontilhada ? '6, 5' : null,
        };
      },
      onEachFeature(feature, leafletLayer) {
        const props = feature.properties || {};
        const title = props.nome || props.descricao || props.login || props.tipo || 'Elemento';
        leafletLayer.bindTooltip(String(title), { sticky: true });
      },
    }).addTo(layer);
  }

  async function loadCoverageLayer(name) {
    if (loadedCoverage[name]) return;
    let url;
    if (name === 'caixasFtth') url = `${API}/caixas-ftth`;
    if (name === 'logins') url = `${API}/logins`;
    if (name === 'onus') url = `${API}/onus`;
    if (name === 'pops') url = `${API}/pops`;
    if (name === 'elementos') {
      if (!$projeto.value) throw new Error('Selecione um projeto para carregar cabos e elementos');
      url = `${API}/elementos/${encodeURIComponent($projeto.value)}`;
    }
    const geojson = await fetchJSON(url);
    renderGeoJson(coverageLayers[name], geojson || { type: 'FeatureCollection', features: [] });
    loadedCoverage[name] = true;
  }

  document.querySelectorAll('.layer-toggle').forEach((label) => {
    const name = label.dataset.layer;
    const checkbox = label.querySelector('input');
    checkbox.addEventListener('change', async () => {
      try {
        if (checkbox.checked) {
          await loadCoverageLayer(name);
          map.addLayer(coverageLayers[name]);
        } else {
          map.removeLayer(coverageLayers[name]);
        }
      } catch (err) {
        checkbox.checked = false;
        setStatus(err.message);
      }
    });
  });

  $projeto.addEventListener('change', () => {
    loadedCoverage.elementos = false;
    coverageLayers.elementos.clearLayers();
    const toggle = document.querySelector('.layer-toggle[data-layer="elementos"] input');
    if (toggle && toggle.checked) loadCoverageLayer('elementos').catch((err) => setStatus(err.message));
  });

  document.getElementById('btn-refresh').addEventListener('click', () => refreshAll(true));
  document.getElementById('btn-fit').addEventListener('click', fitAll);
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await postJSON('/api/auth/logout', {});
    window.location.href = '/login';
  });

  $data.addEventListener('change', () => {
    resetPolling();
    refreshAll(true);
  });
  $tecnico.addEventListener('change', () => refreshAll(true));
  $modoLive.addEventListener('change', () => {
    resetPolling();
    refreshAll(true);
  });

  $container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === 'zoom') zoomTecnico(id);
    if (button.dataset.action === 'solo') {
      $tecnico.value = String(id);
      refreshAll(true);
    }
  });

  async function init() {
    showLoading(true, 'Carregando monitoramento...');
    try {
      await Promise.all([loadTecnicos(), loadProjetos()]);
      await refreshAll(false);
      resetPolling();
      fitAll();
    } catch (err) {
      setStatus(`Erro inicial: ${err.message}`);
    } finally {
      showLoading(false);
    }
  }

  init();
}());