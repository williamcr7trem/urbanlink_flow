(() => {
  'use strict';
  const API = '/api';
  const $ = (selector) => document.querySelector(selector);
  const state = { map: null, deliveries: [], vehicles: [], markers: [], routeLayer: null, originMarker: null, planned: null, user: null };
  const token = () => localStorage.getItem('urbanlink_token') || sessionStorage.getItem('urbanlink_token') || '';
  const storedUser = () => {
    try { return JSON.parse(localStorage.getItem('urbanlink_usuario') || sessionStorage.getItem('urbanlink_usuario') || 'null'); }
    catch (_error) { return null; }
  };
  const feedback = (text) => { const node = $('#map-feedback'); if (node) node.textContent = text; };
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const init = { ...options, headers };
    if (options.body && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${API}${path}`, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.mensagem || `Não foi possível concluir a solicitação (${response.status}).`);
    return data;
  }
  function hasCoordinate(value) {
    return value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
  }
  function valid(lat, lon) {
    return hasCoordinate(lat) && hasCoordinate(lon) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180;
  }
  const point = (lat, lon) => [Number(lat), Number(lon)];
  function pin(kind, label) {
    return L.divIcon({ className: '', html: `<div class="urbanlink-pin pin-${kind}"><span>${label}</span></div>`, iconSize: [31, 31], iconAnchor: [15, 29], popupAnchor: [0, -27] });
  }
  function addMarker(lat, lon, kind, label, popup) {
    const marker = L.marker(point(lat, lon), { icon: pin(kind, label) }).addTo(state.map).bindPopup(popup);
    state.markers.push(marker);
    return marker;
  }
  function clearMarkers() {
    state.markers.forEach(marker => state.map.removeLayer(marker));
    state.markers = [];
  }
  function hasDestination(delivery) { return valid(delivery.destino_latitude, delivery.destino_longitude); }
  function filteredDeliveries() {
    const term = ($('#map-search').value || '').trim().toLowerCase();
    const status = $('#map-status').value;
    return state.deliveries.filter(delivery =>
      (!status || delivery.status === status) &&
      (!term || [delivery.codigo, delivery.destino, delivery.bairro, delivery.cidade].some(value => String(value || '').toLowerCase().includes(term)))
    );
  }
  function renderList() {
    const host = $('#map-delivery-list');
    host.replaceChildren();
    const rows = filteredDeliveries();
    if (!rows.length) {
      const empty = document.createElement('p'); empty.className = 'mapa-empty'; empty.textContent = 'Nenhuma entrega corresponde aos filtros.'; host.append(empty); return;
    }
    rows.forEach(delivery => {
      const row = document.createElement('label'); row.className = 'mapa-delivery-item';
      const check = document.createElement('input'); check.type = 'checkbox'; check.value = delivery.id;
      check.checked = Boolean(state.planned?.entrega_ids?.map(Number).includes(Number(delivery.id)));
      check.disabled = !hasDestination(delivery) || ['Entregue', 'Cancelada'].includes(delivery.status);
      const info = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = `${delivery.codigo} · ${delivery.destino}`;
      const subtitle = document.createElement('small'); subtitle.textContent = [delivery.bairro, delivery.cidade].filter(Boolean).join(' — ') || 'Endereço sem bairro/cidade';
      const status = document.createElement('small'); status.className = 'mapa-status';
      status.textContent = `${delivery.status}${hasDestination(delivery) ? '' : ' · sem coordenadas do destino'}`;
      info.append(title, subtitle, status); row.append(check, info);
      row.addEventListener('click', event => {
        if (event.target !== check && hasDestination(delivery)) state.map.setView(point(delivery.destino_latitude, delivery.destino_longitude), 15);
      });
      host.append(row);
    });
  }
  function renderMap() {
    clearMarkers();
    filteredDeliveries().filter(hasDestination).forEach(delivery => {
      addMarker(delivery.destino_latitude, delivery.destino_longitude, 'delivery', 'D', `<strong>${delivery.codigo}</strong><br>${delivery.destino}<br>Status: ${delivery.status}`);
    });
    state.vehicles.forEach(vehicle => {
      const position = vehicle.ultima_posicao || null;
      if (position && valid(position.latitude, position.longitude)) {
        addMarker(position.latitude, position.longitude, 'vehicle', 'V', `<strong>${vehicle.placa}</strong><br>${vehicle.modelo || ''}<br>${vehicle.status || 'Veículo'}`);
      }
    });
    const points = state.markers.map(marker => marker.getLatLng());
    if (points.length) state.map.fitBounds(L.latLngBounds(points).pad(0.18), { maxZoom: 14 });
  }
  async function loadVehicles() {
    const result = await api('/veiculos?limite=100');
    const vehicles = result.dados || [];
    await Promise.all(vehicles.map(async vehicle => {
      try {
        const positions = await api(`/veiculos/${vehicle.id}/posicoes`);
        const latest = (positions.dados || [])[0];
        if (latest) vehicle.ultima_posicao = latest;
      } catch (_error) { /* Usuário sem permissão para consultar este veículo: mantém sem posição. */ }
    }));
    return vehicles;
  }
  async function loadAll() {
    feedback('Atualizando entregas e posições dos veículos…');
    const [deliveryResult, vehicles] = await Promise.all([api('/entregas?limite=100'), loadVehicles()]);
    state.deliveries = deliveryResult.dados || [];
    state.vehicles = vehicles;
    $('#map-count-deliveries').textContent = state.deliveries.filter(item => !['Entregue', 'Cancelada'].includes(item.status)).length;
    $('#map-count-vehicles').textContent = vehicles.filter(item => item.ultima_posicao).length;
    renderList(); renderMap();
    const withoutCoordinates = state.deliveries.filter(item => !['Entregue', 'Cancelada'].includes(item.status) && !hasDestination(item)).length;
    feedback(`${state.deliveries.length} entregas consultadas · ${vehicles.length} veículos cadastrados.${withoutCoordinates ? ` ${withoutCoordinates} entrega(s) sem coordenadas não podem entrar na rota.` : ''}`);
  }
  function selectedIds() {
    return Array.from(document.querySelectorAll('#map-delivery-list input:checked')).map(input => Number(input.value));
  }
  function locate() {
    if (!navigator.geolocation) return Promise.reject(new Error('Este navegador não oferece geolocalização.'));
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, velocidade_kmh: position.coords.speed == null ? null : position.coords.speed * 3.6 }),
      () => reject(new Error('Não foi possível obter sua localização. Autorize o acesso e use uma conexão HTTPS.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    ));
  }
  async function shareDriverPosition(position) {
    const vehicles = await api('/veiculos?limite=100');
    const vehicle = (vehicles.dados || [])[0];
    if (!vehicle) throw new Error('Não há veículo vinculado ao seu cadastro. Solicite ao administrador a vinculação de um veículo.');
    await api(`/veiculos/${vehicle.id}/posicoes`, {
      method: 'POST',
      body: { latitude: position.latitude, longitude: position.longitude, velocidade_kmh: position.velocidade_kmh }
    });
    feedback('Sua posição foi compartilhada com a operação. Ela ficará disponível no mapa até uma nova atualização.');
    await loadAll();
  }
  async function drawRoadRoute(coords) {
    if (coords.length < 2) return;
    try {
      const joined = coords.map(coordsPair => `${coordsPair[1]},${coordsPair[0]}`).join(';');
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${joined}?overview=full&geometries=geojson`);
      if (!response.ok) throw new Error('Serviço de rota indisponível.');
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Traçado viário não encontrado.');
      const line = data.routes[0].geometry.coordinates.map(coordsPair => [coordsPair[1], coordsPair[0]]);
      state.routeLayer = L.polyline(line, { color: '#f35b3f', weight: 5, opacity: 0.86 }).addTo(state.map);
    } catch (_error) {
      state.routeLayer = L.polyline(coords, { color: '#f35b3f', weight: 4, dashArray: '8 8' }).addTo(state.map);
      feedback('O serviço de traçado viário está indisponível; exibindo uma ligação aproximada entre os pontos.');
    }
    state.map.fitBounds(state.routeLayer.getBounds().pad(0.15));
  }
  async function optimizeRoute() {
    const ids = selectedIds();
    if (!ids.length) throw new Error('Selecione ao menos uma entrega com coordenadas de destino.');
    const selected = state.deliveries.filter(delivery => ids.includes(Number(delivery.id)));
    if (selected.some(delivery => !hasDestination(delivery))) throw new Error('Uma das entregas selecionadas não possui coordenadas de destino.');
    const origin = await locate();
    if (state.user?.perfil === 'Motorista') {
      await shareDriverPosition(origin);
    }
    const result = await api('/rotas/otimizar', { method: 'POST', body: { entrega_ids: ids, origem: { latitude: origin.latitude, longitude: origin.longitude }, velocidade_media_kmh: 30 } });
    state.planned = result.rota;
    $('#map-count-stops').textContent = String((result.paradas || []).length);
    $('#map-start').disabled = false;
    $('#map-state-title').textContent = 'Rota otimizada';
    $('#map-state-subtitle').textContent = `${Number(result.rota.distancia_total_km).toFixed(1)} km estimados · ${result.rota.tempo_estimado_min} min`;
    if (state.routeLayer) state.map.removeLayer(state.routeLayer);
    if (state.originMarker) state.map.removeLayer(state.originMarker);
    state.originMarker = L.marker(point(origin.latitude, origin.longitude), { icon: pin('origin', 'O') }).addTo(state.map).bindPopup('<strong>Origem da rota</strong>');
    const stops = (result.paradas || []).map(item => item.entrega).filter(hasDestination);
    const coordinates = [point(origin.latitude, origin.longitude), ...stops.map(item => point(item.destino_latitude, item.destino_longitude))];
    await drawRoadRoute(coordinates);
    renderList();
    feedback('Rota otimizada e salva. A distância e o tempo do sistema são estimativas; o traçado viário depende do serviço externo OSRM.');
  }
  async function startRoute() {
    if (!state.planned) throw new Error('Otimize uma rota antes de iniciá-la.');
    await api(`/rotas/${state.planned.id}/status`, { method: 'PATCH', body: { status: 'Em andamento' } });
    $('#map-state-title').textContent = 'Rota em andamento';
    $('#map-start').disabled = true;
    feedback('Rota iniciada com sucesso.');
  }
  async function init() {
    const host = $('#urbanlink-map');
    if (!host) return;
    if (!window.L) { feedback('Não foi possível carregar a biblioteca do mapa. Verifique sua conexão.'); return; }
    state.user = storedUser();
    const locateButton = $('#map-locate');
    if (state.user?.perfil === 'Motorista' && locateButton) locateButton.textContent = 'Compartilhar posição';
    state.map = L.map(host, { zoomControl: true }).setView([-22.9068, -43.1729], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(state.map);
    $('#map-search').addEventListener('input', () => { renderList(); renderMap(); });
    $('#map-status').addEventListener('change', () => { renderList(); renderMap(); });
    $('#map-refresh').addEventListener('click', () => loadAll().catch(error => feedback(error.message)));
    $('#map-fit').addEventListener('click', () => { const points = state.markers.map(marker => marker.getLatLng()); if (points.length) state.map.fitBounds(L.latLngBounds(points).pad(0.18)); });
    $('#map-clear').addEventListener('click', () => {
      state.planned = null; $('#map-count-stops').textContent = '0'; $('#map-start').disabled = true;
      if (state.routeLayer) state.map.removeLayer(state.routeLayer);
      if (state.originMarker) state.map.removeLayer(state.originMarker);
      state.routeLayer = null; state.originMarker = null; renderList(); feedback('Seleção de rota limpa.');
    });
    locateButton.addEventListener('click', async () => {
      try {
        const position = await locate();
        if (state.user?.perfil === 'Motorista') await shareDriverPosition(position);
        else {
          state.map.setView(point(position.latitude, position.longitude), 15);
          if (state.originMarker) state.map.removeLayer(state.originMarker);
          state.originMarker = L.marker(point(position.latitude, position.longitude), { icon: pin('origin', '•') }).addTo(state.map).bindPopup('<strong>Sua localização</strong>');
          feedback('Sua localização foi exibida no mapa.');
        }
      } catch (error) { feedback(error.message); }
    });
    $('#map-optimize').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await optimizeRoute(); } catch (error) { feedback(error.message); }
      finally { event.currentTarget.disabled = false; }
    });
    $('#map-start').addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await startRoute(); } catch (error) { feedback(error.message); event.currentTarget.disabled = false; }
    });
    await loadAll();
    setTimeout(() => state.map.invalidateSize(), 250);
  }
  document.addEventListener('DOMContentLoaded', () => init().catch(error => feedback(error.message)));
})();