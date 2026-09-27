/* Coordinate-aware weather telemetry and Digital Twin controls for the Seeker map. */
(() => {
  const API_BASE = window.RivoraAPI?.baseUrl || (location.port === '5173' ? 'http://localhost:8000' : location.origin);
  const TWIN_URL = `${API_BASE}/api/twin`;
  const DEFAULT_LOCATION = { zone: 'Navi Mumbai', lat: 19.0330, lon: 73.0297 };
  const KNOWN_ZONES = {
    'Navi Mumbai': { lat: 19.0330, lon: 73.0297 }, Panvel: { lat: 18.9894, lon: 73.1175 },
    Mumbai: { lat: 19.0760, lon: 72.8777 }, Andheri: { lat: 19.1197, lon: 72.8468 },
    Powai: { lat: 19.1176, lon: 72.9060 }, Thane: { lat: 19.2183, lon: 72.9781 }
  };
  const DEFAULT_TELEMETRY = {
    temperature_c: 28, rainfall_mm_per_hr: 2.1, wind_speed_kmh: 12,
    weather_condition: 'Partly cloudy',
    flood_alert: { level: 'Normal', color: '#10B981', message: 'No localized street flooding expected' },
    storm_alert: { level: 'Clear', color: '#10B981' }, status: 'Demo Fallback', source: 'Local demo telemetry'
  };
  const DEMO_SIGNALS = [
    { source: 'Transit monitor (demo)', impact_level: 'High', summary: 'Sion–Panvel Highway traffic is moving slowly; allow extra time for venue staff and suppliers.', timestamp: new Date().toISOString(), is_demo: true },
    { source: 'Community weather desk (demo)', impact_level: 'Moderate', summary: 'Low-lying service lanes may see localized waterlogging during sustained rain.', timestamp: new Date().toISOString(), is_demo: true },
    { source: 'Venue operations (demo)', impact_level: 'Moderate', summary: 'Outdoor operators are checking rain plans and indoor relocation capacity.', timestamp: new Date().toISOString(), is_demo: true }
  ];
  let activeZone = DEFAULT_LOCATION.zone;
  let liveTelemetry = null;
  let scenario = null;
  let weatherCircle = null;
  let latestSignals = [];
  let latestSignalsAreDemo = true;
  const zoneCoordinates = new Map(Object.entries(KNOWN_ZONES));

  function escapeTwin(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function setActiveLocation(lat, lon, zone) {
    const previous = window.digitalTwinLocation;
    window.activeLat = Number(lat);
    window.activeLon = Number(lon);
    window.activeZone = zone || 'Current Location';
    activeZone = window.activeZone;
    window.digitalTwinLocation = { lat: window.activeLat, lon: window.activeLon, zone: activeZone };
    if (previous && (previous.lat !== window.activeLat || previous.lon !== window.activeLon || previous.zone !== activeZone)) {
      window.dispatchEvent(new CustomEvent('rivora:twin-location-change', {
        detail: { lat: window.activeLat, lon: window.activeLon, city: activeZone }
      }));
    }
  }

  function updateZoneOption(zone, lat, lon) {
    const select = document.getElementById('twin-zone');
    if (!select) return;
    let option = Array.from(select.options).find((item) => item.value.toLowerCase() === zone.toLowerCase());
    if (!option) {
      option = document.createElement('option');
      option.value = zone;
      option.textContent = zone;
      select.appendChild(option);
    }
    select.value = option.value;
    zoneCoordinates.set(option.value, { lat: Number(lat), lon: Number(lon) });
  }

  function mockTelemetry(lat, lon, zone) {
    return { ...DEFAULT_TELEMETRY, zone, coordinates: { lat, lon }, flood_alert: { ...DEFAULT_TELEMETRY.flood_alert }, storm_alert: { ...DEFAULT_TELEMETRY.storm_alert } };
  }

  function setBadgeColor(element, alert) {
    if (!element || !alert) return;
    const color = alert.color || '#10B981';
    element.style.color = color;
    element.style.borderColor = color;
    element.style.backgroundColor = `${color}1A`;
    element.dataset.level = String(alert.level || 'normal').toLowerCase().replace(/\s+/g, '-');
  }

  function renderTelemetry(data, updateSlider = true) {
    liveTelemetry = data;
    const coordinates = data.coordinates || {};
    const zone = data.zone || activeZone;
    document.getElementById('twin-live-city').textContent = zone;
    document.getElementById('twin-temp').textContent = Number.isFinite(Number(data.temperature_c)) ? `${Math.round(data.temperature_c)}°C` : '--°C';
    const rainfall = Number(data.rainfall_mm_per_hr ?? data.rain_rate_mm_per_hour);
    document.getElementById('twin-rain').textContent = Number.isFinite(rainfall) ? `${rainfall.toFixed(1)} mm/h` : '-- mm/h';
    const flood = data.flood_alert || { level: data.baseline_operational_risk || 'Unknown', color: '#10B981', message: '' };
    const storm = data.storm_alert || { level: 'Unknown', color: '#10B981' };
    const floodBadge = document.getElementById('twin-flood-badge');
    const stormBadge = document.getElementById('twin-storm-badge');
    floodBadge.textContent = `Flood: ${flood.level}`;
    floodBadge.title = flood.message || flood.level;
    stormBadge.textContent = `Storm: ${storm.level}`;
    setBadgeColor(floodBadge, flood);
    setBadgeColor(stormBadge, storm);
    document.getElementById('twin-condition').textContent = `${data.weather_condition || data.weather_status || 'Weather unavailable'} · ${data.status || 'Unknown status'}`;
    if (coordinates.lat !== undefined && coordinates.lon !== undefined) {
      setActiveLocation(coordinates.lat, coordinates.lon, zone);
      zoneCoordinates.set(zone, { lat: Number(coordinates.lat), lon: Number(coordinates.lon) });
    }
    if (updateSlider && Number.isFinite(rainfall)) {
      const slider = document.getElementById('twin-rain-slider');
      slider.value = Math.max(0, Math.min(100, Math.round(rainfall)));
      document.getElementById('twin-rain-value').textContent = slider.value;
    }
  }

  async function loadTelemetry(lat, lon, zone, updateSlider = true) {
    setActiveLocation(lat, lon, zone);
    updateZoneOption(zone, lat, lon);
    const params = new URLSearchParams({ lat: String(lat), lon: String(lon), zone });
    try {
      const result = await requestJson(`${TWIN_URL}/live-telemetry?${params.toString()}`);
      renderTelemetry(result, updateSlider);
      return result;
    } catch (_) {
      const fallback = mockTelemetry(Number(lat), Number(lon), zone);
      renderTelemetry(fallback, updateSlider);
      document.getElementById('twin-condition').title = 'Backend or weather provider unavailable; showing demo telemetry.';
      return fallback;
    }
  }

  function renderSignals(signals, isDemo = true) {
    const list = document.getElementById('signal-list');
    if (!list) return;
    latestSignals = Array.isArray(signals) ? signals : [];
    latestSignalsAreDemo = isDemo;
    document.getElementById('signal-mode').textContent = `${isDemo ? 'Sample fallback' : 'Public news reports'}${scenario ? ' + simulated twin alert' : ''}`;
    const visibleSignals = [...latestSignals];
    if (scenario) visibleSignals.unshift({
      source: 'Rivora Digital Twin · simulated',
      impact_level: scenario.outdoor_cancellation_risk >= 70 ? 'High' : 'Moderate',
      summary: scenario.zeus_ai_recommendation,
      timestamp: scenario.simulated_at || new Date().toISOString(),
      is_demo: true
    });
    list.innerHTML = visibleSignals.map((signal) => {
      const date = new Date(signal.timestamp);
      const published = Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const headline = escapeTwin(signal.summary);
      const link = /^https?:\/\//i.test(signal.url || '') ? `<a href="${escapeTwin(signal.url)}" target="_blank" rel="noopener noreferrer">${headline}</a>` : headline;
      return `<article class="signal-item"><span class="signal-impact signal-impact--${escapeTwin(String(signal.impact_level || 'moderate').toLowerCase())}">${escapeTwin(signal.impact_level || 'Info')}</span><div><b>${escapeTwin(signal.source)}</b><p>${link}</p></div><time>${escapeTwin(published)}</time></article>`;
    }).join('') || '<span class="signal-item">No operational signals reported.</span>';
  }

  async function refreshSignals() {
    try {
      const params = new URLSearchParams({ city: activeZone });
      const signals = await requestJson(`${TWIN_URL}/social-signals?${params.toString()}`);
      renderSignals(signals, signals.some((signal) => signal.is_demo));
    } catch (_) {
      renderSignals(DEMO_SIGNALS, true);
    }
  }

  async function reverseGeocodeZone(lat, lon) {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error('Reverse geocoding unavailable');
      const place = await response.json();
      return place.locality || place.city || place.principalSubdivision || approximateZone(lat, lon);
    } catch (_) {
      return approximateZone(lat, lon);
    }
  }

  // Coarse offline area fallback when the reverse-geocoding provider is unavailable.
  function approximateZone(lat, lon) {
    if (lat >= 18.94 && lat <= 19.08 && lon >= 73.00 && lon <= 73.24) return 'Panvel';
    if (lat >= 19.105 && lat <= 19.14 && lon >= 72.88 && lon <= 72.94) return 'Powai';
    if (lat >= 19.105 && lat <= 19.145 && lon >= 72.80 && lon <= 72.88) return 'Andheri';
    if (lat >= 18.88 && lat <= 19.28 && lon >= 72.90 && lon <= 73.18) return 'Navi Mumbai';
    if (lat >= 19.0 && lat <= 19.30 && lon >= 72.80 && lon <= 72.92) return 'Mumbai';
    if (lat >= 19.12 && lat <= 19.35 && lon >= 72.92 && lon <= 73.08) return 'Thane';
    return 'Current Location';
  }

  function showLocationToast(message) {
    let toast = document.getElementById('twin-location-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'twin-location-toast';
      toast.className = 'twin-toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
  }

  function centerMap(lat, lon, accuracy = 0) {
    if (typeof resourceMap !== 'undefined' && resourceMap) {
      resourceMap.flyTo([lat, lon], 14, { animate: true, duration: 1.5 });
      if (typeof addUserMarker === 'function') addUserMarker({ lat, lng: lon }, accuracy);
    }
  }

  async function applyDevicePosition(position, button) {
    const { latitude: lat, longitude: lon, accuracy } = position.coords;
    centerMap(lat, lon, accuracy);
    const cityName = await reverseGeocodeZone(lat, lon);
    zoneCoordinates.set(cityName, { lat, lon });
    updateZoneOption(cityName, lat, lon);
    await loadTelemetry(lat, lon, cityName);
    await refreshSignals();
    button.disabled = false;
    button.textContent = '✓ Location Active';
  }

  function fallbackToDefault(button, message) {
    const { lat, lon, zone } = DEFAULT_LOCATION;
    centerMap(lat, lon);
    updateZoneOption(zone, lat, lon);
    loadTelemetry(lat, lon, zone);
    refreshSignals();
    button.disabled = false;
    button.textContent = 'Use my location';
    showLocationToast(message || 'Location permission denied, using default zone');
  }

  function detectTwinLocation() {
    const button = document.getElementById('map-locate-btn');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Detecting GPS…';
    if (!navigator.geolocation) {
      fallbackToDefault(button, 'Location is unavailable, using default zone');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => { applyDevicePosition(position, button).catch(() => fallbackToDefault(button, 'Could not update location, using default zone')); },
      () => fallbackToDefault(button, 'Location permission denied, using default zone'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  function resourceTwinImpact(resource) {
    if (!scenario) return null;
    const name = `${resource.name || ''} ${resource.type || ''} ${resource.location || ''}`.toLowerCase();
    const hazard = /parking|lawn|garden|outdoor|open.?air|grounds?/.test(name) || resource.type === 'Parking';
    return hazard
      ? { kind: 'hazard', label: 'Flooding Risk — Alternate Recommended', multiplier: 1 }
      : resource.type === 'Staff'
        ? { kind: 'delay', label: `⚠️ Transit delay forecast: ${scenario.staff_transit_delay_factor}%`, multiplier: 1 }
        : resource.type === 'AV Equipment'
          ? { kind: 'equipment', label: 'Weather check — protect equipment', multiplier: 1 }
          : (resource.type === 'Space' || /banquet|hall|indoor|hotel|venue/.test(name))
            ? { kind: 'surge', label: `⚡ Zeus Twin Alert: +${Math.round((scenario.indoor_demand_surge_multiplier - 1) * 100)}% Demand Surge`, multiplier: scenario.dynamic_pricing_surge }
            : null;
  }

  function updateScenarioMap() {
    if (typeof resourceMap === 'undefined' || !resourceMap || typeof L === 'undefined') return;
    if (weatherCircle) resourceMap.removeLayer(weatherCircle);
    weatherCircle = null;
    if (!scenario) {
      renderMapMarkers(lastSearchState.list || SAMPLE_RESOURCES);
      return;
    }
    const center = [window.activeLat, window.activeLon];
    const radius = 900 + scenario.rainfall_intensity_mm * 115;
    const highRain = scenario.rainfall_intensity_mm >= 25;
    weatherCircle = L.circle(center, { radius, color: highRain ? '#B42335' : '#7552A3', weight: 2, fillColor: highRain ? '#E5535B' : '#8A6BC2', fillOpacity: highRain ? 0.24 : 0.18, className: 'twin-weather-pulse' })
      .addTo(resourceMap)
      .bindPopup(`<strong>${escapeTwin(activeZone)} weather impact</strong><br>${scenario.rainfall_intensity_mm} mm/h for ${scenario.storm_duration_hours} hours`);
    renderMapMarkers(lastSearchState.list || SAMPLE_RESOURCES);
  }

  function renderScenario(result) {
    scenario = result;
    window.currentTwinScenario = result;
    const resultEl = document.getElementById('twin-result');
    resultEl.hidden = false;
    resultEl.innerHTML = `<div class="twin-metric"><span>Outdoor cancellation risk</span><b>${result.outdoor_cancellation_risk}%</b></div><div class="twin-metric"><span>Indoor demand</span><b>${Number(result.indoor_demand_surge_multiplier).toFixed(2)}×</b></div><div class="twin-metric"><span>Parking flood risk</span><b>${result.parking_flood_risk.probability_percent}%</b></div><div class="twin-metric"><span>Staff delayed</span><b>${result.staff_transit_delay_factor}%</b></div><p class="twin-recommendation"><b>Zeus recommendation</b> ${escapeTwin(result.zeus_ai_recommendation)}</p>`;
    updateScenarioMap();
    renderSignals(latestSignals, latestSignalsAreDemo);
    if (typeof refreshSeekerResults === 'function') refreshSeekerResults();
  }

  async function runScenario() {
    const button = document.getElementById('twin-run');
    const rain = Number(document.getElementById('twin-rain-slider').value);
    const duration = Number(document.getElementById('twin-duration').value);
    const payload = { rainfall_intensity: rain, storm_duration: duration, lat: Number(window.activeLat), lon: Number(window.activeLon), zone: activeZone };
    button.disabled = true;
    button.textContent = 'Simulating…';
    try {
      const result = await requestJson(`${TWIN_URL}/simulate`, { method: 'POST', body: JSON.stringify(payload) });
      renderScenario(result);
    } catch (_) {
      const outdoor = Math.min(99, rain <= 25 ? rain * 3 : 82 + (rain - 25) * .55 + (duration - 1) * .65);
      const indoor = Math.min(2.4, 1 + rain / 100 * (.75 + duration * .46));
      renderScenario({ zone: activeZone, coordinates: { lat: payload.lat, lon: payload.lon }, rainfall_intensity: rain, storm_duration: duration, rainfall_intensity_mm: rain, storm_duration_hours: duration, outdoor_cancellation_risk: Number(outdoor.toFixed(1)), indoor_demand_surge_multiplier: Number(indoor.toFixed(2)), parking_flood_risk: { probability_percent: Math.min(98, rain * 1.15 + duration * 4 + 18) }, staff_transit_delay_factor: Number(Math.min(78, rain * .42 + duration * 3.2).toFixed(1)), dynamic_pricing_surge: Number((1.1 + Math.min(.25, Math.max(0, indoor - 1) * .2)).toFixed(2)), zeus_ai_recommendation: 'Reallocate covered parking to an indoor venue, open standby banquet capacity, and notify suppliers to stage arrivals with a transit-delay buffer.' });
    } finally {
      button.disabled = false;
      button.textContent = 'Simulate Cascade';
    }
  }

  function resetToLive() {
    scenario = null;
    window.currentTwinScenario = null;
    document.getElementById('twin-result').hidden = true;
    const rainfall = Number(liveTelemetry?.rainfall_mm_per_hr) || 0;
    const slider = document.getElementById('twin-rain-slider');
    slider.value = Math.max(0, Math.min(100, Math.round(rainfall)));
    document.getElementById('twin-rain-value').textContent = slider.value;
    updateScenarioMap();
    renderSignals(latestSignals, latestSignalsAreDemo);
    if (typeof refreshSeekerResults === 'function') refreshSeekerResults();
  }

  function init() {
    const slider = document.getElementById('twin-rain-slider');
    if (!slider) return;
    window.addEventListener('rivora:weather-location-change', (event) => {
      const location = event.detail;
      if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lon))) return;
      if (typeof resourceMap !== 'undefined' && resourceMap) {
        resourceMap.flyTo([Number(location.lat), Number(location.lon)], 12, { animate: true, duration: 1.2 });
      }
      loadTelemetry(Number(location.lat), Number(location.lon), location.city).then(refreshSignals);
    });
    setActiveLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.zone);
    slider.addEventListener('input', () => { document.getElementById('twin-rain-value').textContent = slider.value; });
    slider.addEventListener('change', runScenario);
    document.getElementById('twin-duration').addEventListener('input', (event) => { document.getElementById('twin-duration-value').textContent = event.target.value; });
    document.getElementById('twin-duration').addEventListener('change', runScenario);
    document.getElementById('twin-run').addEventListener('click', runScenario);
    document.getElementById('twin-reset').addEventListener('click', resetToLive);
    document.getElementById('twin-zone').addEventListener('change', (event) => {
      const selected = event.target.value;
      const coords = zoneCoordinates.get(selected) || KNOWN_ZONES[selected] || DEFAULT_LOCATION;
      loadTelemetry(coords.lat, coords.lon, selected).then(() => {
        refreshSignals();
        if (scenario) runScenario();
      });
    });
    loadTelemetry(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.zone);
    refreshSignals();
    window.setInterval(() => loadTelemetry(window.activeLat, window.activeLon, activeZone, false), 10 * 60 * 1000);
    window.setInterval(refreshSignals, 10 * 60 * 1000);
  }

  window.detectTwinLocation = detectTwinLocation;
  window.resourceTwinImpact = resourceTwinImpact;
  window.updateTwinScenarioMap = updateScenarioMap;
  window.loadTwinTelemetry = loadTelemetry;
  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
