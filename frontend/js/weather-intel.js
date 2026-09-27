/* Provider dashboard atmospheric widget; all provider keys remain server-side. */
(() => {
  const apiBase = window.RivoraAPI?.baseUrl || (location.port === '5173' ? 'http://localhost:8000' : location.origin);
  const endpoint = `${apiBase}/api/weather/intel`;
  const cityCoordinates = {
    'Navi Mumbai': { lat: 19.0330, lon: 73.0297 },
    Panvel: { lat: 18.9894, lon: 73.1175 },
    Mumbai: { lat: 19.0760, lon: 72.8777 },
    Thane: { lat: 19.2183, lon: 72.9781 }
  };
  const locationCoordinates = { ...cityCoordinates };
  let requestId = 0;
  let activeLocation = { city: 'Navi Mumbai', ...cityCoordinates['Navi Mumbai'] };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function formatPublished(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Publication time unavailable' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function levelName(level) {
    return String(level || 'normal').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function sameLocation(first, second) {
    return !!first && !!second && first.city === second.city && Number(first.lat) === Number(second.lat) && Number(first.lon) === Number(second.lon);
  }

  function ensureCityOption(selector, city) {
    if (!selector || Array.from(selector.options).some((item) => item.value === city)) return;
    const option = document.createElement('option');
    option.value = city;
    option.textContent = city;
    selector.appendChild(option);
  }

  function renderSignals(data) {
    const list = document.getElementById('weather-intel-signals');
    if (!list) return;
    const items = Array.isArray(data.signals) ? data.signals : [];
    const source = data.signals_source || 'Public reports';
    document.getElementById('weather-intel-news-source').textContent = data.signals_are_demo ? 'Sample reports' : source;
    if (!items.length) {
      list.innerHTML = '<p class="weather-empty">No recent local reports matched this area.</p>';
      return;
    }
    list.innerHTML = items.slice(0, 3).map((item) => {
      const headline = escapeHtml(item.summary || 'Local report');
      const href = /^https?:\/\//i.test(item.url || '')
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${headline}</a>`
        : headline;
      return `<article class="weather-news-item"><span class="weather-news-impact weather-news-impact--${escapeHtml(levelName(item.impact_level))}">${escapeHtml(item.impact_level || 'Info')}</span><div><b>${escapeHtml(item.source || source)}</b><p>${href}</p><time>${escapeHtml(formatPublished(item.timestamp))}</time></div></article>`;
    }).join('');
  }

  function renderTimeline(items) {
    const timeline = document.getElementById('weather-intel-timeline');
    if (!Array.isArray(items) || !items.length) {
      timeline.innerHTML = '<span class="weather-empty">Forecast timeline is unavailable.</span>';
      return;
    }
    timeline.innerHTML = items.slice(0, 6).map((item) => {
      const temperature = item.temperature_c !== null && item.temperature_c !== undefined && Number.isFinite(Number(item.temperature_c)) ? `${Math.round(item.temperature_c)}°` : '--°';
      const chance = item.precipitation_probability_percent !== null && item.precipitation_probability_percent !== undefined && Number.isFinite(Number(item.precipitation_probability_percent)) ? `${Math.round(item.precipitation_probability_percent)}%` : '--%';
      return `<article class="weather-hour"><time>${escapeHtml(formatTime(item.time))}</time><span class="weather-hour-icon" title="${escapeHtml(item.condition)}">${escapeHtml(item.icon || '🌡️')}</span><b>${temperature}</b><small>Rain ${chance}</small></article>`;
    }).join('');
  }

  function render(data, city) {
    const temperature = data.temperature_c !== null && data.temperature_c !== undefined && Number.isFinite(Number(data.temperature_c)) ? `${Math.round(data.temperature_c)}°C` : '--°C';
    const rain = data.rain_mm_per_hr !== null && data.rain_mm_per_hr !== undefined && Number.isFinite(Number(data.rain_mm_per_hr)) ? `${Number(data.rain_mm_per_hr).toFixed(1)} mm/h` : '-- mm/h';
    const humidity = data.relative_humidity_percent !== null && data.relative_humidity_percent !== undefined && Number.isFinite(Number(data.relative_humidity_percent)) ? `${Math.round(data.relative_humidity_percent)}%` : '--%';
    const wind = data.wind_speed_kmh !== null && data.wind_speed_kmh !== undefined && Number.isFinite(Number(data.wind_speed_kmh)) ? `${Number(data.wind_speed_kmh).toFixed(1)} km/h` : '-- km/h';
    const flood = data.flood_risk || { level: 'Unknown', color: '#78716C' };

    setText('weather-kpi-city', city);
    setText('weather-kpi-temperature', temperature);
    setText('weather-kpi-condition', data.condition || 'Weather unavailable');
    setText('weather-kpi-rain', rain);
    setText('weather-kpi-wind', wind);
    const kpiRisk = document.getElementById('weather-kpi-risk');
    if (kpiRisk) {
      kpiRisk.textContent = flood.level;
      kpiRisk.dataset.level = levelName(flood.level);
    }

    document.getElementById('weather-intel-icon').textContent = data.weather_icon || '🌡️';
    document.getElementById('weather-intel-temperature').textContent = temperature;
    document.getElementById('weather-intel-condition').textContent = data.condition || 'Weather unavailable';
    document.getElementById('weather-intel-rain').textContent = rain;
    document.getElementById('weather-intel-humidity').textContent = humidity;
    document.getElementById('weather-intel-wind').textContent = wind;
    const floodView = document.getElementById('weather-intel-flood');
    floodView.textContent = flood.level;
    floodView.dataset.level = levelName(flood.level);
    floodView.title = flood.message || flood.level;
    document.getElementById('weather-intel-city-label').textContent = city;
    const headerRisk = document.getElementById('weather-intel-header-risk');
    headerRisk.textContent = `Flood: ${flood.level}`;
    headerRisk.dataset.level = levelName(flood.level);
    renderTimeline(data.timeline);
    renderSignals(data);

    const status = document.getElementById('weather-intel-status');
    const observed = data.observed_at ? ` · Updated ${formatTime(data.observed_at)}` : '';
    status.textContent = data.status === 'Live Connected'
      ? `Live weather from ${data.weather_source || 'Open-Meteo'}${observed}`
      : 'Live weather is unavailable; fallback values are shown and labeled.';
    status.dataset.mode = data.status === 'Live Connected' ? 'live' : 'fallback';
  }

  function fallbackData(city) {
    return {
      city,
      temperature_c: null,
      condition: 'Weather unavailable',
      rain_mm_per_hr: null,
      relative_humidity_percent: null,
      wind_speed_kmh: null,
      flood_risk: { level: 'Unavailable', color: '#78716C' },
      status: 'Offline Fallback',
      signals: [],
      signals_source: 'No connection',
      signals_are_demo: true,
      timeline: []
    };
  }

  async function loadWeather(location, selector, syncTwin = false) {
    activeLocation = location;
    if (selector) {
      ensureCityOption(selector, location.city);
      selector.value = location.city;
    }
    if (syncTwin) window.dispatchEvent(new CustomEvent('rivora:weather-location-change', { detail: location }));
    const currentRequest = ++requestId;
    const params = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon), city: location.city });
    const status = document.getElementById('weather-intel-status');
    status.textContent = 'Refreshing local weather and reports…';
    status.dataset.mode = 'loading';
    try {
      const response = await fetch(`${endpoint}?${params}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
      const result = await response.json();
      if (currentRequest === requestId) render(result, location.city);
    } catch (_) {
      if (currentRequest === requestId) render(fallbackData(location.city), location.city);
    }
  }

  async function locateUser(button, selector) {
    if (!navigator.geolocation) {
      document.getElementById('weather-intel-status').textContent = 'Device location is unavailable in this browser.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Detecting…';
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude: lat, longitude: lon } = position.coords;
      let city = 'Current Location';
      try {
        const reverseUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
        const response = await fetch(reverseUrl, { signal: AbortSignal.timeout(6000) });
        if (response.ok) {
          const place = await response.json();
          city = place.locality || place.city || place.principalSubdivision || city;
        }
      } catch (_) { /* Coordinates still work when reverse geocoding is unavailable. */ }
      ensureCityOption(selector, city);
      locationCoordinates[city] = { lat, lon };
      if (selector) selector.value = city;
      await loadWeather({ city, lat, lon }, selector);
      button.disabled = false;
      button.textContent = 'Use my location';
    }, () => {
      document.getElementById('weather-intel-status').textContent = 'Location permission was denied. Showing Navi Mumbai weather.';
      loadWeather({ city: 'Navi Mumbai', ...cityCoordinates['Navi Mumbai'] }, selector).finally(() => {
        button.disabled = false;
        button.textContent = 'Use my location';
      });
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  }

  function init() {
    const section = document.getElementById('weather-news-section');
    if (!section || !document.getElementById('weather-intel-city')) return;
    const selector = document.getElementById('weather-intel-city');
    const locate = document.getElementById('weather-intel-locate');
    const navLink = document.querySelector('.sidebar-link--weather');
    navLink?.addEventListener('click', (event) => {
      event.preventDefault();
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', '#weather-news-section');
      document.querySelectorAll('.sidebar-nav .sidebar-link').forEach((link) => link.classList.remove('is-active'));
      navLink.classList.add('is-active');
    });
    selector.addEventListener('change', () => {
      const city = selector.value;
      loadWeather({ city, ...(locationCoordinates[city] || cityCoordinates['Navi Mumbai']) }, selector, true);
    });
    locate?.addEventListener('click', () => locateUser(locate, selector));
    window.addEventListener('rivora:twin-location-change', (event) => {
      const location = event.detail;
      if (!location?.city || sameLocation(activeLocation, location)) return;
      locationCoordinates[location.city] = { lat: Number(location.lat), lon: Number(location.lon) };
      ensureCityOption(selector, location.city);
      loadWeather(location, selector);
    });
    loadWeather(activeLocation, selector);
    window.setInterval(() => loadWeather(activeLocation, selector), 10 * 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
