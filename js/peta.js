/* =============================================================================
 * Peta interaktif: basemap, tiga kelompok layer, legenda dinamis, pop-up,
 * pencarian wilayah, kontrol periode (time slider), dan kembali ke extent.
 * ===========================================================================*/
(function () {
  'use strict';
  const KW = window.KW, C = window.KarhutlaCore, S = KW.S;

  /* ------------------------------------------------------ palet warna */
  const RAMP = {
    panas: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026'],
    hujan: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
    vegetasi: ['#3288bd', '#a6d96a', '#ffffbf', '#fd7d00', '#dc1010'],
    lembap: ['#8c510a', '#d8b365', '#f6e8c3', '#5ab4ac', '#01665e'],
    suhu: ['#313695', '#74add1', '#ffffbf', '#f46d43', '#a50026'],
    akses: ['#3f007d', '#6a51a3', '#9e9ac8', '#dadaeb', '#fcfbfd'],
    kerapatan: ['#ffffcc', '#feb24c', '#fd8d3c', '#e31a1c', '#800026'],
    frp: ['#fcffa4', '#fac228', '#f57d15', '#d44842', '#7a1d58'],
    penduduk: ['#fff5eb', '#fdd0a2', '#fd8d3c', '#d94801', '#7f2704'],
    netral: ['#f7f7f7', '#cccccc', '#969696', '#636363', '#252525']
  };
  const KATEGORI_WARNA = ['#1b7837', '#a6d96a', '#fdae61', '#d73027', '#4393c3', '#8073ac', '#bf812d', '#35978f', '#f1b6da', '#878787'];
  const hexKeRgb = (() => {
    const cache = {};
    return (h) => {
      if (cache[h]) return cache[h];
      const x = h.replace('#', '');
      return (cache[h] = [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]);
    };
  })();
    
  const WARNA_TUTUPAN = {
    1: '#3288bd', // Badan Air
    2: '#a6d96a', // Area Non Vegetasi
    3: '#ffffbf', // Hutan
    4: '#fd7d00', // Pertanian
    5: '#dc1010'  // Formasi Alami Non Hutan
  };
    
  function warnaRamp(stops, t) {
    t = Math.max(0, Math.min(1, t));
    const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    const a = hexKeRgb(stops[i]), b = hexKeRgb(stops[i + 1]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  const rgbCss = (c) => 'rgb(' + c.map(Math.round).join(',') + ')';
  const warnaSkor = (s) => KW.CFG.model.kelas.warna[Math.max(0, Math.min(4, Math.round(s) - 1))];

  function rentangTangguh(nilai) {
    const s = C.sampelNilai(nilai, S.mask, 60000);
    if (!s.length) return null;
    let lo = C.kuantil(s, 0.02), hi = C.kuantil(s, 0.98);
    if (hi <= lo) { lo = s[0]; hi = s[s.length - 1]; }
    if (hi <= lo) hi = lo + 1;
    return [lo, hi];
  }

  /** Raster grid -> data URL PNG (transparan di luar wilayah/nilai kosong). */
  function gambarGrid(fnWarna) {
    const g = S.grid;
    const cv = document.createElement('canvas');
    cv.width = g.ncols; cv.height = g.nrows;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(g.ncols, g.nrows);
    const d = img.data;
    for (let i = 0; i < g.n; i++) {
      if (!S.mask[i]) continue;
      const w = fnWarna(i);
      if (!w) continue;
      d[i * 4] = w[0]; d[i * 4 + 1] = w[1]; d[i * 4 + 2] = w[2]; d[i * 4 + 3] = w[3] === undefined ? 255 : w[3];
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  /* --------------------------------------------------- legenda HTML */
  function legendaGradien(stops, lo, hi, satuan, catatan) {
    const grad = stops.join(',');
    return `<div class="lg-bar" style="background:linear-gradient(90deg,${grad})"></div>
      <div class="lg-skala"><span>≤ ${KW.angka(lo, Math.abs(hi - lo) < 5 ? 2 : 0)}</span><span>${satuan || ''}</span><span>≥ ${KW.angka(hi, Math.abs(hi - lo) < 5 ? 2 : 0)}</span></div>
      ${catatan ? `<div class="lg-catatan">${catatan}</div>` : ''}`;
  }
  function legendaKelas(daftar) {
    return '<div class="lg-kelas">' + daftar.map(([w, t]) => `<div><i style="background:${w}"></i>${KW.esc(t)}</div>`).join('') + '</div>';
  }
  function legendaSkor() {
    const n = ['1 · Sangat rendah', '2 · Rendah', '3 · Sedang', '4 · Tinggi', '5 · Sangat tinggi'];
    return legendaKelas(n.map((t, i) => [KW.CFG.model.kelas.warna[i], t]));
  }

  /* ---------------------------------------------- definisi layer */
  const LAPISAN = [
    { id: 'p_cuaca', grup: 'parameter', nama: 'Cuaca & kekeringan (KBDI/SPI/HTH/DC)', slot: 'cuaca', param: 'cuaca', ramp: 'panas' },
    { id: 'p_curah_hujan', grup: 'parameter', nama: 'Curah hujan', slot: 'curah_hujan', param: 'curah_hujan', ramp: 'hujan', satuan: 'mm' },
    { id: 'p_ndvi', grup: 'parameter', nama: 'NDVI', slot: 'ndvi', param: 'ndvi', ramp: 'vegetasi' },
    { id: 'p_ndmi', grup: 'parameter', nama: 'NDMI', slot: 'ndmi', param: 'ndmi', ramp: 'lembap' },
    { id: 'p_lst', grup: 'parameter', nama: 'LST (suhu permukaan)', slot: 'lst', param: 'lst', ramp: 'suhu', satuan: '°C' },
    { id: 'p_tutupan_lahan', grup: 'parameter', nama: 'Tutupan lahan', slot: 'tutupan_lahan', param: 'tutupan_lahan', kategorikal: true },
    { id: 'p_gambut', grup: 'parameter', nama: 'Lahan gambut', slot: 'gambut', param: 'gambut' },
    { id: 'p_slope', grup: 'parameter', nama: 'Kemiringan lereng', slot: 'slope', param: 'slope', ramp: 'netral' },
    { id: 'p_kanal', grup: 'parameter', nama: 'Kanal / drainase', slot: 'kanal', param: 'kanal', ramp: 'akses', satuan: 'km' },
    { id: 'p_aksesibilitas', grup: 'parameter', nama: 'Aksesibilitas (jalan/sungai/permukiman)', slot: 'aksesibilitas', param: 'aksesibilitas', ramp: 'akses' },
    { id: 'p_kawasan_hutan', grup: 'parameter', nama: 'Kawasan hutan / konsesi', slot: 'kawasan_hutan', param: 'kawasan_hutan' },
    { id: 'p_kerapatan_input', grup: 'parameter', nama: 'Kerapatan titik api (masukan model)', slot: '_kerapatan', param: 'kerapatan', ramp: 'kerapatan', satuan: 'titik/km²' },
    { id: 'p_fasilitas', grup: 'parameter', nama: 'Permukiman & fasilitas', slot: 'fasilitas', khusus: 'fasilitas' },
    { id: 'p_hotspot', grup: 'parameter', nama: 'Titik api historis (VIIRS)', slot: 'hotspot', khusus: 'hotspot' },
    { id: 'm_kelas', grup: 'model', nama: 'Tingkat bahaya karhutla (5 kelas)', khusus: 'kelas' },
    { id: 'm_indeks', grup: 'model', nama: 'Indeks bahaya kontinu (1–5)', khusus: 'indeks' },
    { id: 'm_kerapatan', grup: 'model', nama: 'Kerapatan titik api (periode tampilan)', khusus: 'kerapatanTampil' },
    { id: 'm_frp', grup: 'model', nama: 'Distribusi FRP (total per sel)', khusus: 'frp' },
    { id: 'm_poligon', grup: 'model', nama: 'Model bahaya versi poligon (berkas kelompok)', slot: 'model_poligon', khusus: 'poligonLama' },
    { id: 'd_gambut', grup: 'dampak', nama: 'Bahaya tinggi ∩ lahan gambut', khusus: 'dGambut' },
    { id: 'd_hutan', grup: 'dampak', nama: 'Bahaya tinggi ∩ kawasan hutan', khusus: 'dHutan' },
    { id: 'd_permukiman', grup: 'dampak', nama: 'Permukiman & fasilitas di zona bahaya tinggi', khusus: 'dPermukiman' },
    { id: 'd_prioritas', grup: 'dampak', nama: 'Prioritas mitigasi per kab/kota', khusus: 'dPrioritas' },
    { id: 'd_terbakar', grup: 'dampak', nama: 'Area terbakar aktual (kejadian)', khusus: 'dTerbakar' }
  ];
  LAPISAN.forEach(l => { l.aktif = false; l.opasitas = l.grup === 'dampak' ? 0.85 : 0.75; l.mode = 'nilai'; l.layer = null; l.kunci = ''; l.legenda = ''; });
  KW.LAPISAN = LAPISAN;
  const cari = (id) => LAPISAN.find(l => l.id === id);
  cari('m_kelas').aktif = true;
  cari('p_hotspot').aktif = true;
  cari('p_hotspot').opasitas = 0.9;

  /** Ketersediaan data per layer: {ada: bool, alasan} */
  KW.ketersediaan = function (l) {
    if (!S.siap) return { ada: false, alasan: 'Memuat…' };
    if (l.slot === '_kerapatan') return S.lapis._kerapatan ? { ada: true } : { ada: false, alasan: 'Belum ada titik api / berkas KDE' };
    if (l.khusus === 'hotspot') return S.hotspotSemua.length ? { ada: true } : { ada: false, alasan: 'Belum ada data titik api' };
    if (l.khusus === 'fasilitas') return S.fasilitas.length ? { ada: true } : { ada: false, alasan: 'Belum ada data' };
    if (l.khusus === 'kelas' || l.khusus === 'indeks') return S.hasil && S.hasil.selValid ? { ada: true } : { ada: false, alasan: 'Model belum dapat dihitung (parameter kosong)' };
    if (l.khusus === 'kerapatanTampil' || l.khusus === 'frp') return S.hotspotSemua.length ? { ada: true } : { ada: false, alasan: 'Belum ada data titik api' };
    if (l.khusus === 'poligonLama') return (S.slot.model_poligon && S.slot.model_poligon.status === 'ok') ? { ada: true } : { ada: false, alasan: 'Berkas tidak ada' };
    if (l.khusus === 'dGambut') return S.dampak && S.dampak.ada.gambut ? { ada: true } : { ada: false, alasan: 'Butuh data gambut' };
    if (l.khusus === 'dHutan') return S.dampak && S.dampak.ada.hutan ? { ada: true } : { ada: false, alasan: 'Butuh data kawasan hutan' };
    if (l.khusus === 'dPermukiman') return S.dampak && (S.dampak.ada.permukiman || S.dampak.ada.fasilitas) ? { ada: true } : { ada: false, alasan: 'Butuh data permukiman/fasilitas' };
    if (l.khusus === 'dPrioritas') return S.prioritas ? { ada: true } : { ada: false, alasan: 'Butuh batas kab/kota' };
    if (l.khusus === 'dTerbakar') return S.lapis.area_terbakar ? { ada: true } : { ada: false, alasan: 'Belum ada data area terbakar (unggah di tab Data)' };
    if (l.slot) {
      const s = S.slot[l.slot];
      if (!s || s.status === 'kosong') return { ada: false, alasan: 'Data belum tersedia' };
      if (s.status === 'gagal') return { ada: false, alasan: 'Gagal dimuat: ' + s.pesan };
      if (s.status === 'memuat') return { ada: false, alasan: 'Memuat…' };
      return S.lapis[l.slot] || (s.data && s.data.tipe === 'vektor') ? { ada: true } : { ada: false, alasan: 'Tidak bertampalan dengan wilayah' };
    }
    return { ada: false, alasan: '' };
  };

  /* ---------------------------------------------- peta & pane */
  let map, lapisanBatas = null, sorot = null, batasTampil = true;
  const PANE_DASAR = 401;
  let urutan = [];
  function pane(id) {
    const nm = 'pane_' + id;
    if (!map.getPane(nm)) { map.createPane(nm); urutan.push(id); terapkanUrutan(); }
    return nm;
  }
  function terapkanUrutan() {
    urutan.forEach((id, i) => { const p = map.getPane('pane_' + id); if (p) p.style.zIndex = PANE_DASAR + i; });
  }
  function keDepan(id) {
    urutan = urutan.filter(x => x !== id); urutan.push(id); terapkanUrutan();
  }

  KW.inisialisasiPeta = function () {
    const W = KW.CFG.wilayah;
    map = L.map('map', { zoomControl: false, preferCanvas: false, minZoom: 5, maxZoom: 16, attributionControl: true })
      .setView(W.pusatPeta, W.zoomAwal);
    KW.map = map;
    L.control.zoom({ position: 'topleft', zoomInTitle: 'Perbesar', zoomOutTitle: 'Perkecil' }).addTo(map);
    const basemap = {
      'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors', crossOrigin: true }),
      'Citra satelit (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Citra &copy; Esri, Maxar, Earthstar Geographics', crossOrigin: true }),
    };
    basemap['OpenStreetMap'].addTo(map);
    L.control.layers(basemap, null, { position: 'topright', collapsed: true }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    // tombol kembali ke extent
    const Home = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const b = L.DomUtil.create('a', 'leaflet-bar tombol-home');
        b.href = '#'; b.title = 'Kembali ke extent Kalimantan Timur'; b.setAttribute('role', 'button');
        b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
        L.DomEvent.on(b, 'click', (e) => { L.DomEvent.preventDefault(e); KW.keExtent(); });
        L.DomEvent.disableClickPropagation(b);
        return b;
      }
    });
    new Home().addTo(map);

    // legenda
    const Leg = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        const d = L.DomUtil.create('div', 'legenda');
        d.innerHTML = '<div class="legenda-kepala"><span>Legenda</span><button type="button" class="legenda-lipat" title="Lipat/buka">–</button></div><div id="legenda-isi"></div>';
        L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        d.querySelector('.legenda-lipat').addEventListener('click', () => d.classList.toggle('terlipat'));
        return d;
      }
    });
    new Leg().addTo(map);

    // koordinat kursor
    const koord = document.getElementById('koordinat');
    map.on('mousemove', (e) => { if (koord) koord.textContent = e.latlng.lat.toFixed(4) + '°, ' + e.latlng.lng.toFixed(4) + '° (WGS84)'; });

    map.on('click', klikPeta);
    pasangKontrolPeriode();
    pasangPencarian();
  };

  KW.keExtent = function () {
    if (lapisanBatas && lapisanBatas.getBounds().isValid()) map.fitBounds(lapisanBatas.getBounds(), { padding: [10, 10] });
    else if (S.grid) map.fitBounds([[S.grid.ymin, S.grid.xmin], [S.grid.ymax, S.grid.xmax]]);
  };

  /** Dipanggil setelah batas wilayah/grid tersedia. */
  KW.siapkanPetaWilayah = function () {
    if (lapisanBatas) { map.removeLayer(lapisanBatas); lapisanBatas = null; }
    if (S.fiturBatas) {
      lapisanBatas = L.geoJSON({ type: 'FeatureCollection', features: S.fiturBatas }, {
        pane: 'pane_batas_wilayah', interactive: false,
        style: { color: '#0f172a', weight: 1.4, fill: false, opacity: 0.9, dashArray: null }
      });
    }
    if (!map.getPane('pane_batas_wilayah')) { map.createPane('pane_batas_wilayah'); map.getPane('pane_batas_wilayah').style.zIndex = 610; }
    if (lapisanBatas && batasTampil) lapisanBatas.addTo(map);
    const g = S.grid;
    if (g) {
      const pad = 2;
      map.setMaxBounds([[g.ymin - pad, g.xmin - pad], [g.ymax + pad, g.xmax + pad]]);
      KW.keExtent();
    }
    const dl = document.getElementById('daftar-wilayah');
    if (dl) dl.innerHTML = S.namaZona.map(n => `<option value="${KW.esc(n)}"></option>`).join('');
  };
  KW.batasTampil = () => batasTampil;
  KW.aturBatasTampil = function (on) {
    batasTampil = on;
    if (!lapisanBatas) return;
    if (on) lapisanBatas.addTo(map); else map.removeLayer(lapisanBatas);
  };

  /* -------------------------------------- perenderan per layer */
  function warnaKategoriTutupan(v) {
    const kode = Math.round(v);
    return WARNA_TUTUPAN[kode] || '#9ca3af';
  }

  function renderGridNilai(l) {
    const lap = S.lapis[l.slot];
    if (!lap) return null;
    if (l.kategorikal || (lap.kategori && lap.jenis === 'vektor')) {
      const url = gambarGrid(i => {
        const v = lap.nilai[i]; if (!Number.isFinite(v)) return null;
        return hexKeRgb(l.kategorikal ? warnaKategoriTutupan(v) : KATEGORI_WARNA[v % KATEGORI_WARNA.length]);
      });
      let daftar;
      if (l.kategorikal) {
        const p = KW.cariParameter('tutupan_lahan');
        const st = lap.stat;
        const kodeAda = new Set(); for (let i = 0; i < lap.nilai.length; i += 7) if (Number.isFinite(lap.nilai[i])) kodeAda.add(Math.round(lap.nilai[i]));
        daftar = Array.from(kodeAda).sort((a, b) => a - b).slice(0, 15).map(k => [warnaKategoriTutupan(k), (p && p.label && p.label[k]) ? k + ' · ' + p.label[k] : 'Kelas ' + k]);
        if (!daftar.length && st) daftar = [['#ccc', 'Tidak ada nilai']];
      } else {
        daftar = lap.kategori.slice(0, 12).map((t, i) => [KATEGORI_WARNA[i % KATEGORI_WARNA.length], t]);
      }
      return { url, legenda: legendaKelas(daftar) };
    }
    const rg = rentangTangguh(lap.nilai);
    if (!rg) return null;
    const stops = RAMP[l.ramp] || RAMP.panas;
    const url = gambarGrid(i => {
      const v = lap.nilai[i]; if (!Number.isFinite(v)) return null;
      return warnaRamp(stops, (v - rg[0]) / (rg[1] - rg[0]));
    });
    const satuan = l.satuan || lap.satuan || (KW.CFG.data[l.slot] && KW.CFG.data[l.slot].satuan) || '';
    return { url, legenda: legendaGradien(stops, rg[0], rg[1], satuan, 'Rentang warna: persentil 2–98 pada grid analisis') };
  }
  function renderGridSkor(l) {
    const sk = S.skor[l.param];
    if (!sk) return null;
    const url = gambarGrid(i => { const v = sk[i]; return Number.isFinite(v) ? hexKeRgb(warnaSkor(v)) : null; });
    return { url, legenda: legendaSkor() };
  }
  function overlayGrid(l, hasil) {
    const b = [[S.grid.ymin, S.grid.xmin], [S.grid.ymax, S.grid.xmax]];
    if (l.layer && l.layer.setUrl && l.jenisLeaflet === 'grid') { l.layer.setUrl(hasil.url); return l.layer; }
    l.jenisLeaflet = 'grid';
    return L.imageOverlay(hasil.url, b, { pane: pane(l.id), opacity: l.opasitas, interactive: false, className: 'grid-overlay' });
  }

  /** Skor satu fitur vektor berdasarkan aturan skoring yang aktif. */
  function skorFitur(paramId, nilai) {
    const r = S.rincian[paramId];
    if (!r) return null;
    if (r.metode === 'kategori-teks') return nilai === undefined || nilai === null ? null : (r.peta[String(nilai).trim()] ?? null);
    const v = C.toNum(nilai);
    if ((r.metode === 'ambang' || r.metode === 'kuantil') && Number.isFinite(v)) return C.skorAmbang(v, r.batas, r.arah);
    if (r.metode === 'langsung' && Number.isFinite(v)) return Math.max(1, Math.min(5, v));
    if (r.metode === 'kategori' && Number.isFinite(v)) return r.peta[Math.round(v)] ?? null;
    if (r.skorAda !== undefined) return r.skorAda;
    return Number.isFinite(v) ? null : 5;
  }

  function popupAtribut(judul, props, tambahan) {
    let baris = '';
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k.startsWith('_') || v === null || v === undefined || typeof v === 'object') return;
      const tampil = typeof v === 'number' ? (Number.isInteger(v) ? KW.angka(v) : KW.angka(v, 3)) : KW.esc(v);
      baris += `<tr><th>${KW.esc(k)}</th><td>${tampil}</td></tr>`;
    });
    return `<div class="popup"><div class="popup-judul">${KW.esc(judul)}</div>${tambahan || ''}
      <div class="popup-gulir"><table class="popup-tabel">${baris || '<tr><td>Tidak ada atribut</td></tr>'}</table></div></div>`;
  }
  let waktuKlikFitur = 0;
  function tandaiKlikFitur() { waktuKlikFitur = Date.now(); }

  function renderVektor(l) {
    const s = S.slot[l.slot];
    if (!s || s.status !== 'ok' || s.data.tipe !== 'vektor') return null;
    const fc = s.data.fc, field = s.field;
    const garis = /Line/.test(window.KarhutlaData.jenisGeometri(fc));
    const renderer = L.canvas({ pane: pane(l.id), padding: 0.3 });
    const lyr = L.geoJSON(fc, {
      pane: pane(l.id), renderer,
      style: (f) => {
        const sk = skorFitur(l.param, field ? (f.properties || {})[field] : null);
        const w = sk ? warnaSkor(sk) : '#9ca3af';
        return garis ? { color: '#1d4ed8', weight: 2, opacity: l.opasitas }
          : { fillColor: w, fillOpacity: l.opasitas, color: '#334155', weight: 0.4, opacity: Math.min(1, l.opasitas + 0.1) };
      },
      onEachFeature: (f, layer) => {
        layer.on('click', (e) => {
          tandaiKlikFitur();
          const sk = skorFitur(l.param, field ? (f.properties || {})[field] : null);
          const tambah = `<div class="popup-lencana" style="background:${sk ? warnaSkor(sk) : '#9ca3af'}">Skor bahaya parameter: ${sk ? KW.angka(sk, Number.isInteger(sk) ? 0 : 2) : '–'}${field ? ' (atribut ' + KW.esc(field) + ')' : ''}</div>`;
          L.popup({ maxWidth: 320 }).setLatLng(e.latlng).setContent(popupAtribut(l.nama, f.properties, tambah)).openOn(map);
        });
      }
    });
    l.jenisLeaflet = 'vektor';
    const leg = garis ? legendaKelas([['#1d4ed8', 'Jaringan kanal/drainase']]) : legendaSkor() + (field ? `<div class="lg-catatan">Warna = skor dari atribut <b>${KW.esc(field)}</b></div>` : '<div class="lg-catatan">Tidak ada atribut skor; warna = skor keberadaan</div>');
    return { layer: lyr, legenda: leg };
  }

  /* titik api & fasilitas: satu kanvas per layer agar ikut urutan pane layer tersebut */
  const kanvasLayer = {};
  function rendererUntuk(id) {
    if (!kanvasLayer[id]) kanvasLayer[id] = L.canvas({ pane: pane(id), padding: 0.4 });
    return kanvasLayer[id];
  }
  function popupHotspot(h) {
    const zona = h.zona >= 0 ? S.namaZona[h.zona] : '–';
    const kelas = S.hasil && S.hasil.kelas[h.idx] ? KW.CFG.model.kelas.nama[S.hasil.kelas[h.idx] - 1] : '–';
    const conf = h.confAsli === null ? '–' : KW.esc(h.confAsli) + (h.conf !== null ? ' (' + ['rendah', 'nominal', 'tinggi'][h.conf] + ')' : '');
    const jam = h.jam ? String(h.jam).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2') + ' UTC' : '–';
    const rows = [
      ['Tanggal deteksi', h.tanggal || '–'], ['Jam deteksi', jam],
      ['Koordinat', h.lat.toFixed(5) + '°, ' + h.lon.toFixed(5) + '°'],
      ['Satelit / sensor', [h.satelit, h.instrumen].filter(Boolean).join(' / ') || '–'],
      ['Confidence', conf], ['FRP', Number.isFinite(h.frp) ? KW.angka(h.frp, 1) + ' MW' : '–'],
      ['Brightness temp. (I-4)', Number.isFinite(h.brightness) ? KW.angka(h.brightness, 1) + ' K' : '–'],
      ['Brightness temp. (I-5)', Number.isFinite(h.brightness2) ? KW.angka(h.brightness2, 1) + ' K' : '–'],
      ['Siang/malam', h.siangMalam === 'D' ? 'Siang' : h.siangMalam === 'N' ? 'Malam' : (h.siangMalam || '–')],
      ['Kabupaten/kota', zona], ['Kelas bahaya model', kelas]
    ];
    return `<div class="popup"><div class="popup-judul">Titik api (hotspot)</div><table class="popup-tabel">${rows.map(r => `<tr><th>${r[0]}</th><td>${KW.esc(r[1])}</td></tr>`).join('')}</table></div>`;
  }
  function warnaFrp(frp) {
    if (!Number.isFinite(frp)) return '#fbbf24';
    return rgbCss(warnaRamp(RAMP.frp, Math.log10(Math.max(1, frp)) / 2.5));
  }
  function renderHotspot(l) {
    const titik = S.hotspotTampil;
    const pakaiKlaster = typeof L.markerClusterGroup === 'function';
    const grup = pakaiKlaster ? L.markerClusterGroup({
      chunkedLoading: true, maxClusterRadius: 48, showCoverageOnHover: false, clusterPane: pane(l.id),
      iconCreateFunction: (c) => {
        const n = c.getChildCount();
        const ukuran = n < 50 ? 30 : n < 500 ? 38 : 46;
        return L.divIcon({ html: '<div><span>' + (n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'rb' : n) + '</span></div>', className: 'klaster-api', iconSize: [ukuran, ukuran] });
      }
    }) : L.layerGroup();
    const marker = titik.map(h => {
      const m = L.circleMarker([h.lat, h.lon], { pane: pane(l.id), renderer: rendererUntuk(l.id), radius: 4.5, weight: 1, color: '#7f1d1d',
        fillColor: warnaFrp(h.frp), fillOpacity: l.opasitas, opacity: l.opasitas });
      m.options.hs = h;
      return m;
    });
    if (pakaiKlaster) grup.addLayers(marker); else marker.forEach(m => grup.addLayer(m));
    grup.on('click', (e) => {
      const h = e.layer && e.layer.options && e.layer.options.hs;
      if (!h) return;
      tandaiKlikFitur();
      L.popup({ maxWidth: 320 }).setLatLng([h.lat, h.lon]).setContent(popupHotspot(h)).openOn(map);
    });
    l.jenisLeaflet = 'titik';
    const leg = `<div class="lg-kelas"><div><i class="bulat" style="background:#fcffa4"></i>FRP rendah</div><div><i class="bulat" style="background:#d44842"></i>FRP tinggi</div></div>
      <div class="lg-catatan">${KW.angka(titik.length)} titik · ${S.filter.tahun[0]}–${S.filter.tahun[1]}${pakaiKlaster ? ' · dikelompokkan (cluster)' : ''}</div>`;
    return { layer: grup, legenda: leg };
  }
  function renderFasilitas(l, hanyaTinggi) {
    const T = KW.CFG.model.kelas.kelasTinggiMulai;
    const titik = S.fasilitas.filter(f => !hanyaTinggi || (S.hasil && S.hasil.kelas[f.idx] >= T));
    const grup = L.layerGroup();
    titik.forEach(f => {
      const k = S.hasil ? S.hasil.kelas[f.idx] : 0;
      const m = L.circleMarker([f.lat, f.lon], { pane: pane(l.id), renderer: rendererUntuk(l.id), radius: 5, weight: 1.2, color: '#0c4a6e',
        fillColor: k >= T ? '#ef4444' : '#38bdf8', fillOpacity: l.opasitas });
      m.on('click', (e) => {
        tandaiKlikFitur();
        const tambah = `<div class="popup-lencana" style="background:${k ? KW.CFG.model.kelas.warna[k - 1] : '#9ca3af'}">Kelas bahaya di lokasi: ${k ? KW.CFG.model.kelas.nama[k - 1] : '–'}</div>`;
        L.popup({ maxWidth: 320 }).setLatLng(e.latlng).setContent(popupAtribut('Permukiman / fasilitas', f.props, tambah)).openOn(map);
      });
      grup.addLayer(m);
    });
    return { layer: grup, n: titik.length };
  }

  function renderKhusus(l) {
    const T = KW.CFG.model.kelas.kelasTinggiMulai;
    const kc = KW.CFG.model.kelas;
    switch (l.khusus) {
      case 'kelas': {
        const k = S.hasil.kelas, tampil = S.filter.kelasTampil;
        const url = gambarGrid(i => k[i] && tampil[k[i] - 1] ? hexKeRgb(kc.warna[k[i] - 1]) : null);
        const b = S.hasil.batas;
        const label = kc.nama.map((n, i) => {
          const lo = i === 0 ? 1 : b[i - 1], hi = i === 4 ? 5 : b[i];
          return [kc.warna[i], `${n} (${KW.angka(lo, 2)}–${KW.angka(hi, 2)})`];
        }).filter((_, i) => tampil[i]);
        return { url, legenda: legendaKelas(label) + `<div class="lg-catatan">Metode kelas: ${kc.metode === 'interval' ? 'interval sama' : kc.metode}</div>` };
      }
      case 'indeks': {
        const v = S.hasil.indeks;
        const stops = kc.warna;
        const url = gambarGrid(i => Number.isFinite(v[i]) ? warnaRamp(stops, (v[i] - 1) / 4) : null);
        return { url, legenda: legendaGradien(stops, 1, 5, 'indeks', 'Σ bobot × skor (1 = sangat rendah, 5 = sangat tinggi)') };
      }
      case 'kerapatanTampil': {
        const per = C.hitungTitikPerSel(S.hotspotTampil, S.grid, S.mask);
        const kd = C.kde(per.jumlah, S.grid, Number(KW.CFG.hotspot.bandwidthKdeKm) || 5, S.mask);
        const rg = rentangTangguh(kd) || [0, 1];
        const url = gambarGrid(i => Number.isFinite(kd[i]) && kd[i] > rg[1] * 0.02 ? warnaRamp(RAMP.kerapatan, (kd[i] - rg[0]) / (rg[1] - rg[0])) : null);
        l.cacheNilai = kd;
        return { url, legenda: legendaGradien(RAMP.kerapatan, rg[0], rg[1], 'titik/km²', `KDE Gaussian, bandwidth ${KW.CFG.hotspot.bandwidthKdeKm} km · ${S.filter.tahun[0]}–${S.filter.tahun[1]}`) };
      }
      case 'frp': {
        const per = C.hitungTitikPerSel(S.hotspotTampil, S.grid, S.mask);
        const v = per.frpSum;
        let mx = 0; for (let i = 0; i < v.length; i++) if (v[i] > mx) mx = v[i];
        const lmx = Math.log10(Math.max(10, mx));
        const url = gambarGrid(i => v[i] > 0 ? warnaRamp(RAMP.frp, Math.log10(1 + v[i]) / lmx) : null);
        l.cacheNilai = v;
        return { url, legenda: legendaGradien(RAMP.frp, 1, Math.pow(10, lmx), 'MW (skala log)', 'Total FRP titik api per sel ± 1 km · ' + S.filter.tahun.join('–')) };
      }
      case 'dGambut': case 'dHutan': {
        const lap = l.khusus === 'dGambut' ? S.lapisDampak.gambut : S.lapisDampak.hutanIdx;
        const k = S.hasil.kelas;
        const warna = l.khusus === 'dGambut' ? '#7c2d12' : '#14532d';
        const url = gambarGrid(i => {
          const ada = l.khusus === 'dGambut' ? lap[i] : lap[i] >= 0;
          if (!ada) return null;
          return k[i] >= T ? hexKeRgb(warna) : [203, 213, 225, 120];
        });
        return { url, legenda: legendaKelas([[warna, (l.khusus === 'dGambut' ? 'Gambut' : 'Kawasan hutan') + ' pada bahaya tinggi'], ['#cbd5e1', (l.khusus === 'dGambut' ? 'Gambut' : 'Kawasan hutan') + ' bahaya lebih rendah']]) + '<div class="lg-catatan">Wilayah berpotensi terdampak (bukan area terbakar)</div>' };
      }
      case 'dPermukiman': {
        const grupL = L.layerGroup();
        let leg = '';
        if (S.lapisDampak.permukiman) {
          const k = S.hasil.kelas, pm = S.lapisDampak.permukiman;
          const url = gambarGrid(i => pm[i] && k[i] >= T ? [124, 58, 237, 255] : null);
          L.imageOverlay(url, [[S.grid.ymin, S.grid.xmin], [S.grid.ymax, S.grid.xmax]], { pane: pane(l.id), opacity: l.opasitas, className: 'grid-overlay' }).addTo(grupL);
          leg += legendaKelas([['#7c3aed', 'Sel permukiman (tutupan lahan) di bahaya tinggi']]);
        }
        if (S.fasilitas.length) {
          const f = renderFasilitas(l, true);
          f.layer.addTo(grupL);
          leg += `<div class="lg-kelas"><div><i class="bulat" style="background:#ef4444"></i>Fasilitas di zona bahaya tinggi (${KW.angka(f.n)})</div></div>`;
        }
        l.jenisLeaflet = 'grup';
        return { layer: grupL, legenda: leg + '<div class="lg-catatan">Berpotensi terdampak berdasarkan peta bahaya</div>' };
      }
      case 'dTerbakar': {
        const t = S.lapis.area_terbakar.adaFitur;
        const url = gambarGrid(i => t[i] ? [17, 24, 39, 255] : null);
        return { url, legenda: legendaKelas([['#111827', 'Area terbakar aktual (data kejadian)']]) + '<div class="lg-catatan">Sumber: ' + KW.esc(S.slot.area_terbakar.nama) + '</div>' };
      }
      case 'dPrioritas': {
        const pr = S.prioritas;
        const warna = { 'Prioritas I': '#b91c1c', 'Prioritas II': '#f97316', 'Prioritas III': '#fde68a' };
        const lyr = L.geoJSON({ type: 'FeatureCollection', features: S.fiturBatas }, {
          pane: pane(l.id),
          style: (f) => { const i = S.fiturBatas.indexOf(f); return { fillColor: warna[pr.tingkat[i]] || '#e5e7eb', fillOpacity: l.opasitas * 0.8, color: '#1f2937', weight: 1.2 }; },
          onEachFeature: (f, layer) => {
            layer.on('click', (e) => { tandaiKlikFitur(); L.popup({ maxWidth: 340 }).setLatLng(e.latlng).setContent(KW.popupZona(S.fiturBatas.indexOf(f))).openOn(map); });
          }
        });
        l.jenisLeaflet = 'vektor';
        return { layer: lyr, legenda: legendaKelas(Object.entries(warna).map(([t, w]) => [w, t])) + '<div class="lg-catatan">Indeks = rerata indikator ternormalisasi (lihat tab Dampak)</div>' };
      }
      case 'poligonLama': {
        const s = S.slot.model_poligon;
        const lyr = L.geoJSON(s.data.fc, {
          pane: pane(l.id), renderer: L.canvas({ pane: pane(l.id) }),
          style: (f) => {
            const p = f.properties || {};
            const kls = String(p.kelas || p.KELAS || p.kelas_bahaya || '').toLowerCase();
            let w = /sangat tinggi/.test(kls) ? kc.warna[4] : /tinggi/.test(kls) ? kc.warna[3] : /sedang/.test(kls) ? kc.warna[2] : /sangat rendah/.test(kls) ? kc.warna[0] : /rendah/.test(kls) ? kc.warna[1] : null;
            if (!w) { // tanpa atribut kelas: rerata atribut skor_* (1–5) yang ada di berkas
              const sk = Object.keys(p).filter(k => /^skor_/i.test(k)).map(k => C.toNum(p[k])).filter(Number.isFinite);
              w = sk.length ? warnaSkor(sk.reduce((a, b) => a + b, 0) / sk.length) : '#94a3b8';
            }
            return { fillColor: w, fillOpacity: l.opasitas, color: '#ffffff', weight: 0.6 };
          },
          onEachFeature: (f, layer) => layer.on('click', (e) => { tandaiKlikFitur(); L.popup().setLatLng(e.latlng).setContent(popupAtribut('Model bahaya (berkas poligon kelompok)', f.properties)).openOn(map); })
        });
        l.jenisLeaflet = 'vektor';
        return { layer: lyr, legenda: legendaSkor() + '<div class="lg-catatan">Warna = atribut kelas, atau rerata atribut skor_* pada berkas model_bahaya_api.geojson. Bukan hasil perhitungan WebGIS ini; dipakai sebagai pembanding.</div>' };
      }
    }
    return null;
  }

  /** Bangun/perbarui satu layer sesuai status. */
  function bangunLayer(l) {
    const tersedia = KW.ketersediaan(l);
    if (!tersedia.ada) return null;
    let h = null;
    if (l.khusus === 'hotspot') h = renderHotspot(l);
    else if (l.khusus === 'fasilitas') { const f = renderFasilitas(l, false); l.jenisLeaflet = 'titik'; h = { layer: f.layer, legenda: legendaKelas([['#38bdf8', 'Fasilitas / permukiman'], ['#ef4444', 'Berada di zona bahaya tinggi']]) }; }
    else if (l.khusus) h = renderKhusus(l);
    else if (l.mode === 'skor') h = renderGridSkor(l);
    else {
      const lap = S.lapis[l.slot];
      const s = S.slot[l.slot];
      if (s && s.data && s.data.tipe === 'vektor' && l.slot !== '_kerapatan') h = renderVektor(l);
      else if (lap) h = renderGridNilai(l);
    }
    if (!h) return null;
    const layer = h.layer || overlayGrid(l, h);
    l.legenda = h.legenda;
    return layer;
  }
  function kunciLayer(l) {
    return [S.versi, l.mode, l.khusus === 'hotspot' || l.khusus === 'kerapatanTampil' || l.khusus === 'frp' ? S.filter.tahun.join() + S.filter.bulan.join() + S.hotspotTampil.length : '',
      l.khusus === 'kelas' ? S.filter.kelasTampil.join() : ''].join('|');
  }
  /** Sinkronkan satu layer dengan peta. */
  KW.sinkronLayer = function (l, paksa) {
    if (!map) return;
    if (!l.aktif) {
      if (l.layer && map.hasLayer(l.layer)) map.removeLayer(l.layer);
      return;
    }
    const kunci = kunciLayer(l);
    if (paksa || !l.layer || l.kunci !== kunci) {
      const lama = l.layer;
      const baru = bangunLayer(l);
      if (lama && lama !== baru && map.hasLayer(lama)) map.removeLayer(lama);
      l.layer = baru; l.kunci = kunci;
    }
    if (l.layer && !map.hasLayer(l.layer)) l.layer.addTo(map);
  };
  KW.aktifkanLapisan = function (id, on) {
    const l = cari(id); if (!l) return;
    l.aktif = on;
    if (on) { pane(l.id); keDepan(l.id); }
    KW.sinkronLayer(l);
    KW.segarkanLegenda();
  };
  KW.aturOpasitas = function (id, v) {
    const l = cari(id); if (!l) return;
    l.opasitas = v;
    if (!l.layer) return;
    if (l.layer.setOpacity) l.layer.setOpacity(v);
    else if (l.layer.eachLayer) {
      l.layer.eachLayer(x => {
        if (x.setOpacity) x.setOpacity(v);
        else if (x.setStyle) x.setStyle(l.jenisLeaflet === 'titik' || l.khusus === 'hotspot' ? { fillOpacity: v, opacity: v } : { fillOpacity: l.khusus === 'dPrioritas' ? v * 0.8 : v });
      });
    }
  };
  KW.aturMode = function (id, mode) {
    const l = cari(id); if (!l) return;
    l.mode = mode; KW.sinkronLayer(l, true); KW.segarkanLegenda();
  };
  KW.segarkanPeta = function () {
    LAPISAN.forEach(l => KW.sinkronLayer(l));
    KW.segarkanLegenda();
  };
  KW.segarkanLegenda = function () {
    const box = document.getElementById('legenda-isi');
    if (!box) return;
    const aktif = LAPISAN.filter(l => l.aktif && l.layer).sort((a, b) => urutan.indexOf(b.id) - urutan.indexOf(a.id));
    let html = aktif.map(l => `<div class="lg-blok"><div class="lg-judul">${KW.esc(l.nama)}${l.mode === 'skor' && !l.khusus ? ' — skor' : ''}</div>${l.legenda}</div>`).join('');
    html += `<div class="lg-blok"><div class="lg-kelas"><div><i class="garis"></i>Batas kab/kota (AOI)</div></div></div>`;
    box.innerHTML = html;
  };

  /* -------------------------------------------------- pop-up sel */
  KW.popupZona = function (z) {
    if (z === null || z === undefined || z < 0) return '';
    const nama = S.namaZona[z];
    const lz = S.hasil.zonaKelas ? S.hasil.zonaKelas.luasZona[z] : NaN;
    const m = S.hasil.zonaKelas ? S.hasil.zonaKelas.matriks[z] : null;
    const kc = KW.CFG.model.kelas;
    const dz = S.dampak && S.dampak.perZona[z];
    const nTampil = S.hotspotTampil.filter(h => h.zona === z).length;
    let tbl = '';
    if (m) tbl = m.map((v, i) => `<tr><th><i class="kotak" style="background:${kc.warna[i]}"></i>${kc.nama[i]}</th><td>${KW.angka(v)} ha (${KW.angka(lz ? 100 * v / lz : NaN, 1)}%)</td></tr>`).join('');
    const pr = S.prioritas;
    return `<div class="popup"><div class="popup-judul">${KW.esc(nama)}</div>
      ${pr && pr.tingkat[z] ? `<div class="popup-lencana" style="background:#b91c1c">${pr.tingkat[z]} · peringkat ${pr.peringkat[z]} dari ${S.namaZona.length}</div>` : ''}
      <table class="popup-tabel">
        <tr><th>Luas wilayah (grid)</th><td>${KW.angka(lz)} ha (${KW.angka(lz / 100, 0)} km²)</td></tr>
        ${tbl}
        <tr><th>Titik api ${S.filter.tahun.join('–')}</th><td>${KW.angka(nTampil)}</td></tr>
        ${dz && S.dampak.ada.gambut ? `<tr><th>Gambut di bahaya tinggi</th><td>${KW.angka(dz.gambutTinggi)} ha</td></tr>` : ''}
        ${dz && S.dampak.ada.hutan ? `<tr><th>Kawasan hutan di bahaya tinggi</th><td>${KW.angka(dz.hutanTinggi)} ha</td></tr>` : ''}
        ${dz && S.dampak.ada.permukiman ? `<tr><th>Permukiman di bahaya tinggi</th><td>${KW.angka(dz.permukimanTinggi)} ha</td></tr>` : ''}
        ${dz && S.dampak.ada.fasilitas ? `<tr><th>Fasilitas di bahaya tinggi</th><td>${KW.angka(dz.fasilitasTinggi)}</td></tr>` : ''}
        ${dz && S.dampak.ada.penduduk ? `<tr><th>Penduduk di bahaya tinggi</th><td>${KW.angka(dz.pendudukTinggi)} jiwa</td></tr>` : ''}
        ${dz && S.dampak.ada.terbakar ? `<tr><th>Area terbakar aktual</th><td>${KW.angka(dz.terbakar)} ha</td></tr>` : ''}
      </table></div>`;
  };
  function klikPeta(e) {
    if (Date.now() - waktuKlikFitur < 300 || !S.hasil) return;
    const idx = C.indeksSel(S.grid, e.latlng.lng, e.latlng.lat);
    if (idx < 0 || !S.mask[idx]) return;
    const kc = KW.CFG.model.kelas;
    const k = S.hasil.kelas[idx], v = S.hasil.indeks[idx];
    const z = S.zona[idx];
    let baris = '';
    for (const kel of KW.CFG.model.kelompok) for (const p of kel.parameter) {
      const lap = S.lapis[p.slot]; const sk = S.skor[p.id];
      if (!lap && !sk) continue;
      let nilai = lap ? lap.nilai[idx] : NaN;
      let teks = '–';
      if (lap && lap.kategori && Number.isFinite(nilai)) teks = KW.esc(lap.kategori[nilai]);
      else if (p.label && Number.isFinite(nilai) && p.label[Math.round(nilai)]) teks = KW.esc(p.label[Math.round(nilai)]);
      else if (Number.isFinite(nilai)) teks = KW.angka(nilai, Math.abs(nilai) < 10 ? 3 : 1) + ' ' + (lap.satuan || (KW.CFG.data[p.slot] && KW.CFG.data[p.slot].satuan) || '');
      else if (lap && lap.adaFitur) teks = lap.adaFitur[idx] ? 'ada' : 'tidak ada';
      const s = sk ? sk[idx] : NaN;
      baris += `<tr><th>${KW.esc(p.nama)}</th><td>${teks}</td><td class="skor">${Number.isFinite(s) ? `<i class="kotak" style="background:${warnaSkor(s)}"></i>${KW.angka(s, Number.isInteger(s) ? 0 : 2)}` : '–'}</td></tr>`;
    }
    const nSel = S.hotspotTampil.filter(h => h.idx === idx).length;
    const L2 = S.lapisDampak || {};
    const dampak = [];
    if (L2.gambut && L2.gambut[idx]) dampak.push('lahan gambut');
    if (L2.hutanIdx && L2.hutanIdx[idx] >= 0) dampak.push('kawasan hutan' + (L2.hutanKategori ? ' (' + KW.esc(L2.hutanKategori[L2.hutanIdx[idx]]) + ')' : ''));
    if (L2.permukiman && L2.permukiman[idx]) dampak.push('permukiman');
    if (L2.terbakar && L2.terbakar[idx]) dampak.push('<b>area terbakar aktual</b>');
    const html = `<div class="popup"><div class="popup-judul">${z >= 0 ? KW.esc(S.namaZona[z]) : 'Sel grid'} <span class="popup-sub">${e.latlng.lat.toFixed(4)}°, ${e.latlng.lng.toFixed(4)}°</span></div>
      <div class="popup-lencana" style="background:${k ? kc.warna[k - 1] : '#9ca3af'};color:${k === 3 ? '#1f2937' : '#fff'}">Bahaya: ${k ? kc.nama[k - 1] : 'tidak dihitung'} · indeks ${KW.angka(v, 2)}</div>
      <div class="popup-gulir"><table class="popup-tabel tiga"><tr><th>Parameter</th><td><b>Nilai</b></td><td class="skor"><b>Skor</b></td></tr>${baris}</table></div>
      <div class="popup-kaki">Titik api di sel ini (${S.filter.tahun.join('–')}): <b>${nSel}</b>${dampak.length ? '<br>Karakteristik: ' + dampak.join(', ') : ''}
      ${z >= 0 ? `<br><a href="#" class="tautan-zona" data-z="${z}">Lihat ringkasan ${KW.esc(S.namaZona[z])}</a>` : ''}</div></div>`;
    const pp = L.popup({ maxWidth: 360 }).setLatLng(e.latlng).setContent(html).openOn(map);
    const a = pp.getElement() && pp.getElement().querySelector('.tautan-zona');
    if (a) a.addEventListener('click', (ev) => { ev.preventDefault(); KW.fokusZona(Number(a.dataset.z)); });
  }

  KW.fokusZona = function (z) {
    if (!S.fiturBatas || z < 0) return;
    const f = S.fiturBatas[z];
    if (sorot) map.removeLayer(sorot);
    sorot = L.geoJSON(f, { pane: 'pane_batas_wilayah', interactive: false, style: { color: '#f97316', weight: 3.5, fill: false } }).addTo(map);
    map.fitBounds(sorot.getBounds(), { padding: [30, 30] });
    const pusat = sorot.getBounds().getCenter();
    setTimeout(() => L.popup({ maxWidth: 340 }).setLatLng(pusat).setContent(KW.popupZona(z)).openOn(map), 350);
  };

  /* -------------------------------------------------- pencarian */
  function pasangPencarian() {
    const inp = document.getElementById('cari-wilayah');
    const tombol = document.getElementById('cari-tombol');
    if (!inp) return;
    const jalankan = () => {
      const q = inp.value.trim();
      if (!q) return;
      const m = q.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
      if (m) {
        const lat = Number(m[1].replace(',', '.')), lon = Number(m[2].replace(',', '.'));
        map.setView([lat, lon], 11);
        klikPeta({ latlng: L.latLng(lat, lon) });
        return;
      }
      const ql = q.toLowerCase();
      let z = S.namaZona.findIndex(n => n.toLowerCase() === ql);
      if (z < 0) z = S.namaZona.findIndex(n => n.toLowerCase().includes(ql));
      if (z < 0) { KW.notifikasi('Wilayah "' + q + '" tidak ditemukan. Ketik nama kab/kota atau koordinat "lat, lon".', 'galat'); return; }
      KW.fokusZona(z);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); jalankan(); } });
    // pilihan dari daftar (datalist) langsung dijalankan bila sama persis dengan nama kab/kota
    inp.addEventListener('input', () => { if (S.namaZona.includes(inp.value.trim())) jalankan(); });
    if (tombol) tombol.addEventListener('click', jalankan);
  }

  /* --------------------------------------- kontrol periode (time slider) */
  let putar = null;
  function pasangKontrolPeriode() {
    const P = KW.CFG.periode;
    const a = document.getElementById('tahun-awal'), b = document.getElementById('tahun-akhir');
    const bA = document.getElementById('bulan-awal'), bB = document.getElementById('bulan-akhir');
    const label = document.getElementById('label-periode');
    if (!a) return;
    [a, b].forEach(el => { el.min = P.semuaHotspot[0]; el.max = P.semuaHotspot[1]; });
    a.value = S.filter.tahun[0]; b.value = S.filter.tahun[1];
    const nb = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    [bA, bB].forEach((el, j) => { el.innerHTML = nb.map((n, i) => `<option value="${i + 1}" ${i === (j ? 11 : 0) ? 'selected' : ''}>${n}</option>`).join(''); });
    let tunda = null;
    const ubah = () => {
      let x = Number(a.value), y = Number(b.value);
      if (x > y) { if (document.activeElement === a) b.value = y = x; else a.value = x = y; }
      let m1 = Number(bA.value), m2 = Number(bB.value);
      if (m1 > m2) { bB.value = m2 = m1; }
      S.filter.tahun = [x, y]; S.filter.bulan = [m1, m2];
      label.textContent = x === y ? String(x) : x + '–' + y;
      document.querySelectorAll('.preset-periode button').forEach(btn => {
        const r = btn.dataset.rentang.split('-').map(Number);
        btn.classList.toggle('aktif', r[0] === x && r[1] === y);
      });
      clearTimeout(tunda);
      tunda = setTimeout(() => KW.terapkanFilter(), 120);
    };
    [a, b, bA, bB].forEach(el => el.addEventListener('input', ubah));
    const preset = document.querySelector('.preset-periode');
    KW.perbaruiPresetPeriode = function () {
      const Q = KW.CFG.periode;
      preset.innerHTML = [
        ['Semua', Q.semuaHotspot], ['Historis', Q.historis], ['Pengembangan', Q.pengembangan], ['Pengujian', Q.pengujian]
      ].map(([n, r]) => `<button type="button" data-rentang="${r[0]}-${r[1]}" title="${n} ${r[0]}–${r[1]}" class="${r[0] === S.filter.tahun[0] && r[1] === S.filter.tahun[1] ? 'aktif' : ''}">${n}<small>${r[0]}–${String(r[1]).slice(2)}</small></button>`).join('');
    };
    KW.perbaruiPresetPeriode();
    preset.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const r = btn.dataset.rentang.split('-').map(Number);
      a.value = r[0]; b.value = r[1]; ubah();
    });
    const tPutar = document.getElementById('putar-periode');
    tPutar.addEventListener('click', () => {
      if (putar) { clearInterval(putar); putar = null; tPutar.classList.remove('aktif'); tPutar.title = 'Putar animasi per tahun'; return; }
      tPutar.classList.add('aktif'); tPutar.title = 'Hentikan animasi';
      let th = P.semuaHotspot[0];
      const langkah = () => { a.value = th; b.value = th; ubah(); th = th >= P.semuaHotspot[1] ? P.semuaHotspot[0] : th + 1; };
      langkah(); putar = setInterval(langkah, 1600);
    });
    ubah();
  }
  KW.saatFilterBerubah = function () {
    LAPISAN.filter(l => ['hotspot', 'kerapatanTampil', 'frp'].includes(l.khusus)).forEach(l => KW.sinkronLayer(l));
    KW.segarkanLegenda();
    KW.segarkanDashboard && KW.segarkanDashboard();
  };
})();
