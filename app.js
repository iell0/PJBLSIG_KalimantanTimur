// =========================================================================
// 1. INISIALISASI PETA & BASEMAP
// =========================================================================
const map = L.map('map').setView([-1.68, 113.38], 8);

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

// setelah variabel map dibuat
fetch('data/AOI_Kaltim_PL.geojson')
  .then(res => res.json())
  .then(data => {
    const aoiLayer = L.geoJSON(data, {
      style: {
        color: '#d9480f',
        weight: 2,
        fillOpacity: 0.75
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties && feature.properties.nama) {
          layer.bindPopup(feature.properties.nama);
        }
      }
    }).addTo(map);

    map.fitBounds(aoiLayer.getBounds()); // zoom otomatis ke AOI
  });

// Skala Peta (Wajib KAK)
L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

// Kontrol Pengganti Basemap di Pojok Kanan Atas
L.control.layers({
  "OpenStreetMap": osm,
  "Citra Satelit (Esri)": satelit,
  "Mode Gelap (CartoDB)": darkMap
}, {}, { collapsed: true }).addTo(map);

// =========================================================================
// 2. LOGIKA NAVIGASI 3 SUB-MENU (TAB)
// =========================================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    const targetId = btn.dataset.tab;
    document.getElementById(targetId).classList.add('active');

    // Perbarui ukuran grafik jika tab statistik dibuka
    if (targetId === 'tab-hasil' && baselineChart) baselineChart.resize();
    if (targetId === 'tab-simulasi' && simulasiChart) simulasiChart.resize();
  });
});

// =========================================================================
// 3. FUNGSI UNIVERSAL POP-UP UNTUK SEMUA DATA VEKTOR
// =========================================================================
function createVectorPopup(layerTitle, properties, highlightBadge = null) {
  let rowsHtml = '';

  Object.entries(properties).forEach(([key, val]) => {
    // Sembunyikan properti internal sementara (awalan _)
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
let simulasiChart = null;

const layersRegistry = {
  bahaya: L.geoJSON(null),
  dampak: L.geoJSON(null),
  curah_hujan: L.geoJSON(null),
  cuaca: L.geoJSON(null),
  lst: L.geoJSON(null),
  ndvi: L.geoJSON(null),
  ndmi: L.geoJSON(null),
  tutupan_lahan: L.geoJSON(null),
  gambut: L.geoJSON(null),
  slope: L.geoJSON(null),
  aksesibilitas: L.geoJSON(null),
  kawasan_hutan: L.geoJSON(null),
  titik_api: L.geoJSON(null)
};

function getColor(kelas) {
  return kelas === 'Tinggi' ? '#dc2626' :
         kelas === 'Sedang' ? '#f59e0b' :
                              '#16a34a';
}

// =========================================================================
// 5. PERHITUNGAN MODEL BAHAYA (AWAL & SIMULASI ON-THE-FLY)
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

  const weights = options.isBaseline
    ? { gambut: 30, iklim: 25, permukaan: 25, akses: 20 }
    : {
        gambut: parseFloat(document.getElementById('w-gambut').value),
        iklim: parseFloat(document.getElementById('w-iklim').value),
        permukaan: parseFloat(document.getElementById('w-permukaan').value),
        akses: parseFloat(document.getElementById('w-akses').value)
      };

  const keyword = document.getElementById('search-wilayah').value.toLowerCase().trim();
  const filterKab = document.getElementById('filter-kab').value;
  const filterKelas = document.getElementById('filter-kelas').value;
  const opacityVal = parseFloat(document.querySelector('.layer-opacity[data-layer="bahaya"]').value);

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

      // Pop-up Atribut Lengkap untuk Poligon Model Bahaya
      const badge = {
        color: getColor(p._kelas_dinamis),
        text: `Kelas Bahaya: ${p._kelas_dinamis} (Skor ${p._skor_dinamis})`
      };
      layer.bindPopup(createVectorPopup('Model Bahaya Karhutla', p, badge));
    }
  });

  // Tampilkan ke peta hanya jika checkbox bahaya dalam posisi aktif (checked)
  const cbBahaya = document.querySelector('.layer-toggle[data-layer="bahaya"]');
  if (cbBahaya && cbBahaya.checked) {
    layersRegistry.bahaya.addTo(map);
  }

  if (options.autoZoom && layersRegistry.bahaya.getBounds().isValid()) {
    map.fitBounds(layersRegistry.bahaya.getBounds(), { padding: [30, 30] });
  }

  // Simpan & perbarui statistik Sub-Menu 2 (Baseline) dan Sub-Menu 3 (Simulasi)
  if (options.isBaseline) {
    baselineRekap = { ...rekapLuas };
    updateBaselineStats(rekapLuas, luasTinggi, pendudukTinggi);
  }
  updateSimulasiStats(rekapLuas, luasTinggi, pendudukTinggi);
}

// =========================================================================
// 6. PEMBARUAN STATISTIKAL RASTER & GRAFIK (SUB-MENU 2 & SUB-MENU 3)
// =========================================================================
function updateBaselineStats(rekap, luasTinggi, pendudukTinggi) {
  const totalLuas = rekap.Rendah + rekap.Sedang + rekap.Tinggi;

  document.getElementById('base-luas-total').textContent = `${totalLuas.toLocaleString('id-ID')} Ha`;
  document.getElementById('base-luas-tinggi').textContent = `${luasTinggi.toLocaleString('id-ID')} Ha`;
  document.getElementById('base-penduduk').textContent = `${pendudukTinggi.toLocaleString('id-ID')} Jiwa`;
  document.getElementById('base-hotspot').textContent = `${totalHotspotCount.toLocaleString('id-ID')} Titik`;

  // Isi Tabel Statistik Baseline
  const tbody = document.getElementById('baseline-table-body');
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

  // Render Grafik Baseline
  const ctx = document.getElementById('baselineChart').getContext('2d');
  if (baselineChart) baselineChart.destroy();
  baselineChart = new Chart(ctx, {
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

function updateSimulasiStats(rekapSim, luasTinggiSim, pendudukSim) {
  const deltaLuas = luasTinggiSim - baselineRekap.Tinggi;
  const tanda = deltaLuas > 0 ? '+' : '';

  document.getElementById('sim-luas-tinggi').textContent = `${luasTinggiSim.toLocaleString('id-ID')} Ha`;
  document.getElementById('sim-delta-luas').textContent = `${tanda}${deltaLuas.toLocaleString('id-ID')} Ha`;
  document.getElementById('sim-penduduk').textContent = `${pendudukSim.toLocaleString('id-ID')} Jiwa`;

  // Tabel Perbandingan Awal vs Simulasi
  const tbody = document.getElementById('simulasi-table-body');
  tbody.innerHTML = ['Tinggi', 'Sedang', 'Rendah'].map(k => `
    <tr>
      <td><b style="color:${getColor(k)}">${k}</b></td>
      <td>${baselineRekap[k].toLocaleString('id-ID')}</td>
      <td>${rekapSim[k].toLocaleString('id-ID')}</td>
    </tr>
  `).join('');

  // Grafik Batang Perbandingan
  const ctx = document.getElementById('simulasiChart').getContext('2d');
  if (simulasiChart) simulasiChart.destroy();
  simulasiChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Rendah', 'Sedang', 'Tinggi'],
      datasets: [
        {
          label: 'Model Awal (Ha)',
          data: [baselineRekap.Rendah, baselineRekap.Sedang, baselineRekap.Tinggi],
          backgroundColor: '#64748b'
        },
        {
          label: 'Hasil Simulasi (Ha)',
          data: [rekapSim.Rendah, rekapSim.Sedang, rekapSim.Tinggi],
          backgroundColor: ['#16a34a', '#f59e0b', '#dc2626']
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } },
      scales: {
        y: { ticks: { color: '#cbd5e1' }, grid: { color: '#334155' } },
        x: { ticks: { color: '#cbd5e1' }, grid: { display: false } }
      }
    }
  });
}

// =========================================================================
// 7. PEMUATAN SEMUA FILE GEOJSON & POP-UP OTOMATIS
// =========================================================================
async function loadVectorLayer(key, title, filePath, styleOptions, isPoint = false) {
  try {
    const res = await fetch(filePath);
    if (!res.ok) return;
    const data = await res.json();

    if (key === 'titik_api' && Array.isArray(data.features)) {
      totalHotspotCount = data.features.length;
      document.getElementById('base-hotspot').textContent = `${totalHotspotCount.toLocaleString('id-ID')} Titik`;
    }

    layersRegistry[key] = L.geoJSON(data, {
      style: isPoint ? undefined : styleOptions,
      pointToLayer: isPoint ? (f, latlng) => L.circleMarker(latlng, styleOptions) : undefined,
      onEachFeature: (feature, layer) => {
        layer.bindPopup(createVectorPopup(title, feature.properties));
      }
    });

    const cb = document.querySelector(`.layer-toggle[data-layer="${key}"]`);
    if (cb && cb.checked) {
      layersRegistry[key].addTo(map);
    }
  } catch (err) {
    console.warn(`Layer ${key} (${filePath}) dilewati:`, err.message);
  }
}

async function initAllData() {
  try {
    // 1. Muat Layer Utama Model Bahaya Api
    const resBahaya = await fetch('data/model_bahaya_api.geojson');
    rawBahayaData = await resBahaya.json();

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

    // 2. Muat Kejadian Kebakaran (Titik Api) & Analisis Dampak
    await loadVectorLayer('titik_api', 'Titik Api Historis (Hotspot)', 'data/titik_api_firms.geojson', {
      radius: 5, fillColor: '#fef08a', color: '#dc2626', weight: 1.5, fillOpacity: 0.9
    }, true);

    await loadVectorLayer('dampak', 'Objek Analisis Dampak', 'data/dampak_fasilitas.geojson', {
      radius: 6, fillColor: '#38bdf8', color: '#0369a1', weight: 1.5, fillOpacity: 0.9
    }, true);

    // 3. Muat Layer Parameter (Iklim, Permukaan, Fisik Wilayah)
    await loadVectorLayer('curah_hujan', 'Parameter: Curah Hujan', 'data/param_curah_hujan.geojson',
      { fillColor: '#0284c7', color: '#0369a1', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('cuaca', 'Parameter: Kondisi Cuaca', 'data/param_cuaca.geojson',
      { fillColor: '#38bdf8', color: '#0284c7', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('lst', 'Parameter: LST (Suhu Permukaan)', 'data/param_lst.geojson',
      { fillColor: '#ef4444', color: '#b91c1c', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('ndvi', 'Parameter: NDVI (Vegetasi)', 'data/param_ndvi.geojson',
      { fillColor: '#22c55e', color: '#15803d', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('ndmi', 'Parameter: NDMI (Kelembapan)', 'data/param_ndmi.geojson',
      { fillColor: '#06b6d4', color: '#0e7490', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('tutupan_lahan', 'Parameter: Tutupan Lahan', 'data/param_tutupan_lahan.geojson',
      { fillColor: '#84cc16', color: '#4d7c0f', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('gambut', 'Parameter: Lahan Gambut', 'data/parameter_gambut.geojson',
      { fillColor: '#78350f', color: '#451a03', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('slope', 'Parameter: Kemiringan Lereng (Slope)', 'data/param_slope.geojson',
      { fillColor: '#a855f7', color: '#7e22ce', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('aksesibilitas', 'Parameter: Aksesibilitas', 'data/param_aksesibilitas.geojson',
      { fillColor: '#eab308', color: '#a16207', weight: 1, fillOpacity: 0.6 });
    await loadVectorLayer('kawasan_hutan', 'Parameter: Kawasan Hutan', 'data/param_kawasan_hutan.geojson',
      { fillColor: '#14532d', color: '#052e16', weight: 1, fillOpacity: 0.6 });

    // Render Model Awal & Zoom ke Wilayah Studi
    renderBahayaLayer({ autoZoom: true, isBaseline: true });

  } catch (err) {
    console.error("Gagal memuat data utama. Pastikan dijalankan via Live Server:", err);
  }
}

// =========================================================================
// 8. LEGENDA PETA & EVENT LISTENERS
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
    <i style="background:#fef08a; border:1px solid #dc2626; border-radius:50%"></i> Titik Api Historis<br/>
    <i style="background:#38bdf8; border:1px solid #0369a1; border-radius:50%"></i> Fasilitas Terdampak
  `;
  return div;
};
legend.addTo(map);

// Kontrol Checkbox Hidup/Mati Layer
document.querySelectorAll('.layer-toggle').forEach(checkbox => {
  checkbox.addEventListener('change', (e) => {
    const key = e.target.dataset.layer;
    const targetLayer = layersRegistry[key];
    if (!targetLayer) return;

    if (e.target.checked) targetLayer.addTo(map);
    else map.removeLayer(targetLayer);
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

// Event Simulasi Bobot On-the-Fly (Sub-Menu 3)
['gambut', 'iklim', 'permukaan', 'akses'].forEach(param => {
  document.getElementById(`w-${param}`).addEventListener('input', (e) => {
    document.getElementById(`lbl-w-${param}`).textContent = `${e.target.value}%`;
  });
});

document.getElementById('btn-recalculate').addEventListener('click', () => {
  renderBahayaLayer({ autoZoom: false, isBaseline: false });
});

document.getElementById('btn-reset-bobot').addEventListener('click', () => {
  const defaults = { gambut: 30, iklim: 25, permukaan: 25, akses: 20 };
  Object.entries(defaults).forEach(([k, v]) => {
    document.getElementById(`w-${k}`).value = v;
    document.getElementById(`lbl-w-${k}`).textContent = `${v}%`;
  });
  renderBahayaLayer({ autoZoom: false, isBaseline: false });
});

// Jalankan Aplikasi
initAllData();