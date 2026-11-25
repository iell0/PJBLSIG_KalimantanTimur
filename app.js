// =========================================================================
// PELINDUNG EKSEKUSI GANDA
// =========================================================================
if (window.__WEBGIS_KARHUTLA_INITIALIZED__) {
  throw new Error('app.js sudah dijalankan sebelumnya. Menghentikan duplikasi.');
}
window.__WEBGIS_KARHUTLA_INITIALIZED__ = true;

// =========================================================================
// 0. KONFIGURASI DATA
// =========================================================================
const AOI_FILE = './data/AOI_Kaltim_PL_Kota.geojson';
const BAHAYA_FILE = 'data/model_bahaya_api.geojson';

const DEFAULT_WEIGHTS = {
  gambut: 30,
  iklim: 25,
  permukaan: 25,
  akses: 20
};

let activeWeights = { ...DEFAULT_WEIGHTS };

const POLY = (fill, line) => ({
  fillColor: fill,
  color: line,
  weight: 1,
  fillOpacity: 0.6
});

const RAMPS = {
  hujan: t => `hsl(205, 85%, ${88 - 53 * t}%)`,
  ndvi: t => `hsl(${40 + 80 * t}, 70%, ${65 - 25 * t}%)`,
  suhu: t => `hsl(${220 - 220 * t}, 85%, 50%)`,
  akses: t => `hsl(48, 95%, ${90 - 50 * t}%)`,
  api: t => `hsl(${60 - 60 * t}, 100%, 50%)`
};

const CAT_PALETTE = [
  '#14532d', '#65a30d', '#facc15', '#f97316',
  '#dc2626', '#38bdf8', '#a855f7', '#78350f'
];

const DATA_LAYERS = [
  {
    key: 'titik_api',
    title: 'Titik Api Historis (Hotspot)',
    file: 'data/titik_api_firms.geojson',
    point: true,
    style: {
      radius: 5,
      fillColor: '#fef08a',
      color: '#dc2626',
      weight: 1.5,
      fillOpacity: 0.9
    }
  },
  {
    key: 'dampak',
    title: 'Objek Analisis Dampak',
    file: 'data/dampak_fasilitas.geojson',
    point: true,
    style: {
      radius: 6,
      fillColor: '#38bdf8',
      color: '#0369a1',
      weight: 1.5,
      fillOpacity: 0.9
    }
  },
  {
    key: 'curah_hujan',
    title: 'Curah Hujan',
    file: './data/Curah Hujan 2015-20221.tif',
    type: 'raster',
    ramp: 'hujan',
    unit: 'mm'
  },
  {
    key: 'cuaca',
    title: 'Parameter Cuaca',
    file: './data/PARAMETER CUACA 2015-20221.tif',
    type: 'raster',
    ramp: 'hujan'
  },
  {
    key: 'ndvi',
    title: 'NDVI',
    file: './data/ndvi.tif',
    type: 'raster',
    ramp: 'ndvi'
  },
  {
    key: 'lst',
    title: 'LST',
    file: './data/LST_Gabungan_Kaltim_2015_2022.tif',
    type: 'raster',
    ramp: 'suhu',
    unit: '°C'
  },
  {
    key: 'aksesibilitas',
    title: 'Aksesibilitas',
    file: './data/aksesibilitas.tif',
    type: 'raster',
    ramp: 'akses'
  },
  {
    key: 'kerapatan_api',
    title: 'Kerapatan Api',
    file: './data/kerapatan_KDE.tif',
    type: 'raster',
    ramp: 'api',
    transparentZero: true
  },
  {
    key: 'tutupan_lahan',
    title: 'Tutupan Lahan',
    file: './data/tutupan_lahan.tif',
    type: 'raster',
    categorical: true,
    classes: {
      1: { label: 'Hutan', color: '#14532d' },
      2: { label: 'Semak/Belukar', color: '#65a30d' },
      3: { label: 'Pertanian', color: '#facc15' },
      4: { label: 'Permukiman', color: '#dc2626' },
      5: { label: 'Badan Air', color: '#38bdf8' }
    }
  },
  {
    key: 'ndmi',
    title: 'Parameter: NDMI (Kelembapan)',
    file: 'data/param_ndmi.geojson',
    style: POLY('#06b6d4', '#0e7490')
  },
  {
    key: 'gambut',
    title: 'Parameter: Lahan Gambut',
    file: 'data/parameter_gambut.geojson',
    style: POLY('#78350f', '#451a03')
  },
  {
    key: 'slope',
    title: 'Parameter: Kemiringan Lereng (Slope)',
    file: 'data/param_slope.geojson',
    style: POLY('#a855f7', '#7e22ce')
  },
  {
    key: 'kawasan_hutan',
    title: 'Parameter: Kawasan Hutan',
    file: 'data/param_kawasan_hutan.geojson',
    style: POLY('#14532d', '#052e16')
  }
];

// =========================================================================
// 1. INISIALISASI PETA, PANE DAN BASEMAP
// =========================================================================
const map = L.map('map').setView([-1.68, 113.38], 8);

// PERBAIKAN: sebelumnya semua raster berbagi satu pane (paneRaster, z 400),
// sedangkan poligon parameter (z 410) dan Model Bahaya (z 420) selalu berada
// DI ATAS raster. Akibatnya layer yang diaktifkan belakangan bisa tertutup
// layer yang sudah tampil lebih dulu ("terkunci").
// Sekarang setiap layer tematik punya pane sendiri, dan layer yang terakhir
// diaktifkan pengguna selalu dipindah ke paling atas (bringLayerToFront).
const PANE_Z_DASAR = 401;              // 401–439: layer tematik + model bahaya
map.createPane('paneAOI').style.zIndex = 440;
map.createPane('paneTitik').style.zIndex = 450;

let urutanPane = [];

function paneFor(key) {
  const nama = `pane_${key}`;
  if (!map.getPane(nama)) {
    map.createPane(nama);
    urutanPane.push(key);
    terapkanUrutanPane();
  }
  return nama;
}

function terapkanUrutanPane() {
  urutanPane.forEach((k, i) => {
    const pane = map.getPane(`pane_${k}`);
    if (pane) pane.style.zIndex = PANE_Z_DASAR + i;
  });
}

function bringLayerToFront(key) {
  if (!map.getPane(`pane_${key}`)) return;   // layer titik memakai paneTitik
  urutanPane = urutanPane.filter(k => k !== key);
  urutanPane.push(key);
  terapkanUrutanPane();
}

const osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }
).addTo(map);

const satelit = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    maxZoom: 18,
    attribution: 'Tiles &copy; Esri'
  }
);

const darkMap = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }
);

L.control.scale({
  metric: true,
  imperial: false,
  position: 'bottomleft'
}).addTo(map);

L.control.layers({
  'OpenStreetMap': osm,
  'Citra Satelit (Esri)': satelit,
  'Mode Gelap (CartoDB)': darkMap
}, {}, {
  collapsed: true
}).addTo(map);

DATA_LAYERS.filter(cfg => !cfg.point).forEach(cfg => paneFor(cfg.key));
paneFor('bahaya');

// =========================================================================
// 2. NAVIGASI SUB-MENU
// =========================================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {

    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.remove('active')
    );

    document.querySelectorAll('.tab-content').forEach(c =>
      c.classList.remove('active')
    );

    btn.classList.add('active');

    const targetId = btn.dataset.tab;
    const target = document.getElementById(targetId);

    if (target) target.classList.add('active');

    if (targetId === 'tab-hasil' && baselineChart) {
      baselineChart.resize();
    }

  });
});

// =========================================================================
// 3. FUNGSI UTILITAS DAN POPUP
// =========================================================================
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getSliderOpacity(key, fallback) {
  const el = document.querySelector(
    `.layer-opacity[data-layer="${key}"]`
  );

  const value = el ? parseFloat(el.value) : NaN;

  return Number.isFinite(value) ? value : fallback;
}

function createVectorPopup(layerTitle, properties, highlightBadge = null) {

  let rowsHtml = '';

  Object.entries(properties || {}).forEach(([key, val]) => {

    if (key.startsWith('_')) return;

    const cleanKey = key.replace(/_/g, ' ');

    let displayVal =
      (val === null || val === undefined || val === '')
        ? '-'
        : val;

    if (typeof val === 'number') {
      displayVal = Number.isInteger(val)
        ? val.toLocaleString('id-ID')
        : val.toFixed(3);
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
// 4. VARIABEL GLOBAL DATA DAN LAYER
// =========================================================================
let rawBahayaData = null;
let totalHotspotCount = 0;

let baselineRekap = {
  Rendah: 0,
  Sedang: 0,
  Tinggi: 0
};

let baselineChart = null;

const rasterData = {};
const loadedKeys = new Set();

const layersRegistry = {
  aoi: L.geoJSON(null),
  bahaya: L.geoJSON(null)
};

DATA_LAYERS.forEach(cfg => {
  layersRegistry[cfg.key] = L.geoJSON(null);
});

function getColor(kelas) {
  return kelas === 'Tinggi' ? '#dc2626' :
         kelas === 'Sedang' ? '#f59e0b' :
                              '#16a34a';
}

// =========================================================================
// 5. PERHITUNGAN MODEL BAHAYA
// =========================================================================
function hitungKelasBahaya(props, weights) {

  const sGambut = parseFloat(
    props.skor_gambut ?? props.skor_iklim ?? 3
  );

  const sIklim = parseFloat(props.skor_iklim ?? 3);

  const sPermukaan = parseFloat(
    props.skor_permukaan ?? props.skor_lst ?? sIklim
  );

  const sAkses = parseFloat(
    props.skor_akses ?? props.skor_fisik ?? 3
  );

  const totalW = (
    weights.gambut +
    weights.iklim +
    weights.permukaan +
    weights.akses
  ) || 1;

  const skor = (
    (sGambut * weights.gambut) +
    (sIklim * weights.iklim) +
    (sPermukaan * weights.permukaan) +
    (sAkses * weights.akses)
  ) / totalW;

  let kelas = 'Rendah';

  if (skor >= 3.5) {
    kelas = 'Tinggi';
  } else if (skor >= 2.3) {
    kelas = 'Sedang';
  }

  return {
    skor: skor.toFixed(2),
    kelas
  };
}

function renderBahayaLayer(
  options = { autoZoom: false, isBaseline: false }
) {

  if (!rawBahayaData) return;

  const weights = options.isBaseline
    ? DEFAULT_WEIGHTS
    : activeWeights;

  const searchEl = document.getElementById('search-wilayah');
  const kabEl = document.getElementById('filter-kab');
  const kelasEl = document.getElementById('filter-kelas');

  const keyword = searchEl
    ? searchEl.value.toLowerCase().trim()
    : '';

  const filterKab = kabEl ? kabEl.value : 'ALL';
  const filterKelas = kelasEl ? kelasEl.value : 'ALL';

  const opacityVal = getSliderOpacity('bahaya', 0.7);

  const previousLayer = layersRegistry.bahaya;
  const wasVisible = map.hasLayer(previousLayer);

  if (wasVisible) {
    map.removeLayer(previousLayer);
  }

  let luasTinggi = 0;
  let pendudukTinggi = 0;

  const rekapLuas = {
    Rendah: 0,
    Sedang: 0,
    Tinggi: 0
  };

  const filteredFeatures = (
    rawBahayaData.features || []
  ).filter(feature => {

    const props = feature.properties || {};

    const namaKab = String(
      props.WADMKK || props.kabupaten || ''
    );

    const namaKec = String(
      props.WADMKC || props.kecamatan || ''
    );

    const hasil = hitungKelasBahaya(props, weights);

    props._skor_dinamis = hasil.skor;
    props._kelas_dinamis = hasil.kelas;

    const matchKab =
      filterKab === 'ALL' || namaKab === filterKab;

    const matchKelas =
      filterKelas === 'ALL' || hasil.kelas === filterKelas;

    const matchSearch = (
      keyword === '' ||
      namaKab.toLowerCase().includes(keyword) ||
      namaKec.toLowerCase().includes(keyword)
    );

    return matchKab && matchKelas && matchSearch;

  });

  const newBahayaLayer = L.geoJSON(
    {
      type: 'FeatureCollection',
      features: filteredFeatures
    },
    {
      pane: paneFor('bahaya'),

      style: feature => ({
        fillColor: getColor(
          feature.properties._kelas_dinamis
        ),
        weight: 1,
        opacity: 1,
        color: '#ffffff',
        fillOpacity: opacityVal
      }),

      onEachFeature: (feature, layer) => {

        const props = feature.properties || {};

        const luas = parseFloat(props.luas_ha || 0);
        const penduduk = parseFloat(
          props.penduduk_terpapar || 0
        );

        rekapLuas[props._kelas_dinamis] +=
          Number.isFinite(luas) ? luas : 0;

        if (props._kelas_dinamis === 'Tinggi') {

          luasTinggi += Number.isFinite(luas) ? luas : 0;

          pendudukTinggi +=
            Number.isFinite(penduduk) ? penduduk : 0;
        }

        const badge = {
          color: getColor(props._kelas_dinamis),
          text: `Kelas Bahaya: ${props._kelas_dinamis} (Skor ${props._skor_dinamis})`
        };

        layer.bindPopup(
          createVectorPopup(
            'Model Bahaya Karhutla',
            props,
            badge
          )
        );
      }
    }
  );

  layersRegistry.bahaya = newBahayaLayer;

  loadedKeys.add('bahaya');

  syncLayerVisibility('bahaya');

  if (
    options.autoZoom &&
    newBahayaLayer.getBounds().isValid()
  ) {
    map.fitBounds(
      newBahayaLayer.getBounds(),
      { padding: [30, 30] }
    );
  }

  if (options.isBaseline) {

    baselineRekap = { ...rekapLuas };

    updateBaselineStats(
      rekapLuas,
      luasTinggi,
      pendudukTinggi
    );
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
// 6. STATISTIK MODEL AWAL
// =========================================================================
function updateBaselineStats(
  rekap,
  luasTinggi,
  pendudukTinggi
) {

  const totalLuas =
    rekap.Rendah +
    rekap.Sedang +
    rekap.Tinggi;

  setText(
    'base-luas-total',
    `${totalLuas.toLocaleString('id-ID')} Ha`
  );

  setText(
    'base-luas-tinggi',
    `${luasTinggi.toLocaleString('id-ID')} Ha`
  );

  setText(
    'base-penduduk',
    `${pendudukTinggi.toLocaleString('id-ID')} Jiwa`
  );

  setText(
    'base-hotspot',
    `${totalHotspotCount.toLocaleString('id-ID')} Titik`
  );

  const tbody = document.getElementById(
    'baseline-table-body'
  );

  if (tbody) {

    tbody.innerHTML = [
      'Tinggi',
      'Sedang',
      'Rendah'
    ].map(kelas => {

      const persen = totalLuas > 0
        ? ((rekap[kelas] / totalLuas) * 100).toFixed(1)
        : '0.0';

      return `
        <tr>
          <td><b style="color:${getColor(kelas)}">${kelas}</b></td>
          <td>${rekap[kelas].toLocaleString('id-ID')}</td>
          <td>${persen}%</td>
        </tr>
      `;

    }).join('');
  }

  const canvas = document.getElementById('baselineChart');

  if (!canvas) return;

  if (baselineChart) {
    baselineChart.destroy();
  }

  baselineChart = new Chart(
    canvas.getContext('2d'),
    {
      type: 'doughnut',

      data: {
        labels: ['Rendah', 'Sedang', 'Tinggi'],

        datasets: [{
          data: [
            rekap.Rendah,
            rekap.Sedang,
            rekap.Tinggi
          ],

          backgroundColor: [
            '#16a34a',
            '#f59e0b',
            '#dc2626'
          ],

          borderColor: '#0f172a',
          borderWidth: 2
        }]
      },

      options: {
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#cbd5e1',
              font: { size: 11 }
            }
          }
        }
      }
    }
  );
}

// =========================================================================
// 7. PENGELOLAAN LAYER: MANUAL MULTI-LAYER + MODEL BAHAYA SWITCH
// =========================================================================

const THEMATIC_KEYS = DATA_LAYERS.map(cfg => cfg.key);
const BAHAYA_KEY = 'bahaya';

/**
 * Mengatur visibilitas layer berdasarkan checkbox.
 * Semua operasi dilakukan melalui API Leaflet.
 */
function syncLayerVisibility(key) {

  const checkbox = document.querySelector(
    `.layer-toggle[data-layer="${key}"]`
  );

  const layer = layersRegistry[key];

  if (!layer) return;

  const shouldShow = Boolean(
    checkbox && checkbox.checked
  );

  if (shouldShow) {

    if (!map.hasLayer(layer)) {
      layer.addTo(map);
    }

  } else if (map.hasLayer(layer)) {

    map.removeLayer(layer);
  }

  updateRasterLegend();
}

/**
 * Mematikan layer tertentu beserta checkbox-nya.
 */
function turnLayerOff(key) {

  const checkbox = document.querySelector(
    `.layer-toggle[data-layer="${key}"]`
  );

  const layer = layersRegistry[key];

  if (checkbox) {
    checkbox.checked = false;
  }

  if (layer && map.hasLayer(layer)) {
    map.removeLayer(layer);
  }
}

/**
 * Mekanisme pergantian layer:
 *
 * 1. Layer tematik biasa dapat tampil bersamaan.
 * 2. Model Bahaya mematikan seluruh layer tematik.
 * 3. Layer tematik yang diaktifkan mematikan Model Bahaya.
 * 4. Basemap dan AOI tidak ikut dimatikan.
 */
function handleLayerToggle(key, isChecked) {

  if (isChecked) {

    bringLayerToFront(key);

    if (key === BAHAYA_KEY) {

      // Aktifkan Model Bahaya:
      // matikan semua layer tematik lainnya.

      THEMATIC_KEYS.forEach(turnLayerOff);

    } else if (THEMATIC_KEYS.includes(key)) {

      // Aktifkan layer biasa:
      // matikan Model Bahaya saja.

      turnLayerOff(BAHAYA_KEY);

    }
  }

  syncLayerVisibility(key);

  updateRasterLegend();
}

/**
 * Mendaftarkan layer ke dalam registry.
 */
function registerLayer(key, layer, defaultOn = false) {

  const oldLayer = layersRegistry[key];

  if (oldLayer && map.hasLayer(oldLayer)) {
    map.removeLayer(oldLayer);
  }

  layersRegistry[key] = layer;

  loadedKeys.add(key);

  const checkbox = document.querySelector(
    `.layer-toggle[data-layer="${key}"]`
  );

  if (checkbox) {

    // Mengikuti status checkbox apabila sudah dicentang.

    syncLayerVisibility(key);

  } else if (defaultOn) {

    layer.addTo(map);

    updateRasterLegend();
  }
}

// =========================================================================
// 7A. MEMUAT AOI
// =========================================================================
async function loadAOI() {

  try {

    const res = await fetch(AOI_FILE);

    if (!res.ok) {

      console.warn(
        `AOI: ${AOI_FILE} tidak ditemukan (${res.status})`
      );

      return;
    }

    const data = await res.json();

    const layer = L.geoJSON(
      data,
      {
        pane: 'paneAOI',
        interactive: false,

        style: {
          color: '#d9480f',
          weight: 2.5,
          fill: false
        }
      }
    );

    registerLayer('aoi', layer, true);

    if (layer.getBounds().isValid()) {
      map.fitBounds(layer.getBounds());
    }

  } catch (err) {

    console.warn('AOI dilewati:', err.message);
  }
}

// =========================================================================
// 7B. MEMUAT DATA VEKTOR
// =========================================================================
async function loadVector(cfg) {

  const res = await fetch(cfg.file);

  if (!res.ok) {

    console.warn(
      `Layer ${cfg.key}: ${cfg.file} tidak ditemukan (${res.status})`
    );

    return;
  }

  const data = await res.json();

  if (
    cfg.key === 'titik_api' &&
    Array.isArray(data.features)
  ) {

    totalHotspotCount = data.features.length;

    setText(
      'base-hotspot',
      `${totalHotspotCount.toLocaleString('id-ID')} Titik`
    );
  }

  const style = {
    ...cfg.style,

    fillOpacity: getSliderOpacity(
      cfg.key,
      cfg.style && cfg.style.fillOpacity !== undefined
        ? cfg.style.fillOpacity
        : 0.6
    )
  };

  const pane = cfg.point
    ? 'paneTitik'
    : paneFor(cfg.key);

  const layer = L.geoJSON(
    data,
    {
      pane,

      style: cfg.point
        ? undefined
        : style,

      pointToLayer: cfg.point
        ? (feature, latlng) =>
            L.circleMarker(
              latlng,
              { ...style, pane }
            )
        : undefined,

      onEachFeature: (feature, lyr) => {

        lyr.bindPopup(
          createVectorPopup(
            cfg.title,
            feature.properties || {}
          )
        );
      }
    }
  );

  registerLayer(cfg.key, layer);
}

// =========================================================================
// 7C. MEMUAT DATA RASTER GEOTIFF
// =========================================================================
async function loadRaster(cfg) {

  if (
    typeof parseGeoraster === 'undefined' ||
    typeof GeoRasterLayer === 'undefined'
  ) {

    console.warn(
      `Layer ${cfg.key}: pustaka georaster belum dimuat di index.html`
    );

    return;
  }

  const res = await fetch(cfg.file);

  if (!res.ok) {

    console.warn(
      `Layer ${cfg.key}: ${cfg.file} tidak ditemukan (${res.status})`
    );

    return;
  }

  const georaster = await parseGeoraster(
    await res.arrayBuffer()
  );

  if (georaster.projection !== 4326) {

    console.warn(
      `Layer ${cfg.key}: CRS raster ${georaster.projection}, sebaiknya reproyeksi ke EPSG:4326`
    );
  }

  const min = georaster.mins[0];
  const max = georaster.maxs[0];

  const ramp = RAMPS[cfg.ramp] || RAMPS.api;

  const colorFn = cfg.colorFn || (value => {

    if (
      value === null ||
      value === undefined ||
      Number.isNaN(value) ||
      value === georaster.noDataValue
    ) {
      return null;
    }

    if (
      cfg.transparentZero &&
      value === 0
    ) {
      return null;
    }

    if (cfg.categorical || cfg.classes) {

      const kelas = cfg.classes && cfg.classes[value];

      if (kelas) {
        return kelas.color;
      }

      return cfg.classes
        ? null
        : CAT_PALETTE[
            Math.abs(Math.round(value)) %
            CAT_PALETTE.length
          ];
    }

    const t = max > min
      ? (value - min) / (max - min)
      : 1;

    return ramp(
      Math.min(1, Math.max(0, t))
    );

  });

  const layer = new GeoRasterLayer({

    georaster,

    // Pane sendiri per raster (lihat paneFor).
    pane: paneFor(cfg.key),

    opacity: getSliderOpacity(cfg.key, 0.7),

    resolution: 256,

    pixelValuesToColorFn: colorFn

  });

  rasterData[cfg.key] = {
    georaster,
    cfg
  };

  registerLayer(cfg.key, layer);
}

// =========================================================================
// 7D. MEMUAT TILE LAYER
// =========================================================================
function loadTile(cfg) {

  const layer = L.tileLayer(
    cfg.file,
    {
      pane: paneFor(cfg.key),

      minZoom: cfg.minZoom ?? 0,

      maxNativeZoom: cfg.maxZoom ?? 13,

      maxZoom: 19,

      tms: !!cfg.tms,

      opacity: getSliderOpacity(cfg.key, 0.7)
    }
  );

  registerLayer(cfg.key, layer);
}

// =========================================================================
// 7E. PEMILIHAN JENIS LAYER
// =========================================================================
async function loadLayer(cfg) {

  try {

    if (cfg.type === 'raster') {
      return await loadRaster(cfg);
    }

    if (cfg.type === 'tile') {
      return loadTile(cfg);
    }

    return await loadVector(cfg);

  } catch (err) {

    console.warn(
      `Layer ${cfg.key} (${cfg.file}) dilewati:`,
      err.message
    );
  }
}

// =========================================================================
// 7F. INISIALISASI SELURUH DATA
// =========================================================================
async function initAllData() {

  await Promise.all([
    loadAOI(),
    ...DATA_LAYERS.map(loadLayer)
  ]);

  try {

    const res = await fetch(BAHAYA_FILE);

    if (!res.ok) {

      throw new Error(
        `${BAHAYA_FILE} tidak ditemukan (${res.status})`
      );
    }

    rawBahayaData = await res.json();

    const kabSet = new Set(

      (rawBahayaData.features || [])

        .map(feature =>
          feature.properties?.WADMKK ||
          feature.properties?.kabupaten
        )

        .filter(Boolean)

    );

    const selectKab = document.getElementById(
      'filter-kab'
    );

    if (selectKab) {

      Array.from(kabSet)
        .sort()
        .forEach(kab => {

          const opt = document.createElement('option');

          opt.value = kab;
          opt.textContent = kab;

          selectKab.appendChild(opt);
        });
    }

    renderBahayaLayer({
      autoZoom: true,
      isBaseline: true
    });

  } catch (err) {

    console.error(
      'Gagal memuat model bahaya. Pastikan dijalankan via Live Server:',
      err
    );
  }
}

// =========================================================================
// 8. LEGENDA PETA
// =========================================================================
const legend = L.control({
  position: 'bottomright'
});

legend.onAdd = function () {

  const div = L.DomUtil.create(
    'div',
    'legend'
  );

  div.innerHTML = `
    <strong>Kelas Bahaya Karhutla</strong><br/>

    <i style="background:#dc2626"></i>
    Tinggi (Skor &ge; 3.5)<br/>

    <i style="background:#f59e0b"></i>
    Sedang (2.3 – 3.4)<br/>

    <i style="background:#16a34a"></i>
    Rendah (&lt; 2.3)<br/>

    <hr style="margin:5px 0; border-color:#475569"/>

    <i style="background:transparent; border:2px solid #d9480f"></i>
    Batas AOI<br/>

    <i style="background:#fef08a; border:1px solid #dc2626; border-radius:50%"></i>
    Titik Api Historis<br/>

    <i style="background:#38bdf8; border:1px solid #0369a1; border-radius:50%"></i>
    Fasilitas Terdampak

    <div id="raster-legend-container"></div>
  `;

  return div;
};

legend.addTo(map);

// =========================================================================
// 8A. LEGENDA RASTER DINAMIS
// =========================================================================
function updateRasterLegend() {

  const container = document.getElementById(
    'raster-legend-container'
  );

  if (!container) return;

  let html = '';

  Object.entries(rasterData).forEach(
    ([key, rasterInfo]) => {

      const { georaster, cfg } = rasterInfo;

      const layer = layersRegistry[key];

      if (!layer || !map.hasLayer(layer)) {
        return;
      }

      html += '<hr style="margin:6px 0; border-color:#475569"/>';

      html += `<strong>${cfg.title}</strong><br/>`;

      if (cfg.categorical || cfg.classes) {

        if (cfg.classes) {

          Object.values(cfg.classes).forEach(cls => {

            html += `
              <i style="background:${cls.color}"></i>
              ${cls.label}<br/>
            `;
          });
        }

      } else {

        const rampFn = RAMPS[cfg.ramp] || RAMPS.api;

        const min = georaster.mins[0];
        const max = georaster.maxs[0];

        const unit = cfg.unit
          ? ` ${cfg.unit}`
          : '';

        const stops = [
          0,
          0.25,
          0.5,
          0.75,
          1
        ]
          .map(t => rampFn(t))
          .join(', ');

        html += `
          <div
            class="raster-gradient-bar"
            style="background:linear-gradient(to right, ${stops})">
          </div>

          <div class="raster-gradient-labels">

            <span>
              ${Number.isInteger(min) ? min : min.toFixed(2)}${unit}
            </span>

            <span>
              ${Number.isInteger(max) ? max : max.toFixed(2)}${unit}
            </span>

          </div>
        `;
      }

    }
  );

  container.innerHTML = html;
}

// =========================================================================
// 8B. EVENT CHECKBOX LAYER
// =========================================================================
//
// Semua layer tematik dapat ditampilkan bersamaan.
// Model Bahaya akan mematikan layer tematik lainnya.
// Basemap dan AOI tetap ditampilkan.
//

document.querySelectorAll('.layer-toggle').forEach(
  checkbox => {

    checkbox.addEventListener('change', event => {

      const key = event.target.dataset.layer;

      handleLayerToggle(
        key,
        event.target.checked
      );

    });

  }
);

// =========================================================================
// 8C. SLIDER TRANSPARANSI LAYER
// =========================================================================
document.querySelectorAll('.layer-opacity').forEach(
  slider => {

    slider.addEventListener('input', event => {

      const key = event.target.dataset.layer;

      const opacityVal = parseFloat(
        event.target.value
      );

      const targetLayer = layersRegistry[key];

      if (
        !targetLayer ||
        !Number.isFinite(opacityVal)
      ) {
        return;
      }

      if (
        typeof targetLayer.setStyle === 'function'
      ) {

        targetLayer.setStyle({
          fillOpacity: opacityVal,
          opacity: opacityVal
        });

      } else if (
        typeof targetLayer.setOpacity === 'function'
      ) {

        targetLayer.setOpacity(opacityVal);
      }

    });

  }
);

// =========================================================================
// 8D. FILTER WILAYAH
// =========================================================================
// PERBAIKAN: sebelumnya filter, pencarian, reset, dan tombol "Tampilkan Hasil
// Model Awal" hanya menggambar ulang Model Bahaya. Jika checkbox Model Bahaya
// sudah mati (karena pengguna menyalakan layer tematik), hasilnya tidak pernah
// tampil dan peta tetap menampilkan layer sebelumnya.
function aktifkanModelBahaya() {
  const cb = document.querySelector(`.layer-toggle[data-layer="${BAHAYA_KEY}"]`);
  if (cb && !cb.checked) {
    cb.checked = true;
    handleLayerToggle(BAHAYA_KEY, true);
  } else {
    bringLayerToFront(BAHAYA_KEY);
  }
}

const filterKabEl = document.getElementById(
  'filter-kab'
);

if (filterKabEl) {

  filterKabEl.addEventListener('change', () => {

    aktifkanModelBahaya();
    renderBahayaLayer({
      autoZoom: true,
      isBaseline: false
    });

  });
}

const filterKelasEl = document.getElementById(
  'filter-kelas'
);

if (filterKelasEl) {

  filterKelasEl.addEventListener('change', () => {

    aktifkanModelBahaya();
    renderBahayaLayer({
      autoZoom: false,
      isBaseline: false
    });

  });
}

const searchWilayahEl = document.getElementById(
  'search-wilayah'
);

if (searchWilayahEl) {

  searchWilayahEl.addEventListener('input', () => {

    aktifkanModelBahaya();
    renderBahayaLayer({
      autoZoom: true,
      isBaseline: false
    });

  });
}

// =========================================================================
// 8E. RESET FILTER
// =========================================================================
const resetFilterBtn = document.getElementById(
  'btn-reset-filter'
);

if (resetFilterBtn) {

  resetFilterBtn.addEventListener('click', () => {

    if (searchWilayahEl) {
      searchWilayahEl.value = '';
    }

    if (filterKabEl) {
      filterKabEl.value = 'ALL';
    }

    if (filterKelasEl) {
      filterKelasEl.value = 'ALL';
    }

    aktifkanModelBahaya();
    renderBahayaLayer({
      autoZoom: true,
      isBaseline: false
    });

  });
}

// =========================================================================
// 8F. TOMBOL TAMPILKAN MODEL AWAL
// =========================================================================
const showBaselineBtn = document.getElementById(
  'btn-show-baseline'
);

if (showBaselineBtn) {

  showBaselineBtn.addEventListener('click', () => {

    aktifkanModelBahaya();
    renderBahayaLayer({
      autoZoom: false,
      isBaseline: true
    });

  });
}

// =========================================================================
// 8G. MEMBACA NILAI PIXEL RASTER
// =========================================================================
function nilaiRasterDi(georaster, latlng) {

  if (georaster.projection !== 4326) {
    return null;
  }

  const col = Math.floor(
    (latlng.lng - georaster.xmin) /
    georaster.pixelWidth
  );

  const row = Math.floor(
    (georaster.ymax - latlng.lat) /
    georaster.pixelHeight
  );

  if (
    col < 0 ||
    row < 0 ||
    col >= georaster.width ||
    row >= georaster.height
  ) {
    return null;
  }

  const value = georaster.values[0][row][col];

  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value) ||
    value === georaster.noDataValue
  ) {
    return null;
  }

  return value;
}

// =========================================================================
// 8H. EVENT KLIK PETA UNTUK MEMBACA NILAI RASTER
// =========================================================================
map.on('click', event => {

  const target =
    event.originalEvent &&
    event.originalEvent.target;

  if (
    target &&
    target.classList &&
    target.classList.contains('leaflet-interactive')
  ) {
    return;
  }

  const rows = [];

  Object.entries(rasterData).forEach(
    ([key, rasterInfo]) => {

      const { georaster, cfg } = rasterInfo;

      const layer = layersRegistry[key];

      // Hanya membaca raster yang aktif di peta.
      if (
        !layer ||
        !map.hasLayer(layer)
      ) {
        return;
      }

      const value = nilaiRasterDi(
        georaster,
        event.latlng
      );

      if (value === null) return;

      if (
        cfg.transparentZero &&
        value === 0
      ) {
        return;
      }

      const kelas =
        cfg.classes &&
        cfg.classes[value];

      const textValue = kelas
        ? kelas.label
        : (
            Number.isInteger(value)
              ? value.toLocaleString('id-ID')
              : value.toFixed(3)
          ) + (cfg.unit ? ` ${cfg.unit}` : '');

      rows.push(
        `<tr>
          <td class="popup-attr-key">${cfg.title}</td>
          <td class="popup-attr-val">${textValue}</td>
        </tr>`
      );

    }
  );

  if (rows.length === 0) {
    return;
  }

  L.popup()
    .setLatLng(event.latlng)

    .setContent(`
      <div class="popup-wrapper">

        <div class="popup-header">
          Nilai Raster
        </div>

        <div class="popup-table-scroll">

          <table class="popup-attr-table">
            <tbody>
              ${rows.join('')}
            </tbody>
          </table>

        </div>

      </div>
    `)

    .openOn(map);

});

// =========================================================================
// 9. ANTARMUKA UNTUK SKRIP LAIN DAN START APLIKASI
// =========================================================================
window.WebGIS = {

  map,

  layersRegistry,

  DEFAULT_WEIGHTS,

  getColor,

  renderBahayaLayer,

  syncLayerVisibility,

  bringLayerToFront,

  getBaselineRekap: () => baselineRekap,

  setBobotAktif: weights => {

    activeWeights = {
      ...DEFAULT_WEIGHTS,
      ...weights
    };

  }

};

// =========================================================================
// JALANKAN APLIKASI
// =========================================================================
initAllData();
