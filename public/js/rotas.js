/* ─── Rotas de Atendimento — Leaflet frontend ──────────── */

(function () {
  'use strict';

  const API = '/api';
  const API_OS = '/api/os';

  // Cores por técnico (indexadas por id)
  const CORES = {
    1: '#e74c3c', // Alex — vermelho
    2: '#3498db', // Jailson — azul
    3: '#2ecc71', // Jucelio — verde
    4: '#f39c12', // Jeovane — laranja
  };

  const CORES_FALLBACK = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#c0392b'];

  function corTecnico(id) {
    return CORES[id] || CORES_FALLBACK[(id - 1) % CORES_FALLBACK.length];
  }

  // ─── DOM refs ──────────────────────────────────────────
  const $status = document.getElementById('status');
  const $loading = document.getElementById('loading');
  const $loadingText = document.getElementById('loading-text');
  const $tecnicosContainer = document.getElementById('tecnicos-container');
  const $dataServico = document.getElementById('data-servico');
  const $btnGeocodeAuto = document.getElementById('btn-geocode-auto');
  const $btnOtimizarTodos = document.getElementById('btn-otimizar-todos');
  const $btnBuscarIxc = document.getElementById('btn-buscar-ixc');
  const $btnLoadCamadas = document.getElementById('btn-load-camadas');

  // Default data = hoje
  $dataServico.value = new Date().toISOString().split('T')[0];

  // ─── Map setup ─────────────────────────────────────────
  const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
    worldCopyJump: false,
    maxBounds: [[-90, -180], [90, 180]],
    maxBoundsViscosity: 1.0,
    maxZoom: 20,
  }).setView([-8.49, -36.24], 12);

  // Base layers (mesmas do mapa de cobertura)
  const osmLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '&copy; OpenStreetMap', maxZoom: 20, maxNativeZoom: 19, noWrap: true }
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
  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: '&copy; Esri', maxZoom: 20, maxNativeZoom: 18, noWrap: true }
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

  // ─── Layer groups ──────────────────────────────────────
  // Rotas por técnico
  const routeLayers = {};   // id_tecnico → L.layerGroup
  const markerLayers = {};  // id_tecnico → L.layerGroup

  // Camadas de cobertura (do mapa original)
  const coverageLayers = {
    caixasFtth: L.layerGroup(),
    pops: L.layerGroup(),
    logins: L.layerGroup(),
    onus: L.layerGroup(),
    cabos: L.layerGroup(),
    caixaEmenda: L.layerGroup(),
    postes: L.layerGroup(),
  };

  // Depot marker
  let depotMarker = null;

  // Visibilidade por técnico
  const tecnicoVisible = {};

  // ─── Layer toggles ────────────────────────────────────
  document.querySelectorAll('.layer-toggle').forEach((label) => {
    const layerName = label.dataset.layer;
    const checkbox = label.querySelector('input');
    const layer = coverageLayers[layerName];
    if (!layer) return;

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        map.addLayer(layer);
      } else {
        map.removeLayer(layer);
      }
    });
  });

  // ─── Tab switching ─────────────────────────────────────
  document.querySelectorAll('.sidebar-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  // ─── Helpers ───────────────────────────────────────────
  function setStatus(msg) { $status.textContent = msg; }
  function showLoading(show, msg) {
    $loading.classList.toggle('hidden', !show);
    if (msg) $loadingText.textContent = msg;
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // ─── Numbered marker icon ─────────────────────────────
  function numberedIcon(num, color) {
    return L.divIcon({
      className: '',
      html: `<div class="numbered-marker" style="background:${color}">${num}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -16],
    });
  }

  function depotIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="depot-marker">🏠</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -18],
    });
  }

  // ─── Data store ────────────────────────────────────────
  let tecnicos = [];
  let servicos = [];
  let rotasOtimizadas = {}; // id_tecnico → resultado da otimização

  // ─── Load technicians and services ─────────────────────
  async function loadData() {
    showLoading(true, 'Carregando técnicos e serviços...');
    try {
      [tecnicos, servicos] = await Promise.all([
        fetchJSON(`${API_OS}/tecnicos`),
        fetchJSON(`${API_OS}/servicos`),
      ]);

      renderTecnicoCards();
      renderServicosNoMapa();
      setStatus(`${tecnicos.length} técnicos, ${servicos.length} serviços`);
    } catch (err) {
      setStatus('Erro ao carregar: ' + err.message);
      toast('Erro ao carregar dados: ' + err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // ─── Render technician cards in sidebar ────────────────
  function renderTecnicoCards() {
    const container = $tecnicosContainer;
    // Keep the h3 title
    container.innerHTML = '<h3>Técnicos</h3>';

    for (const tec of tecnicos) {
      const color = corTecnico(tec.id);
      const tecServicos = servicos.filter((s) => s.id_tecnico === tec.id);
      const card = document.createElement('div');
      card.className = 'tecnico-card open';
      card.style.borderLeftColor = color;
      card.dataset.tecnicoId = tec.id;

      const rota = rotasOtimizadas[tec.id];

      if (tecnicoVisible[tec.id] === undefined) tecnicoVisible[tec.id] = true;

      card.innerHTML = `
        <div class="tecnico-card-header">
          <span class="tecnico-name">
            <span class="dot" style="background:${color}"></span>
            ${tec.nome}
          </span>
          <div class="tecnico-header-actions">
            <button class="btn-eye" data-id="${tec.id}" title="Ocultar/mostrar no mapa">${tecnicoVisible[tec.id] ? '👁️' : '🚫'}</button>
            <span class="tecnico-badge">${tecServicos.length} serviços</span>
          </div>
        </div>
        <div class="tecnico-body">
          <div class="servico-list">
            ${tecServicos.map((s, i) => {
              const hasCoord = s.latitude && s.longitude && s.latitude !== 0;
              const order = rota ? rota.orderedJobs.findIndex((j) => j.id === s.id) + 1 : i + 1;
              return `
                <div class="servico-item" data-servico-id="${s.id}">
                  <div class="servico-num" style="background:${color}">${order}</div>
                  <div class="servico-info">
                    <div class="servico-nome">${escapeHtml(s.nome_cliente)}</div>
                    <div class="servico-local">${escapeHtml(s.localidade)}${s.endereco ? ' — ' + escapeHtml(s.endereco) : ''}</div>
                    <div class="servico-tipo">${escapeHtml(s.tipo_servico)}</div>
                  </div>
                  <span class="servico-status-icon" title="${hasCoord ? 'Geocodificado' : 'Sem coordenadas'}">${hasCoord ? '📍' : '⚠️'}</span>
                </div>
              `;
            }).join('')}
          </div>
          ${rota ? `
            <div class="rota-summary">
              <div class="rota-stat"><span>Distância:</span><span>${(rota.totalDistance / 1000).toFixed(1)} km</span></div>
              <div class="rota-stat"><span>Duração:</span><span>${Math.round(rota.totalDuration / 60)} min</span></div>
              <div class="rota-stat"><span>Paradas:</span><span>${rota.orderedJobs.length}</span></div>
            </div>
          ` : ''}
          <div style="margin-top:8px; display:flex; gap:6px">
            <button class="btn btn-sm btn-success btn-otimizar" data-id="${tec.id}" ${tecServicos.filter((s) => s.latitude && s.longitude && s.latitude !== 0).length < 1 ? 'disabled title="Geocodifique os serviços primeiro"' : ''}>🚀 Otimizar</button>
            <button class="btn btn-sm btn-secondary btn-zoom" data-id="${tec.id}">🔍 Zoom</button>
          </div>
        </div>
      `;

      // Toggle card open/close
      card.querySelector('.tecnico-card-header').addEventListener('click', () => {
        card.classList.toggle('open');
      });

      // Otimizar button
      card.querySelector('.btn-otimizar').addEventListener('click', (e) => {
        e.stopPropagation();
        otimizarTecnico(tec.id);
      });

      // Zoom button
      card.querySelector('.btn-zoom').addEventListener('click', (e) => {
        e.stopPropagation();
        zoomToTecnico(tec.id);
      });

      // Eye toggle button
      card.querySelector('.btn-eye').addEventListener('click', (e) => {
        e.stopPropagation();
        tecnicoVisible[tec.id] = !tecnicoVisible[tec.id];
        const btn = e.currentTarget;
        btn.textContent = tecnicoVisible[tec.id] ? '👁️' : '🚫';
        card.classList.toggle('muted', !tecnicoVisible[tec.id]);
        toggleTecnicoVisibility(tec.id, tecnicoVisible[tec.id]);
      });

      if (!tecnicoVisible[tec.id]) card.classList.add('muted');

      container.appendChild(card);
    }
  }

  function toggleTecnicoVisibility(id, visible) {
    if (routeLayers[id]) {
      if (visible) map.addLayer(routeLayers[id]);
      else map.removeLayer(routeLayers[id]);
    }
    if (markerLayers[id]) {
      if (visible) map.addLayer(markerLayers[id]);
      else map.removeLayer(markerLayers[id]);
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Render service markers on map ─────────────────────
  function renderServicosNoMapa() {
    // Clear existing route/marker layers
    for (const id of Object.keys(routeLayers)) {
      map.removeLayer(routeLayers[id]);
      delete routeLayers[id];
    }
    for (const id of Object.keys(markerLayers)) {
      map.removeLayer(markerLayers[id]);
      delete markerLayers[id];
    }

    // Remove depot
    if (depotMarker) { map.removeLayer(depotMarker); depotMarker = null; }

    const allBounds = [];

    for (const tec of tecnicos) {
      const color = corTecnico(tec.id);
      const tecServicos = servicos.filter((s) => s.id_tecnico === tec.id);
      const mLayer = L.layerGroup();
      if (tecnicoVisible[tec.id] !== false) mLayer.addTo(map);
      markerLayers[tec.id] = mLayer;

      const rota = rotasOtimizadas[tec.id];

      tecServicos.forEach((s, idx) => {
        if (!s.latitude || !s.longitude || s.latitude === 0) return;

        const order = rota ? rota.orderedJobs.findIndex((j) => j.id === s.id) + 1 : idx + 1;
        const latLng = [s.latitude, s.longitude];
        allBounds.push(latLng);

        const marker = L.marker(latLng, {
          icon: numberedIcon(order || idx + 1, color),
          draggable: true,
          zIndexOffset: 1000,
        });

        marker.bindPopup(`
          <table class="popup-table">
            <tr><td>Cliente</td><td>${escapeHtml(s.nome_cliente)}</td></tr>
            <tr><td>Local</td><td>${escapeHtml(s.localidade)}</td></tr>
            <tr><td>Endereço</td><td>${escapeHtml(s.endereco)}</td></tr>
            <tr><td>Tipo</td><td>${escapeHtml(s.tipo_servico)}</td></tr>
            <tr><td>Técnico</td><td>${escapeHtml(tec.nome)}</td></tr>
            <tr><td>Coords</td><td>${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}</td></tr>
          </table>
        `);

        // Drag to update coordinates
        marker.on('dragend', async () => {
          const pos = marker.getLatLng();
          try {
            await fetch(`${API_OS}/servicos/${s.id}/coords`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ latitude: pos.lat, longitude: pos.lng }),
            });
            s.latitude = pos.lat;
            s.longitude = pos.lng;
            toast(`📍 Coordenadas de ${s.nome_cliente} atualizadas`, 'success');
            // Update popup
            marker.setPopupContent(`
              <table class="popup-table">
                <tr><td>Cliente</td><td>${escapeHtml(s.nome_cliente)}</td></tr>
                <tr><td>Local</td><td>${escapeHtml(s.localidade)}</td></tr>
                <tr><td>Endereço</td><td>${escapeHtml(s.endereco)}</td></tr>
                <tr><td>Tipo</td><td>${escapeHtml(s.tipo_servico)}</td></tr>
                <tr><td>Técnico</td><td>${escapeHtml(tec.nome)}</td></tr>
                <tr><td>Coords</td><td>${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}</td></tr>
              </table>
            `);
          } catch {
            toast('Erro ao salvar coordenadas', 'error');
          }
        });

        mLayer.addLayer(marker);
      });

      // Draw route if optimized
      if (rota && rota.geometry) {
        const rLayer = L.layerGroup();
        if (tecnicoVisible[tec.id] !== false) rLayer.addTo(map);
        routeLayers[tec.id] = rLayer;

        const legs = rota.legs || [];
        const totalLegs = legs.length || 1;

        if (legs.length > 0) {
          // Desenhar cada leg (segmento) com opacity decrescente
          legs.forEach((leg, idx) => {
            if (!leg.coordinates || leg.coordinates.length < 2) return;
            const segCoords = leg.coordinates.map((c) => [c[1], c[0]]);

            // Primeiro segmento = mais brilhante, último = mais esmaecido
            const progress = idx / totalLegs;
            const opacity = 1.0 - progress * 0.65;   // 1.0 → 0.35
            const weight = 6 - progress * 3;          // 6 → 3
            const isFirst = idx === 0;

            // Glow: sombra atrás para o segmento mais próximo
            if (isFirst) {
              const glow = L.polyline(segCoords, {
                color,
                weight: 12,
                opacity: 0.3,
                lineCap: 'round',
                lineJoin: 'round',
              });
              rLayer.addLayer(glow);
            }

            const poly = L.polyline(segCoords, {
              color,
              weight,
              opacity,
              lineCap: 'round',
              lineJoin: 'round',
              dashArray: isFirst ? null : `${8 + idx * 2}, ${4 + idx}`,
            });

            poly.bindTooltip(`Trecho ${idx + 1} de ${totalLegs}`, { sticky: true, opacity: 0.8 });
            rLayer.addLayer(poly);
          });
        } else {
          // Fallback: linha única
          const coords = rota.geometry.coordinates.map((c) => [c[1], c[0]]);
          rLayer.addLayer(L.polyline(coords, { color, weight: 4, opacity: 0.8, dashArray: '8, 6' }));
        }

        // Add depot marker if not already added
        if (!depotMarker && rota.depot) {
          depotMarker = L.marker([rota.depot.lat, rota.depot.lng], { icon: depotIcon(), zIndexOffset: 2000 })
            .bindPopup('<b>🏠 Sede</b><br>Ponto de partida');
          depotMarker.addTo(map);
          allBounds.push([rota.depot.lat, rota.depot.lng]);
        }
      }
    }

    // Fit bounds
    if (allBounds.length > 0) {
      map.fitBounds(allBounds, { padding: [60, 60], maxZoom: 14 });
    }
  }

  // ─── Optimize route for a single technician ────────────
  async function otimizarTecnico(id) {
    showLoading(true, 'Otimizando rota...');
    try {
      const result = await postJSON(`${API_OS}/otimizar`, { id_tecnico: id });
      rotasOtimizadas[id] = result;
      renderTecnicoCards();
      renderServicosNoMapa();
      toast(`✅ Rota de ${tecnicos.find((t) => t.id === id)?.nome} otimizada!`, 'success');
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // ─── Optimize all routes ───────────────────────────────
  async function otimizarTodos() {
    showLoading(true, 'Otimizando todas as rotas...');
    try {
      for (const tec of tecnicos) {
        const tecServicos = servicos.filter(
          (s) => s.id_tecnico === tec.id && s.latitude && s.longitude && s.latitude !== 0
        );
        if (tecServicos.length === 0) continue;

        try {
          const result = await postJSON(`${API_OS}/otimizar`, { id_tecnico: tec.id });
          rotasOtimizadas[tec.id] = result;
        } catch (err) {
          console.warn(`[ROTAS] Erro ao otimizar ${tec.nome}:`, err.message);
        }
      }
      renderTecnicoCards();
      renderServicosNoMapa();
      toast('✅ Todas as rotas otimizadas!', 'success');
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // ─── Zoom to technician's services ─────────────────────
  function zoomToTecnico(id) {
    const tecServicos = servicos.filter(
      (s) => s.id_tecnico === id && s.latitude && s.longitude && s.latitude !== 0
    );
    if (tecServicos.length === 0) {
      toast('Sem serviços geocodificados para este técnico', 'info');
      return;
    }
    const bounds = tecServicos.map((s) => [s.latitude, s.longitude]);
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 });
  }

  // ─── Auto geocode ──────────────────────────────────────
  async function geocodeAuto() {
    showLoading(true, 'Geocodificando serviços...');
    try {
      const result = await postJSON(`${API_OS}/geocode-auto`, {});
      toast(`📍 ${result.updated} serviços geocodificados`, result.updated > 0 ? 'success' : 'info');
      // Reload data
      await loadData();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // ─── Buscar OS no IXC ──────────────────────────────────
  async function buscarIXC() {
    showLoading(true, 'Buscando OS no IXC...');
    const semCoord = servicos.filter((s) => !s.id_os_ixc || s.id_os_ixc === '');

    let found = 0;
    for (const s of semCoord) {
      try {
        const nome = s.nome_cliente.split(' ').slice(0, 3).join(' ');
        const result = await fetchJSON(`${API_OS}/servicos/ixc?nome_cliente=${encodeURIComponent(nome)}`);

        if (result.data && result.data.length > 0) {
          found++;
          // Se encontrou coordenadas na resposta, atualizar
          const match = result.data[0];
          if (match.latitude && match.longitude && parseFloat(match.latitude) !== 0) {
            await fetch(`${API_OS}/servicos/${s.id}/coords`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ latitude: parseFloat(match.latitude), longitude: parseFloat(match.longitude) }),
            });
          }
        }

        if (result.warning) {
          toast(result.warning, 'info');
          break;
        }
      } catch { /* continue */ }
    }

    toast(`🔄 ${found} correspondências encontradas no IXC`, found > 0 ? 'success' : 'info');
    await loadData();
    showLoading(false);
  }

  // ─── Load coverage layers from original map API ────────
  let coverageLoaded = false;

  async function loadCoverageLayers() {
    if (coverageLoaded) {
      toast('Camadas já carregadas', 'info');
      return;
    }

    showLoading(true, 'Carregando camadas de cobertura...');
    try {
      const [ctosData, popsData, loginsData, onusData] = await Promise.all([
        fetchJSON(`${API}/caixas-ftth`),
        fetchJSON(`${API}/pops`),
        fetchJSON(`${API}/logins`),
        fetchJSON(`${API}/onus`),
      ]);

      // CTOs
      renderCoveragePoints(ctosData, coverageLayers.caixasFtth, '#3498db', 4, 0.5);
      // POPs
      renderCoveragePoints(popsData, coverageLayers.pops, '#e67e22', 6, 0.6);
      // Logins
      renderCoveragePoints(loginsData, coverageLayers.logins, '#1abc9c', 3, 0.3);
      // ONUs
      renderCoveragePoints(onusData, coverageLayers.onus, '#9b59b6', 3, 0.3);

      coverageLoaded = true;
      toast('✅ Camadas de cobertura carregadas', 'success');
      setStatus(`Cobertura: ${ctosData.features?.length || 0} CTOs, ${loginsData.features?.length || 0} logins`);
    } catch (err) {
      toast('Erro ao carregar camadas: ' + err.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  function renderCoveragePoints(geojson, layerGroup, color, radius, opacity) {
    layerGroup.clearLayers();
    if (!geojson || !geojson.features) return;

    for (const feat of geojson.features) {
      if (!feat.geometry || feat.geometry.type !== 'Point') continue;
      const [lng, lat] = feat.geometry.coordinates;

      const marker = L.circleMarker([lat, lng], {
        radius,
        fillColor: color,
        fillOpacity: opacity,
        color: color,
        weight: 1,
        opacity: opacity + 0.1,
      });

      // Simple popup
      const p = feat.properties;
      const label = p.nome || p.login || p.pop || p.id || '';
      if (label) {
        marker.bindPopup(`<b>${escapeHtml(label)}</b><br><small>${escapeHtml(p.endereco || p.conexao || '')}</small>`);
      }

      layerGroup.addLayer(marker);
    }
  }

  // ─── Load FiberDocs elements ───────────────────────────
  async function loadFiberDocsElements(idProjeto) {
    try {
      const data = await fetchJSON(`${API}/elementos/${idProjeto}`);
      if (!data || !data.features) return;

      coverageLayers.cabos.clearLayers();
      coverageLayers.caixaEmenda.clearLayers();
      coverageLayers.postes.clearLayers();

      for (const feat of data.features) {
        const p = feat.properties;
        const geom = feat.geometry;

        if (geom.type === 'LineString') {
          const coords = geom.coordinates.map((c) => [c[1], c[0]]);
          const line = L.polyline(coords, {
            color: p.cor_ativa || '#3388ff',
            weight: p.espessura || 2,
            opacity: 0.5,
            dashArray: p.pontilhada ? '5, 5' : null,
          });
          coverageLayers.cabos.addLayer(line);
        } else if (geom.type === 'Point') {
          const [lng, lat] = geom.coordinates;
          const marker = L.circleMarker([lat, lng], {
            radius: 4,
            fillColor: p.cor_ativa || '#888',
            fillOpacity: 0.5,
            color: p.cor_fundo || '#fff',
            weight: 1,
          });

          const tipo = (p.tipo_nome || '').toLowerCase();
          if (tipo.includes('emenda')) {
            coverageLayers.caixaEmenda.addLayer(marker);
          } else if (tipo.includes('poste')) {
            coverageLayers.postes.addLayer(marker);
          } else {
            coverageLayers.cabos.addLayer(marker);
          }
        }
      }
    } catch (err) {
      console.warn('[CAMADAS] Erro em elementos FiberDocs:', err.message);
    }
  }

  // ─── Events ────────────────────────────────────────────
  $btnGeocodeAuto.addEventListener('click', geocodeAuto);
  $btnOtimizarTodos.addEventListener('click', otimizarTodos);
  $btnBuscarIxc.addEventListener('click', buscarIXC);
  $btnLoadCamadas.addEventListener('click', loadCoverageLayers);

  // ─── Init ──────────────────────────────────────────────
  loadData();

})();
