const fetch = require('node-fetch');
const config = require('./config');

/**
 * Otimiza rotas usando OSRM Table API + TSP solver (nearest-neighbor + 2-opt).
 * Perfil: bicycle (ignora mãos de rua e restrições viárias).
 *
 * @param {Array<{id: number, lng: number, lat: number}>} jobs - Pontos de serviço
 * @param {{lng: number, lat: number}} depot - Ponto de partida (sede)
 * @returns {Promise<{orderedJobs: Array, geometry: object, totalDistance: number, totalDuration: number}>}
 */
async function otimizarRota(jobs, depot) {
  if (!jobs || jobs.length === 0) {
    return { orderedJobs: [], geometry: null, totalDistance: 0, totalDuration: 0 };
  }

  // Se só 1 job, não precisa otimizar
  if (jobs.length === 1) {
    const route = await getOSRMRoute([depot, jobs[0], depot]);
    return {
      orderedJobs: jobs,
      geometry: route.geometry,
      totalDistance: route.distance,
      totalDuration: route.duration,
    };
  }

  // 1. Montar todos os pontos: [depot, ...jobs]
  const allPoints = [depot, ...jobs];
  const coords = allPoints.map((p) => `${p.lng},${p.lat}`).join(';');

  // 2. Buscar matriz de distâncias via OSRM Table API (perfil bicycle)
  const tableUrl = `${config.osrm.host}/table/v1/${config.osrm.profile}/${coords}?annotations=duration,distance`;
  const tableRes = await fetch(tableUrl);
  if (!tableRes.ok) throw new Error(`OSRM Table HTTP ${tableRes.status}`);
  const tableData = await tableRes.json();

  if (tableData.code !== 'Ok') {
    console.warn('[VROOM] OSRM Table falhou, usando fallback euclidiano');
    return fallbackEuclidean(jobs, depot);
  }

  const durations = tableData.durations;
  const distances = tableData.distances;

  // 3. TSP: nearest-neighbor heuristic (depot = index 0)
  const n = allPoints.length;
  const visited = new Set([0]);
  const order = [0];
  let current = 0;

  while (visited.size < n) {
    let bestNext = -1;
    let bestDist = Infinity;
    for (let i = 1; i < n; i++) {
      if (visited.has(i)) continue;
      const d = durations[current][i];
      if (d < bestDist) {
        bestDist = d;
        bestNext = i;
      }
    }
    if (bestNext === -1) break;
    visited.add(bestNext);
    order.push(bestNext);
    current = bestNext;
  }

  // 4. 2-opt improvement
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const before =
          durations[order[i - 1]][order[i]] +
          durations[order[j]][order[(j + 1) % order.length] || 0];
        const after =
          durations[order[i - 1]][order[j]] +
          durations[order[i]][order[(j + 1) % order.length] || 0];
        if (after < before) {
          // Reverse segment i..j
          const segment = order.splice(i, j - i + 1);
          segment.reverse();
          order.splice(i, 0, ...segment);
          improved = true;
        }
      }
    }
  }

  // 5. Extrair jobs na ordem otimizada (sem o depot index 0)
  const orderedJobIndices = order.filter((i) => i > 0);
  const orderedJobs = orderedJobIndices.map((i) => jobs[i - 1]);

  // 6. Buscar geometria da rota real via OSRM Route API
  const waypoints = [depot, ...orderedJobs, depot];
  const route = await getOSRMRoute(waypoints);

  // Calcular distância/duração total pela matriz
  let totalDuration = 0;
  let totalDistance = 0;
  const fullOrder = [0, ...orderedJobIndices, 0];
  for (let k = 0; k < fullOrder.length - 1; k++) {
    totalDuration += durations[fullOrder[k]][fullOrder[k + 1]];
    totalDistance += distances[fullOrder[k]][fullOrder[k + 1]];
  }

  return {
    orderedJobs,
    geometry: route.geometry,
    legs: route.legs || [],
    totalDistance: Math.round(totalDistance),
    totalDuration: Math.round(totalDuration),
  };
}

/**
 * Obtém a geometria da rota via OSRM Route API (perfil bicycle).
 */
async function getOSRMRoute(waypoints) {
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${config.osrm.host}/route/v1/${config.osrm.profile}/${coords}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM Route HTTP ${res.status}`);
    const data = await res.json();

    if (data.code === 'Ok' && data.routes && data.routes[0]) {
      const legs = (data.routes[0].legs || []).map((leg) => {
        // Concatenar geometrias de todos os steps da leg
        const coords = [];
        for (const step of (leg.steps || [])) {
          if (step.geometry && step.geometry.coordinates) {
            for (const c of step.geometry.coordinates) {
              if (coords.length === 0 || coords[coords.length - 1][0] !== c[0] || coords[coords.length - 1][1] !== c[1]) {
                coords.push(c);
              }
            }
          }
        }
        return { coordinates: coords, distance: leg.distance, duration: leg.duration };
      });
      return {
        geometry: data.routes[0].geometry,
        legs,
        distance: data.routes[0].distance,
        duration: data.routes[0].duration,
      };
    }
  } catch (err) {
    console.warn('[VROOM] OSRM Route falhou:', err.message);
  }

  // Fallback: linha reta entre waypoints
  const fallbackLegs = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    fallbackLegs.push({
      coordinates: [[waypoints[i].lng, waypoints[i].lat], [waypoints[i + 1].lng, waypoints[i + 1].lat]],
      distance: 0,
      duration: 0,
    });
  }
  return {
    geometry: {
      type: 'LineString',
      coordinates: waypoints.map((p) => [p.lng, p.lat]),
    },
    legs: fallbackLegs,
    distance: 0,
    duration: 0,
  };
}

/**
 * Fallback: ordena por distância euclidiana (nearest-neighbor sem OSRM).
 */
function fallbackEuclidean(jobs, depot) {
  const dist = (a, b) => Math.sqrt(Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2));

  const remaining = [...jobs];
  const ordered = [];
  let current = depot;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining[bestIdx]);
    current = remaining[bestIdx];
    remaining.splice(bestIdx, 1);
  }

  return {
    orderedJobs: ordered,
    geometry: {
      type: 'LineString',
      coordinates: [
        [depot.lng, depot.lat],
        ...ordered.map((j) => [j.lng, j.lat]),
        [depot.lng, depot.lat],
      ],
    },
    totalDistance: 0,
    totalDuration: 0,
  };
}

module.exports = { otimizarRota };
