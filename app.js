// =========================================================================
// PELINDUNG EKSEKUSI GANDA (Cegah app.js berjalan lebih dari 1x)
// =========================================================================
if (window.__WEBGIS_INITIALIZED__) {
  throw new Error('app.js sudah dimuat sebelumnya. Menghentikan eksekusi ganda.');
}
window.__WEBGIS_INITIALIZED__ = true;
// =========================================================================
// 0. KONFIGURASI DATA (ubah nama file / tipe layer di sini)
// =========================================================================
const AOI_FILE    = './data/AOI_Kaltim_PL_Kota.geojson';
const BAHAYA_FILE = 'data/model_bahaya_api.geojson';

// Bobot model awal. Bobot aktif bisa diubah oleh simulasi.js lewat WebGIS.setBobotAktif()
const DEFAULT_WEIGHTS = { gambut: 30, iklim: 25, permukaan: 25, akses: 20 };
let activeWeights = { ...DEFAULT_WEIGHTS };

const POLY = (fill, line) => ({ fillColor: fill, color: line, weight: 1, fillOpacity: 0.6 });

// Skala warna raster kontinu: t = 0 (nilai min) ... 1 (nilai max)
const RAMPS = {
  hujan: t => `hsl(205, 85%, ${88 - 53 * t}%)`,            // biru muda -> biru tua
  ndvi:  t => `hsl(${40 + 80 * t}, 70%, ${65 - 25 * t}%)`, // cokelat/kuning -> hijau tua
  suhu:  t => `hsl(${220 - 220 * t}, 85%, 50%)`,           // biru -> merah
  akses: t => `hsl(48, 95%, ${90 - 50 * t}%)`,             // kuning muda -> kuning tua
  api:   t => `hsl(${60 - 60 * t}, 100%, 50%)`             // kuning -> merah
};

// Warna cadangan untuk raster kategori yang kelasnya belum didefinisikan
const CAT_PALETTE = ['#14532d', '#65a30d', '#facc15', '#f97316', '#dc2626', '#38bdf8', '#a855f7', '#78350f'];

const DATA_LAYERS = [
  // --- Titik ---
  { key: 'titik_api', title: 'Titik Api Historis (Hotspot)', file: 'data/titik_api_firms.geojson', point: true,
    style: { radius: 5, fillColor: '#fef08a', color: '#dc2626', weight: 1.5, fillOpacity: 0.9 } },
  { key: 'dampak', title: 'Objek Analisis Dampak', file: 'data/dampak_fasilitas.geojson', point: true,
    style: { radius: 6, fillColor: '#38bdf8', color: '#0369a1', weight: 1.5, fillOpacity: 0.9 } },

  // --- Parameter raster (GeoTIFF, CRS EPSG:4326) ---
  { key: 'curah_hujan',   title: 'Curah Hujan',     file: './data/Curah Hujan 2015-20221.tif',        type: 'raster', ramp: 'hujan', unit: 'mm' },
  { key: 'cuaca',         title: 'Parameter Cuaca', file: './data/PARAMETER CUACA 2015-20221.tif',    type: 'raster', ramp: 'hujan' },
  { key: 'ndvi',          title: 'NDVI',            file: './data/ndvi.tif',                          type: 'raster', ramp: 'ndvi' },
  { key: 'lst',           title: 'LST',             file: './data/LST_Gabungan_Kaltim_2015_2022.tif', type: 'raster', ramp: 'suhu', unit: '°C' },
  { key: 'aksesibilitas', title: 'Aksesibilitas',   file: './data/aksesibilitas.tif',                 type: 'raster', ramp: 'akses' },
  { key: 'kerapatan_api', title: 'Kerapatan Api',   file: './data/kerapatan_KDE.tif',                 type: 'raster', ramp: 'api', transparentZero: true },
  { key: 'tutupan_lahan', title: 'Tutupan Lahan',   file: './data/tutupan_lahan.tif',                 type: 'raster', categorical: true,
    classes: {
      1: { label: 'Hutan',          color: '#14532d' },
      2: { label: 'Semak/Belukar',  color: '#65a30d' },
      3: { label: 'Pertanian',      color: '#facc15' },
      4: { label: 'Permukiman',     color: '#dc2626' },
      5: { label: 'Badan Air',      color: '#38bdf8' }
    } },

  // --- Parameter lain (GeoJSON) ---
  { key: 'ndmi',          title: 'Parameter: NDMI (Kelembapan)',           file: 'data/param_ndmi.geojson',          style: POLY('#06b6d4', '#0e7490') },
  { key: 'gambut',        title: 'Parameter: Lahan Gambut',                file: 'data/parameter_gambut.geojson',    style: POLY('#78350f', '#451a03') },
  { key: 'slope',         title: 'Parameter: Kemiringan Lereng (Slope)',   file: 'data/param_slope.geojson',         style: POLY('#a855f7', '#7e22ce') },
  { key: 'kawasan_hutan', title: 'Parameter: Kawasan Hutan',               file: 'data/param_kawasan_hutan.geojson', style: POLY('#14532d', '#052e16') }
];

// =========================================================================
// 1. INISIALISASI PETA, PANE (URUTAN TAMPILAN) & BASEMAP
// =========================================================================
const map = L.map('map').setView([-1.68, 113.38], 8);

// Urutan dari bawah ke atas: basemap (200) < raster < parameter < bahaya < AOI < titik
map.createPane('paneRaster').style.zIndex    = 300;
map.createPane('paneParameter').style.zIndex = 410;
map.createPane('paneBahaya').style.zIndex    = 420;
map.createPane('paneAOI').style.zIndex       = 440;
map.createPane('paneTitik').style.zIndex     = 450;

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const satelit = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 18,
  attribution: 'Tiles &copy; Esri'
});

const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap &copy; CARTO'
});

L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

L.control.layers({
  "OpenStreetMap": osm,
  "Citra Satelit (Esri)": satelit,
  "Mode Gelap (CartoDB)": darkMap
}, {}, { collapsed: true }).addTo(map);

// =========================================================================
// 2. LOGIKA NAVIGASI SUB-MENU (TAB)
// =========================================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.dataset.tab;
    document.getElementById(targetId).classList.add('active');

    if (targetId === 'tab-hasil' && baselineChart) baselineChart.resize();
  });
});

// =========================================================================
// 3. FUNGSI UTILITAS & POP-UP UNIVERSAL UNTUK DATA VEKTOR
// =========================================================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getSliderOpacity(key, fallback) {
  const el = document.querySelector(`.layer-opacity[data-layer="${key}"]`);
  const v = el ? parseFloat(el.value) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function createVectorPopup(layerTitle, properties, highlightBadge = null) {
  let rowsHtml = '';

  Object.entries(properties).forEach(([key, val]) => {
    if (key.startsWith('_')) return;

    const cleanKey = key.replace(/_/g, ' ');
    let displayVal = (val === null || val === undefined || val === '') ? '-' : val;

    if (typeof val === 'number') {
      displayVal = Number.isInteger(val) ? val.toLocaleString('id-ID') : val.toFixed(3);
    }

    rowsHtml += `
      <tr>
        <td class="popup-attr-key">${cleanKey}</td>
        <td class="popup-attr-val">${displayVal}</td>
      </tr>
    `;
  });

  const badgeHtml = highlightBadge
    ? `<div class="popup-badge" style="background:${highlightBadge.color}">${highlightBadge.text}</div>`
    : '';

  return `
    <div class="popup-wrapper">
      <div class="popup-header">${layerTitle}</div>
      ${badgeHtml}
      <div class="popup-table-scroll">
        <table class="popup-attr-table">
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

// =========================================================================
// 4. VARIABEL GLOBAL DATA, LAYER & GRAFIK
// =========================================================================
let rawBahayaData = null;
let totalHotspotCount = 0;
let baselineRekap = { Rendah: 0, Sedang: 0, Tinggi: 0 };
let baselineChart = null;
const rasterData = {}; // key -> { georaster, cfg }

const layersRegistry = { aoi: L.geoJSON(null), bahaya: L.geoJSON(null) };
DATA_LAYERS.forEach(cfg => { layersRegistry[cfg.key] = L.geoJSON(null); });

function getColor(kelas) {
  return kelas === 'Tinggi' ? '#dc2626' :
         kelas === 'Sedang' ? '#f59e0b' :
                              '#16a34a';
}

// =========================================================================
// 5. PERHITUNGAN MODEL BAHAYA
// =========================================================================
function hitungKelasBahaya(props, weights) {
  const sGambut    = parseFloat(props.skor_gambut ?? props.skor_iklim ?? 3);
  const sIklim     = parseFloat(props.skor_iklim ?? 3);
  const sPermukaan = parseFloat(props.skor_permukaan ?? props.skor_lst ?? sIklim);
  const sAkses     = parseFloat(props.skor_akses ?? props.skor_fisik ?? 3);

  const totalW = (weights.gambut + weights.iklim + weights.permukaan + weights.akses) || 1;

  const skor = (
    (sGambut * weights.gambut) +
    (sIklim * weights.iklim) +
    (sPermukaan * weights.permukaan) +
    (sAkses * weights.akses)
  ) / totalW;

  let kelas = 'Rendah';
  if (skor >= 3.5) kelas = 'Tinggi';
  else if (skor >= 2.3) kelas = 'Sedang';

  return { skor: skor.toFixed(2), kelas };
}

function renderBahayaLayer(options = { autoZoom: false, isBaseline: false }) {
  if (!rawBahayaData) return;

  const weights = options.isBaseline ? DEFAULT_WEIGHTS : activeWeights;
  const keyword = document.getElementById('search-wilayah').value.toLowerCase().trim();
  const filterKab = document.getElementById('filter-kab').value;
  const filterKelas = document.getElementById('filter-kelas').value;
  const opacityVal = getSliderOpacity('bahaya', 0.7);

  if (map.hasLayer(layersRegistry.bahaya)) {
    map.removeLayer(layersRegistry.bahaya);
  }

  let luasTinggi = 0;
  let pendudukTinggi = 0;
  let rekapLuas = { Rendah: 0, Sedang: 0, Tinggi: 0 };

  const filteredFeatures = rawBahayaData.features.filter(f => {
    const p = f.properties;
    const namaKab = p.WADMKK || p.kabupaten || '';
    const namaKec = p.WADMKC || p.kecamatan || '';

    const hasil = hitungKelasBahaya(p, weights);
    p._skor_dinamis = hasil.skor;
    p._kelas_dinamis = hasil.kelas;

    const matchKab = (filterKab === 'ALL' || namaKab === filterKab);
    const matchKelas = (filterKelas === 'ALL' || hasil.kelas === filterKelas);
    const matchSearch = (
      keyword === '' ||
      namaKab.toLowerCase().includes(keyword) ||
      namaKec.toLowerCase().includes(keyword)
    );

    return matchKab && matchKelas && matchSearch;
  });

  layersRegistry.bahaya = L.geoJSON({ type: 'FeatureCollection', features: filteredFeatures }, {
    pane: 'paneBahaya',
    style: (feature) => ({
      fillColor: getColor(feature.properties._kelas_dinamis),
      weight: 1,
      opacity: 1,
      color: '#ffffff',
      fillOpacity: opacityVal
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const luas = parseFloat(p.luas_ha || 0);
      const penduduk = parseFloat(p.penduduk_terpapar || 0);

      rekapLuas[p._kelas_dinamis] += luas;
      if (p._kelas_dinamis === 'Tinggi') {
        luasTinggi += luas;
        pendudukTinggi += penduduk;
      }

      const badge = {
        color: getColor(p._kelas_dinamis),
        text: `Kelas Bahaya: ${p._kelas_dinamis} (Skor ${p._skor_dinamis})`
      };
      layer.bindPopup(createVectorPopup('Model Bahaya Karhutla', p, badge));
    }
  });

  syncLayerVisibility('bahaya');

  if (options.autoZoom && layersRegistry.bahaya.getBounds().isValid()) {
    map.fitBounds(layersRegistry.bahaya.getBounds(), { padding: [30, 30] });
  }

  if (options.isBaseline) {
    baselineRekap = { ...rekapLuas };
    updateBaselineStats(rekapLuas, luasTinggi, pendudukTinggi);
  }

  if (typeof window.onBahayaRendered === 'function') {
    window.onBahayaRendered({
      rekap: rekapLuas,
      luasTinggi,
      pendudukTinggi,
      isBaseline: !!options.isBaseline
    });
  }
}

// =========================================================================
// 6. STATISTIK MODEL AWAL (SUB-MENU 2)
// =========================================================================
function updateBaselineStats(rekap, luasTinggi, pendudukTinggi) {
  const totalLuas = rekap.Rendah + rekap.Sedang + rekap.Tinggi;

  setText('base-luas-total', `${totalLuas.toLocaleString('id-ID')} Ha`);
  setText('base-luas-tinggi', `${luasTinggi.toLocaleString('id-ID')} Ha`);
  setText('base-penduduk', `${pendudukTinggi.toLocaleString('id-ID')} Jiwa`);
  setText('base-hotspot', `${totalHotspotCount.toLocaleString('id-ID')} Titik`);

  const tbody = document.getElementById('baseline-table-body');
  if (tbody) {
    tbody.innerHTML = ['Tinggi', 'Sedang', 'Rendah'].map(k => {
      const persen = totalLuas > 0 ? ((rekap[k] / totalLuas) * 100).toFixed(1) : '0.0';
      return `
        <tr>
          <td><b style="color:${getColor(k)}">${k}</b></td>
          <td>${rekap[k].toLocaleString('id-ID')}</td>
          <td>${persen}%</td>
        </tr>
      `;
    }).join('');
  }

  const canvas = document.getElementById('baselineChart');
  if (!canvas) return;
  if (baselineChart) baselineChart.destroy();
  baselineChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Rendah', 'Sedang', 'Tinggi'],
      datasets: [{
        data: [rekap.Rendah, rekap.Sedang, rekap.Tinggi],
        backgroundColor: ['#16a34a', '#f59e0b', '#dc2626'],
        borderColor: '#0f172a',
        borderWidth: 2
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 11 } } }
      }
    }
  });
}

// =========================================================================
// 7. SINKRONISASI & PEMUATAN DATA: AOI, VEKTOR, RASTER, TILE
// =========================================================================
const loadedKeys = new Set();

function syncLayerVisibility(key) {
  const cb = document.querySelector(`.layer-toggle[data-layer="${key}"]`);
  const targetLayer = layersRegistry[key];
  if (!cb || !targetLayer) return;

  if (cb.checked) {
    if (!map.hasLayer(targetLayer)) targetLayer.addTo(map);
    // Bawa layer raster yang baru dicentang ke urutan paling atas di paneRaster
    if (typeof targetLayer.bringToFront === 'function') targetLayer.bringToFront();
  } else {
    if (map.hasLayer(targetLayer)) map.removeLayer(targetLayer);
  }

  updateRasterLegend();
}

function registerLayer(key, layer, defaultOn = false) {
  const old = layersRegistry[key];
  if (old && map.hasLayer(old)) map.removeLayer(old);

  layersRegistry[key] = layer;
  loadedKeys.add(key);

  const cb = document.querySelector(`.layer-toggle[data-layer="${key}"]`);
  if (cb) {
    syncLayerVisibility(key);
  } else if (defaultOn) {
    layer.addTo(map);
    updateRasterLegend();
  }
}

async function loadAOI() {
  try {
    const res = await fetch(AOI_FILE);
    if (!res.ok) {
      console.warn(`AOI: ${AOI_FILE} tidak ditemukan (${res.status})`);
      return;
    }
    const data = await res.json();

    const layer = L.geoJSON(data, {
      pane: 'paneAOI',
      interactive: false,
      style: { color: '#d9480f', weight: 2.5, fill: false }
    });
    registerLayer('aoi', layer, true);

    if (layer.getBounds().isValid()) map.fitBounds(layer.getBounds());
  } catch (err) {
    console.warn('AOI dilewati:', err.message);
  }
}

async function loadVector(cfg) {
  const res = await fetch(cfg.file);
  if (!res.ok) {
    console.warn(`Layer ${cfg.key}: ${cfg.file} tidak ditemukan (${res.status})`);
    return;
  }
  const data = await res.json();

  if (cfg.key === 'titik_api' && Array.isArray(data.features)) {
    totalHotspotCount = data.features.length;
    setText('base-hotspot', `${totalHotspotCount.toLocaleString('id-ID')} Titik`);
  }

  const style = { ...cfg.style, fillOpacity: getSliderOpacity(cfg.key, cfg.style.fillOpacity) };
  const pane = cfg.point ? 'paneTitik' : 'paneParameter';

  const layer = L.geoJSON(data, {
    pane,
    style: cfg.point ? undefined : style,
    pointToLayer: cfg.point ? (f, latlng) => L.circleMarker(latlng, { ...style, pane }) : undefined,
    onEachFeature: (feature, lyr) => {
      lyr.bindPopup(createVectorPopup(cfg.title, feature.properties));
    }
  });
  registerLayer(cfg.key, layer);
}

async function loadRaster(cfg) {
  if (typeof parseGeoraster === 'undefined' || typeof GeoRasterLayer === 'undefined') {
    console.warn(`Layer ${cfg.key}: pustaka georaster belum dimuat di index.html`);
    return;
  }
  const res = await fetch(cfg.file);
  if (!res.ok) {
    console.warn(`Layer ${cfg.key}: ${cfg.file} tidak ditemukan (${res.status})`);
    return;
  }
  const georaster = await parseGeoraster(await res.arrayBuffer());
  if (georaster.projection !== 4326) {
    console.warn(`Layer ${cfg.key}: CRS raster ${georaster.projection}, sebaiknya reproyeksi ke EPSG:4326`);
  }

  const min = georaster.mins[0];
  const max = georaster.maxs[0];
  const ramp = RAMPS[cfg.ramp] || RAMPS.api;

  // Tandai layer mana saja yang datanya benar-benar berhasil dimuat
const loadedKeys = new Set();

// Perbarui fungsi registerLayer agar mencatat layer yang sukses dimuat
function registerLayer(key, layer, defaultOn = false) {
  const old = layersRegistry[key];
  if (old && map.hasLayer(old)) map.removeLayer(old);

  layersRegistry[key] = layer;
  loadedKeys.add(key);

  const cb = document.querySelector(`.layer-toggle[data-layer="${key}"]`);
  if (cb) {
    syncLayerVisibility(key);
  } else if (defaultOn) {
    layer.addTo(map);
    updateRasterLegend();
  }
}

// Kontrol Checkbox: pastikan setiap checkbox terikat eksklusif pada data-layer miliknya
// Kontrol Checkbox Hidup/Mati Layer (Hanya 1 listener per checkbox)
document.querySelectorAll('.layer-toggle').forEach(checkbox => {
  checkbox.addEventListener('change', (e) => {
    const key = e.target.dataset.layer;
    console.log(`[Toggle Layer] key="${key}", checked=${e.target.checked}, dataSiap=${loadedKeys.has(key)}`);
    syncLayerVisibility(key);
  });
});

  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    const key = checkbox.dataset.layer;
    console.log(`[Toggle Layer] key="${key}", checked=${checkbox.checked}, dataSiap=${loadedKeys.has(key)}`);

    if (!loadedKeys.has(key) && key !== 'bahaya') {
      console.warn(`Layer "${key}" belum selesai dimuat atau file tidak ditemukan di folder data/.`);
    }

    syncLayerVisibility(key);
  });
});
  
  const colorFn = cfg.colorFn || (v => {
    if (v === null || v === undefined || Number.isNaN(v) || v === georaster.noDataValue) return null;
    if (cfg.transparentZero && v === 0) return null;

    if (cfg.categorical || cfg.classes) {
      const kelas = cfg.classes && cfg.classes[v];
      if (kelas) return kelas.color;
      return cfg.classes ? null : CAT_PALETTE[Math.abs(Math.round(v)) % CAT_PALETTE.length];
    }

    const t = max > min ? (v - min) / (max - min) : 1;
    return ramp(Math.min(1, Math.max(0, t)));
  });

  const layer = new GeoRasterLayer({
    georaster,
    pane: 'paneRaster',
    opacity: getSliderOpacity(cfg.key, 0.7),
    resolution: 256,
    pixelValuesToColorFn: colorFn
  });

  rasterData[cfg.key] = { georaster, cfg };
  registerLayer(cfg.key, layer);
}

function loadTile(cfg) {
  const layer = L.tileLayer(cfg.file, {
    pane: 'paneRaster',
    minZoom: cfg.minZoom ?? 0,
    maxNativeZoom: cfg.maxZoom ?? 13,
    maxZoom: 19,
    tms: !!cfg.tms,
    opacity: getSliderOpacity(cfg.key, 0.7)
  });
  registerLayer(cfg.key, layer);
}

async function loadLayer(cfg) {
  try {
    if (cfg.type === 'raster') return await loadRaster(cfg);
    if (cfg.type === 'tile') return loadTile(cfg);
    return await loadVector(cfg);
  } catch (err) {
    console.warn(`Layer ${cfg.key} (${cfg.file}) dilewati:`, err.message);
  }
}

async function initAllData() {
  await Promise.all([loadAOI(), ...DATA_LAYERS.map(loadLayer)]);

  try {
    const res = await fetch(BAHAYA_FILE);
    if (!res.ok) throw new Error(`${BAHAYA_FILE} tidak ditemukan (${res.status})`);
    rawBahayaData = await res.json();

    const kabSet = new Set(
      rawBahayaData.features
        .map(f => f.properties.WADMKK || f.properties.kabupaten)
        .filter(Boolean)
    );
    const selectKab = document.getElementById('filter-kab');
    Array.from(kabSet).sort().forEach(kab => {
      const opt = document.createElement('option');
      opt.value = kab;
      opt.textContent = kab;
      selectKab.appendChild(opt);
    });

    renderBahayaLayer({ autoZoom: true, isBaseline: true });
  } catch (err) {
    console.error('Gagal memuat model bahaya. Pastikan dijalankan via Live Server:', err);
  }
}

// =========================================================================
// 8. LEGENDA PETA (VEKTOR + RASTER DINAMIS) & EVENT LISTENERS
// =========================================================================
const legend = L.control({ position: 'bottomright' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = `
    <strong>Kelas Bahaya Karhutla</strong><br/>
    <i style="background:#dc2626"></i> Tinggi (Skor &ge; 3.5)<br/>
    <i style="background:#f59e0b"></i> Sedang (2.3 – 3.4)<br/>
    <i style="background:#16a34a"></i> Rendah (&lt; 2.3)<br/>
    <hr style="margin:5px 0; border-color:#475569"/>
    <i style="background:transparent; border:2px solid #d9480f"></i> Batas AOI<br/>
    <i style="background:#fef08a; border:1px solid #dc2626; border-radius:50%"></i> Titik Api Historis<br/>
    <i style="background:#38bdf8; border:1px solid #0369a1; border-radius:50%"></i> Fasilitas Terdampak
    <div id="raster-legend-container"></div>
  `;
  return div;
};
legend.addTo(map);

function updateRasterLegend() {
  const container = document.getElementById('raster-legend-container');
  if (!container) return;

  let html = '';

  Object.entries(rasterData).forEach(([key, { georaster, cfg }]) => {
    if (!map.hasLayer(layersRegistry[key])) return;

    html += `<hr style="margin:6px 0; border-color:#475569"/>`;
    html += `<strong>${cfg.title}</strong><br/>`;

    if (cfg.categorical || cfg.classes) {
      if (cfg.classes) {
        Object.values(cfg.classes).forEach(cls => {
          html += `<i style="background:${cls.color}"></i> ${cls.label}<br/>`;
        });
      }
    } else {
      const rampFn = RAMPS[cfg.ramp] || RAMPS.api;
      const min = georaster.mins[0];
      const max = georaster.maxs[0];
      const unit = cfg.unit ? ` ${cfg.unit}` : '';
      const stops = [0, 0.25, 0.5, 0.75, 1].map(t => rampFn(t)).join(', ');

      html += `
        <div class="raster-gradient-bar" style="background: linear-gradient(to right, ${stops});"></div>
        <div class="raster-gradient-labels">
          <span>${Number.isInteger(min) ? min : min.toFixed(2)}${unit}</span>
          <span>${Number.isInteger(max) ? max : max.toFixed(2)}${unit}</span>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

// Kontrol Checkbox Hidup/Mati Layer
document.querySelectorAll('.layer-toggle').forEach(checkbox => {
  checkbox.addEventListener('change', (e) => {
    syncLayerVisibility(e.target.dataset.layer);
  });
});

// Kontrol Slider Transparansi Layer
document.querySelectorAll('.layer-opacity').forEach(slider => {
  slider.addEventListener('input', (e) => {
    const key = e.target.dataset.layer;
    const opacityVal = parseFloat(e.target.value);
    const targetLayer = layersRegistry[key];
    if (!targetLayer) return;

    if (typeof targetLayer.setStyle === 'function') {
      targetLayer.setStyle({ fillOpacity: opacityVal, opacity: opacityVal });
    } else if (typeof targetLayer.setOpacity === 'function') {
      targetLayer.setOpacity(opacityVal);
    }
  });
});

// Event Filter Wilayah (Sub-Menu 1)
document.getElementById('filter-kab').addEventListener('change', () => renderBahayaLayer({ autoZoom: true, isBaseline: false }));
document.getElementById('filter-kelas').addEventListener('change', () => renderBahayaLayer({ autoZoom: false, isBaseline: false }));
document.getElementById('search-wilayah').addEventListener('input', () => renderBahayaLayer({ autoZoom: true, isBaseline: false }));

document.getElementById('btn-reset-filter').addEventListener('click', () => {
  document.getElementById('search-wilayah').value = '';
  document.getElementById('filter-kab').value = 'ALL';
  document.getElementById('filter-kelas').value = 'ALL';
  renderBahayaLayer({ autoZoom: true, isBaseline: false });
});

// Event Tombol Tampilkan Model Awal (Sub-Menu 2)
document.getElementById('btn-show-baseline').addEventListener('click', () => {
  renderBahayaLayer({ autoZoom: false, isBaseline: true });
});

// =========================================================================
// 8b. KLIK PETA: BACA NILAI PIKSEL RASTER YANG SEDANG TAMPIL
// =========================================================================
function nilaiRasterDi(georaster, latlng) {
  if (georaster.projection !== 4326) return null;
  const col = Math.floor((latlng.lng - georaster.xmin) / georaster.pixelWidth);
  const row = Math.floor((georaster.ymax - latlng.lat) / georaster.pixelHeight);
  if (col < 0 || row < 0 || col >= georaster.width || row >= georaster.height) return null;

  const v = georaster.values[0][row][col];
  if (v === null || v === undefined || Number.isNaN(v) || v === georaster.noDataValue) return null;
  return v;
}

map.on('click', (e) => {
  const target = e.originalEvent && e.originalEvent.target;
  if (target && target.classList && target.classList.contains('leaflet-interactive')) return;

  const baris = [];
  Object.entries(rasterData).forEach(([key, { georaster, cfg }]) => {
    if (!map.hasLayer(layersRegistry[key])) return;
    const v = nilaiRasterDi(georaster, e.latlng);
    if (v === null) return;
    if (cfg.transparentZero && v === 0) return;

    const kelas = cfg.classes && cfg.classes[v];
    const teks = kelas ? kelas.label
      : (Number.isInteger(v) ? v.toLocaleString('id-ID') : v.toFixed(3)) + (cfg.unit ? ' ' + cfg.unit : '');
    baris.push(`<tr><td class="popup-attr-key">${cfg.title}</td><td class="popup-attr-val">${teks}</td></tr>`);
  });
  if (baris.length === 0) return;

  L.popup()
    .setLatLng(e.latlng)
    .setContent(`
      <div class="popup-wrapper">
        <div class="popup-header">Nilai Raster</div>
        <div class="popup-table-scroll">
          <table class="popup-attr-table"><tbody>${baris.join('')}</tbody></table>
        </div>
      </div>`)
    .openOn(map);
});

// =========================================================================
// 9. ANTARMUKA UNTUK SKRIP LAIN (mis. simulasi.js) & START
// =========================================================================
window.WebGIS = {
  map,
  layersRegistry,
  DEFAULT_WEIGHTS,
  getColor,
  renderBahayaLayer,
  getBaselineRekap: () => baselineRekap,
  setBobotAktif: (w) => { activeWeights = { ...DEFAULT_WEIGHTS, ...w }; }
};

// Jalankan Aplikasi
initAllData();
