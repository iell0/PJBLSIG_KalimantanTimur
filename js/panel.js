/* =============================================================================
 * Panel samping: Ringkasan, Layer, Model, Validasi, Dampak, Metodologi, Data
 * Semua angka dihitung dari data yang dimuat; bila data belum ada ditulis "–"
 * atau "Belum ada data", tidak pernah diisi angka contoh.
 * ===========================================================================*/
(function () {
  'use strict';
  const KW = window.KW, C = window.KarhutlaCore, S = KW.S;
  const $ = (id) => document.getElementById(id);
  const A = (v, d) => KW.angka(v, d);
  const E = (s) => KW.esc(s);
  const grafik = {};

  /* ------------------------------------------------------ sumber data */
  KW.SUMBER_DATA = [
    { p: 'Titik api (hotspot) VIIRS S-NPP 375 m, FRP', s: 'NASA FIRMS (VNP14IMG)', u: 'https://firms.modaps.eosdis.nasa.gov/download/', r: '375 m; per deteksi', l: 'Terbuka; arsip sejak 20 Jan 2012, unduh dengan Earthdata Login atau kode via email; API butuh MAP_KEY gratis' },
    { p: 'Curah hujan, SPI, HTH, KBDI', s: 'CHIRPS Daily v2.0 (CHC UCSB)', u: 'https://www.chc.ucsb.edu/data/chirps', r: '0,05° (±5,6 km); harian', l: 'Domain publik; tersedia di Google Earth Engine (UCSB-CHG/CHIRPS/DAILY)' },
    { p: 'Suhu udara, kelembapan, angin (KBDI, FWI/DC)', s: 'ERA5-Land (ECMWF/Copernicus)', u: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land', r: '0,1° (±9 km); per jam', l: 'Lisensi Copernicus; akun CDS; tersedia di GEE (ECMWF/ERA5_LAND/HOURLY)' },
    { p: 'NDVI, NDMI, LST (Landsat)', s: 'Landsat 8/9 Collection 2 Level-2 (USGS)', u: 'https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products', r: '30 m (termal 100 m); 16 hari', l: 'Domain publik; GEE LANDSAT/LC08|LC09/C02/T1_L2' },
    { p: 'LST harian (dipakai kelompok)', s: 'MODIS MOD11A1 & MYD11A1 v6.1 (NASA LP DAAC)', u: 'https://doi.org/10.5067/MODIS/MOD11A1.061', r: '1 km; harian', l: 'Terbuka; GEE MODIS/061/MOD11A1 & MYD11A1' },
    { p: 'Tutupan lahan', s: 'KLHK (Peta Penutupan Lahan) / ESA WorldCover', u: 'https://esa-worldcover.org/', r: 'KLHK skala 1:250.000; WorldCover 10 m', l: 'WorldCover CC BY 4.0; KLHK melalui SIGAP/geoportal KLHK' },
    { p: 'Lahan gambut / KHG', s: 'Peta KHG KLHK / Peta Gambut BBSDLP Kementan', u: 'https://sigap.menlhk.go.id/', r: 'skala 1:50.000–1:250.000', l: 'Ketentuan masing-masing instansi' },
    { p: 'Kemiringan lereng', s: 'DEMNAS (BIG)', u: 'https://tanahair.indonesia.go.id/', r: '0,27″ (±8 m)', l: 'Unduh gratis dengan akun Ina-Geoportal' },
    { p: 'Jalan, sungai, kanal, permukiman', s: 'RBI BIG / OpenStreetMap', u: 'https://download.geofabrik.de/asia/indonesia.html', r: 'RBI 1:25.000–1:50.000; OSM bervariasi', l: 'RBI: Ina-Geoportal; OSM: ODbL' },
    { p: 'Kawasan hutan / konsesi', s: 'KLHK (SK Kawasan Hutan) / Bhumi ATR/BPN', u: 'https://bhumi.atrbpn.go.id/', r: 'bervariasi', l: 'Ketentuan masing-masing instansi' },
    { p: 'Area terbakar (validasi)', s: 'MODIS MCD64A1 v6.1 / SiPongi KLHK', u: 'https://doi.org/10.5067/MODIS/MCD64A1.061', r: '500 m; bulanan', l: 'Terbuka; GEE MODIS/061/MCD64A1' },
    { p: 'Penduduk (dampak)', s: 'WorldPop', u: 'https://hub.worldpop.org/', r: '100 m; tahunan', l: 'CC BY 4.0' },
    { p: 'Batas administrasi', s: 'BIG (Ina-Geoportal) / BPS', u: 'https://tanahair.indonesia.go.id/', r: 'kab/kota', l: 'Ketentuan BIG' }
  ];

  /* ------------------------------------------------------------ navigasi */
  function pasangNavigasi() {
    document.querySelectorAll('.rel-tombol[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.body.classList.remove('panel-tertutup');
        document.querySelectorAll('.rel-tombol').forEach(b => b.classList.toggle('aktif', b === btn));
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('aktif', t.id === 'tab-' + tab));
        setTimeout(() => { KW.map && KW.map.invalidateSize(); Object.values(grafik).forEach(g => g && g.canvas && g.canvas.isConnected && g.resize()); }, 60);
      });
    });
    const tutup = $('tutup-panel');
    if (tutup) tutup.addEventListener('click', () => {
      document.body.classList.toggle('panel-tertutup');
      setTimeout(() => KW.map && KW.map.invalidateSize(), 260);
    });
  }

  /* --------------------------------------------------------- grafik */
  function siapGrafik() {
    if (!window.Chart) return false;
    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.borderColor = 'rgba(148,163,184,0.16)';
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11;
    return true;
  }
  function buatAtauPerbarui(id, konfigurasi) {
    const cv = $(id);
    if (!cv || !window.Chart) return null;
    if (grafik[id]) { grafik[id].destroy(); }
    grafik[id] = new Chart(cv.getContext('2d'), konfigurasi);
    return grafik[id];
  }
  KW.grafik = grafik;
  /** Hancurkan grafik sebelum kanvasnya dibuang (innerHTML dibangun ulang). */
  function hapusGrafik(id) { if (grafik[id]) { try { grafik[id].destroy(); } catch (e) { /* kanvas sudah lepas */ } delete grafik[id]; } }

  /* ============================================================ RINGKASAN */
  KW.segarkanDashboard = function () {
    if (!S.siap) return;
    const kc = KW.CFG.model.kelas, T = kc.kelasTinggiMulai;
    const t = S.hotspotTampil;
    $('kpi-hotspot').textContent = S.hotspotSemua.length ? A(t.length) : 'Belum ada data';
    $('kpi-hotspot-ket').textContent = S.hotspotSemua.length
      ? `${S.filter.tahun[0]}–${S.filter.tahun[1]}, bulan ${S.filter.bulan.join('–')}, confidence ≥ ${['rendah', 'nominal', 'tinggi'][KW.CFG.hotspot.confidenceMinimum]}`
      : 'Unggah data FIRMS di tab Data';
    if (S.dampak && S.dampak.ada.terbakar) {
      $('kpi-terbakar').textContent = A(S.dampak.total.terbakar) + ' ha';
      $('kpi-terbakar-ket').textContent = 'Kejadian aktual dari ' + (S.slot.area_terbakar.nama || 'berkas unggahan');
    } else { $('kpi-terbakar').textContent = 'Belum ada data'; $('kpi-terbakar-ket').textContent = 'Butuh data area bekas terbakar (MCD64A1/KLHK)'; }
    if (S.hasil && S.hasil.selValid) {
      const tinggi = S.hasil.luasKelas.slice(T - 1).reduce((a, b) => a + b, 0);
      $('kpi-tinggi').textContent = A(tinggi) + ' ha';
      $('kpi-tinggi-ket').textContent = A(100 * tinggi / S.hasil.luasStudiHa, 1) + '% wilayah studi · kelas ' + kc.nama.slice(T - 1).join(' + ');
    } else { $('kpi-tinggi').textContent = '–'; $('kpi-tinggi-ket').textContent = 'Model belum dapat dihitung'; }
    if (S.hasil && S.hasil.zonaKelas) {
      const lz = S.hasil.zonaKelas.luasZona;
      const persen = S.hasil.zonaKelas.matriks.map((r, i) => lz[i] ? r.slice(T - 1).reduce((a, b) => a + b, 0) / lz[i] : -1);
      const zi = persen.indexOf(Math.max(...persen));
      $('kpi-kab').textContent = zi >= 0 ? S.namaZona[zi] : '–';
      $('kpi-kab-ket').textContent = zi >= 0 ? A(100 * persen[zi], 1) + '% luasnya berbahaya tinggi' : '';
    } else { $('kpi-kab').textContent = '–'; $('kpi-kab-ket').textContent = 'Butuh batas kab/kota'; }
    const v = S.validasi;
    if (v && v.status === 'tervalidasi' && v.roc && Number.isFinite(v.roc.auc)) {
      $('kpi-auc').textContent = A(v.roc.auc, 3);
      $('kpi-auc-ket').textContent = 'ROC/AUC terhadap titik api ' + v.periodeUji.join('–') + ' (' + A(v.nUji) + ' titik)';
    } else { $('kpi-auc').textContent = 'Belum divalidasi'; $('kpi-auc-ket').textContent = 'Butuh titik api periode pengujian ' + KW.CFG.periode.pengujian.join('–'); }

    if (!siapGrafik()) { $('ringkas-grafik-catatan').textContent = 'Pustaka grafik (Chart.js) tidak termuat — periksa koneksi internet.'; return; }
    // grafik per tahun
    const P = KW.CFG.periode;
    const th0 = S.tahunData ? Math.min(S.tahunData[0], P.semuaHotspot[0]) : P.semuaHotspot[0];
    const th1 = S.tahunData ? Math.max(S.tahunData[1], P.semuaHotspot[1]) : P.semuaHotspot[1];
    const tahun = []; for (let y = th0; y <= th1; y++) tahun.push(y);
    const semua = KW.saringHotspot([th0, th1], S.filter.bulan);
    const perTahun = tahun.map(y => semua.filter(h => h.tahun === y).length);
    const warnaTahun = tahun.map(y => {
      const dlm = y >= S.filter.tahun[0] && y <= S.filter.tahun[1];
      const w = y >= P.pengujian[0] && y <= P.pengujian[1] ? '#38bdf8' : y >= P.pengembangan[0] && y <= P.pengembangan[1] ? '#f97316' : '#94a3b8';
      return dlm ? w : w + '55';
    });
    buatAtauPerbarui('ch-tahun', {
      type: 'bar', data: { labels: tahun, datasets: [{ label: 'Titik api', data: perTahun, backgroundColor: warnaTahun, borderRadius: 3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => A(c.raw) + ' titik' } } },
        scales: { y: { beginAtZero: true, ticks: { callback: (x) => A(x) } } } }
    });
    // per bulan (musiman)
    const perBulan = new Array(12).fill(0); t.forEach(h => { if (h.bulan) perBulan[h.bulan - 1]++; });
    buatAtauPerbarui('ch-bulan', {
      type: 'line', data: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
        datasets: [{ label: 'Titik api', data: perBulan, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.18)', fill: true, tension: 0.3, pointRadius: 2 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
    // per kab/kota
    if (S.adaZona) {
      const per = S.namaZona.map((_, z) => t.filter(h => h.zona === z).length);
      const urut = per.map((n, z) => ({ n, z })).sort((a, b) => b.n - a.n);
      buatAtauPerbarui('ch-kab', {
        type: 'bar', data: { labels: urut.map(o => S.namaZona[o.z]), datasets: [{ data: urut.map(o => o.n), backgroundColor: '#ef4444', borderRadius: 3 }] },
        options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
      });
    }
    // distribusi kelas
    if (S.hasil && S.hasil.selValid) {
      buatAtauPerbarui('ch-kelas', {
        type: 'doughnut', data: { labels: kc.nama, datasets: [{ data: S.hasil.luasKelas.map(v => Math.round(v)), backgroundColor: kc.warna, borderColor: '#0f172a', borderWidth: 2 }] },
        options: { maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { boxWidth: 10 } },
          tooltip: { callbacks: { label: (c) => c.label + ': ' + A(c.raw) + ' ha (' + A(100 * c.raw / S.hasil.luasStudiHa, 1) + '%)' } } } }
      });
    }
    // prioritas
    const pr = S.prioritas, box = $('ringkas-prioritas');
    if (pr) {
      const urut = pr.peringkat.map((r, z) => ({ r, z })).filter(o => o.r).sort((a, b) => a.r - b.r);
      box.innerHTML = urut.map(o => `<li><span class="nomor">${o.r}</span><a href="#" data-z="${o.z}">${E(S.namaZona[o.z])}</a><span class="lencana p${pr.tingkat[o.z].split(' ')[1].length}">${pr.tingkat[o.z]}</span></li>`).join('');
      box.querySelectorAll('a[data-z]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); KW.fokusZona(Number(a.dataset.z)); }));
    } else box.innerHTML = '<li class="kosong">Butuh batas kab/kota dan hasil model</li>';
  };

  /* ================================================================ LAYER */
  function bangunDaftarLapisan() {
    const box = $('daftar-lapisan');
    const grupNama = { parameter: '1 · Layer parameter', model: '2 · Layer hasil model', dampak: '3 · Layer analisis dampak' };
    let html = `<div class="lapis-baris tetap"><label class="cek"><input type="checkbox" id="tampil-batas" ${KW.batasTampil && !KW.batasTampil() ? '' : 'checked'}><span>Batas kab/kota (AOI)</span></label></div>`;
    for (const g of ['parameter', 'model', 'dampak']) {
      html += `<div class="lapis-grup"><div class="lapis-grup-judul">${grupNama[g]}</div>`;
      KW.LAPISAN.filter(l => l.grup === g).forEach(l => {
        const t = KW.ketersediaan(l);
        const modeAda = g === 'parameter' && !l.khusus && t.ada && S.skor[l.param];
        html += `<div class="lapis-baris ${t.ada ? '' : 'nonaktif'}" data-id="${l.id}">
          <label class="cek"><input type="checkbox" class="lapis-cek" ${l.aktif && t.ada ? 'checked' : ''} ${t.ada ? '' : 'disabled'}><span>${E(l.nama)}</span></label>
          ${t.ada ? '' : `<span class="chip kosong" title="${E(t.alasan)}">${E(t.alasan.length > 28 ? 'Belum ada data' : t.alasan)}</span>`}
          ${t.ada ? `<div class="lapis-kendali">
            ${modeAda ? `<select class="lapis-mode" title="Tampilkan nilai asli atau skor 1–5"><option value="nilai" ${l.mode === 'nilai' ? 'selected' : ''}>Nilai</option><option value="skor" ${l.mode === 'skor' ? 'selected' : ''}>Skor</option></select>` : ''}
            <input type="range" class="lapis-opasitas" min="0" max="1" step="0.05" value="${l.opasitas}" title="Transparansi">
          </div>` : ''}
          ${l.khusus === 'kelas' && t.ada ? `<div class="saring-kelas">${KW.CFG.model.kelas.nama.map((n, i) => `<label title="${E(n)}"><input type="checkbox" data-k="${i}" ${S.filter.kelasTampil[i] ? 'checked' : ''}><i style="background:${KW.CFG.model.kelas.warna[i]}"></i>${E(n)}</label>`).join('')}</div>` : ''}
        </div>`;
      });
      html += '</div>';
    }
    box.innerHTML = html;
    $('tampil-batas').addEventListener('change', (e) => KW.aturBatasTampil(e.target.checked));
    box.querySelectorAll('.lapis-baris[data-id]').forEach(row => {
      const id = row.dataset.id;
      const cek = row.querySelector('.lapis-cek');
      if (cek) cek.addEventListener('change', () => KW.aktifkanLapisan(id, cek.checked));
      const op = row.querySelector('.lapis-opasitas');
      if (op) op.addEventListener('input', () => KW.aturOpasitas(id, Number(op.value)));
      const md = row.querySelector('.lapis-mode');
      if (md) md.addEventListener('change', () => KW.aturMode(id, md.value));
      row.querySelectorAll('.saring-kelas input').forEach(inp => inp.addEventListener('change', () => {
        S.filter.kelasTampil[Number(inp.dataset.k)] = inp.checked;
        KW.sinkronLayer(KW.LAPISAN.find(l => l.id === 'm_kelas')); KW.segarkanLegenda();
      }));
    });
  }

  /* ================================================================ MODEL */
  let tundaHitung = null;
  function jadwalkanHitung() {
    const st = $('model-status'); if (st) { st.textContent = 'Menghitung ulang…'; st.className = 'status-model sibuk'; }
    clearTimeout(tundaHitung);
    tundaHitung = setTimeout(() => {
      const t0 = performance.now();
      KW.hitungModel();
      KW.segarkanSemua({ pertahankanEditor: true });
      const st2 = $('model-status');
      if (st2) { st2.textContent = 'Model dihitung ulang (' + Math.round(performance.now() - t0) + ' ms) · ' + new Date().toLocaleTimeString('id-ID'); st2.className = 'status-model ok'; }
    }, 450);
  }
  KW.jadwalkanHitung = jadwalkanHitung;

  function rumusHTML() {
    const kel = KW.CFG.model.kelompok;
    const total = kel.reduce((s, k) => s + (Number(k.bobot) || 0), 0) || 1;
    const suku = kel.filter(k => Number(k.bobot) > 0).map(k => `${A(k.bobot / total, 3)}·S<sub>${E(k.id)}</sub>`).join(' + ');
    return `<div class="rumus">Bahaya = ${suku}</div>
      <div class="rumus-ket">S<sub>k</sub> = Σ(w<sub>i</sub>·s<sub>i</sub>) / Σ w<sub>i</sub> untuk parameter i dalam kelompok k; s<sub>i</sub> = skor 1–5.
      Bobot kelompok dinormalisasi sehingga total = 1. Bila suatu parameter tidak bernilai di sel tertentu, bobotnya dikeluarkan dari penyebut (renormalisasi).</div>`;
  }

  function bangunPanelModel() {
    const M = KW.CFG.model;
    $('model-rumus').innerHTML = rumusHTML();
    // bobot kelompok
    const total = M.kelompok.reduce((s, k) => s + (Number(k.bobot) || 0), 0);
    $('model-bobot').innerHTML = M.kelompok.map((k, i) => `
      <div class="bobot-baris">
        <span class="bobot-nama">${E(k.nama)}</span>
        <input type="range" min="0" max="100" step="0.1" value="${k.bobot}" data-i="${i}" class="bobot-geser">
        <input type="number" min="0" max="100" step="0.1" value="${k.bobot}" data-i="${i}" class="bobot-angka">
        <span class="bobot-persen">${A(total ? 100 * k.bobot / total : 0, 1)}%</span>
      </div>`).join('') +
      `<div class="bobot-total ${Math.abs(total - 100) < 0.05 ? 'ok' : 'peringatan'}">Total bobot: ${A(total, 1)}${Math.abs(total - 100) < 0.05 ? ' ✓' : ' — dinormalisasi otomatis menjadi 100%'}
        <button type="button" id="normalisasi-bobot" class="tombol kecil">Normalisasi ke 100</button></div>
      <div class="catatan">Bobot bawaan: AHP keseluruhan Kelompok 2 (λmax = 5,026; CI = 0,0066; CR = 0,006).</div>`;
    $('model-bobot').querySelectorAll('.bobot-geser, .bobot-angka').forEach(inp => inp.addEventListener('input', () => {
      const i = Number(inp.dataset.i);
      M.kelompok[i].bobot = Number(inp.value) || 0;
      const row = inp.closest('.bobot-baris');
      row.querySelectorAll('input').forEach(x => { if (x !== inp) x.value = inp.value; });
      const tot = M.kelompok.reduce((s, k) => s + (Number(k.bobot) || 0), 0);
      $('model-bobot').querySelectorAll('.bobot-persen').forEach((sp, j) => { sp.textContent = A(tot ? 100 * M.kelompok[j].bobot / tot : 0, 1) + '%'; });
      $('model-rumus').innerHTML = rumusHTML();
      jadwalkanHitung();
    }));
    $('normalisasi-bobot').addEventListener('click', () => {
      const tot = M.kelompok.reduce((s, k) => s + (Number(k.bobot) || 0), 0);
      if (!tot) return;
      M.kelompok.forEach(k => { k.bobot = Math.round(1000 * k.bobot / tot) / 10; });
      bangunPanelModel(); jadwalkanHitung();
    });

    // parameter & aturan skoring (status buka/tutup tiap kelompok dipertahankan)
    const lama = document.querySelectorAll('#model-parameter details.kelompok-param');
    const terbuka = lama.length ? Array.from(lama).map(d => d.open) : M.kelompok.map((_, ki) => ki === 0);
    $('model-parameter').innerHTML = M.kelompok.map((k, ki) => `
      <details class="kelompok-param" ${terbuka[ki] ? 'open' : ''}><summary>${E(k.nama)} <span class="ringan">${k.parameter.length} parameter</span></summary>
      ${k.parameter.map((p, pi) => editorParameter(p, ki, pi)).join('')}</details>`).join('');
    $('model-parameter').querySelectorAll('[data-ki]').forEach(inp => {
      inp.addEventListener('change', () => ubahParameter(inp));
    });

    // kelas
    const kc = M.kelas;
    $('model-kelas').innerHTML = `
      <div class="baris-form"><label>Metode batas kelas</label>
        <select id="kelas-metode"><option value="interval" ${kc.metode === 'interval' ? 'selected' : ''}>Interval sama (1–5)</option>
        <option value="kuantil" ${kc.metode === 'kuantil' ? 'selected' : ''}>Kuantil (luas sama)</option>
        <option value="manual" ${kc.metode === 'manual' ? 'selected' : ''}>Manual</option></select></div>
      <div class="baris-form"><label>Batas antarkelas</label><div class="empat">${kc.batas.map((b, i) => `<input type="number" step="0.01" class="kelas-batas" data-i="${i}" value="${b}" ${kc.metode === 'manual' ? '' : 'disabled'}>`).join('')}</div></div>
      <div class="baris-form"><label>"Bahaya tinggi" untuk analisis dampak</label>
        <select id="kelas-tinggi">${[3, 4, 5].map(k => `<option value="${k}" ${kc.kelasTinggiMulai === k ? 'selected' : ''}>Kelas ${kc.nama[k - 1]} ke atas</option>`).join('')}</select></div>
      <table class="tabel kecil"><thead><tr><th>Kelas</th><th>Rentang indeks</th><th>Interpretasi</th></tr></thead><tbody>
      ${kc.nama.map((n, i) => `<tr><td><i class="kotak" style="background:${kc.warna[i]}"></i>${n}</td><td>${i === 0 ? '1,00' : A(kc.batas[i - 1], 2)} – ${i === 4 ? '5,00' : A(kc.batas[i], 2)}</td><td>${E(kc.interpretasi[i])}</td></tr>`).join('')}
      </tbody></table>`;
    $('kelas-metode').addEventListener('change', (e) => { kc.metode = e.target.value; if (kc.metode === 'interval') kc.batas = [1.8, 2.6, 3.4, 4.2]; KW.hitungModel(); KW.segarkanSemua(); });
    $('kelas-tinggi').addEventListener('change', (e) => { kc.kelasTinggiMulai = Number(e.target.value); jadwalkanHitung(); });
    $('model-kelas').querySelectorAll('.kelas-batas').forEach(inp => inp.addEventListener('change', () => {
      kc.batas[Number(inp.dataset.i)] = Number(inp.value);
      kc.batas.sort((a, b) => a - b);
      jadwalkanHitung();
    }));

    // periode & titik api
    const P = KW.CFG.periode, H = KW.CFG.hotspot;
    $('model-periode').innerHTML = `
      <div class="baris-form"><label>Periode pengembangan model</label><div class="dua"><input type="number" id="per-latih-a" value="${P.pengembangan[0]}"><input type="number" id="per-latih-b" value="${P.pengembangan[1]}"></div></div>
      <div class="baris-form"><label>Periode pengujian independen</label><div class="dua"><input type="number" id="per-uji-a" value="${P.pengujian[0]}"><input type="number" id="per-uji-b" value="${P.pengujian[1]}"></div></div>
      <div class="baris-form"><label>Sumber kerapatan titik api</label><select id="sumber-kerapatan">
        <option value="hitung" ${H.sumberKerapatanModel === 'hitung' ? 'selected' : ''}>Hitung dari titik api periode pengembangan</option>
        <option value="file" ${H.sumberKerapatanModel === 'file' ? 'selected' : ''}>Berkas kerapatan_KDE.tif</option></select></div>
      <div class="baris-form"><label>Bandwidth KDE (km)</label><input type="number" id="bandwidth-kde" min="1" max="50" step="0.5" value="${H.bandwidthKdeKm}"></div>
      <div class="baris-form"><label>Confidence minimum titik api</label><select id="conf-min">
        ${['Semua (termasuk rendah)', 'Nominal & tinggi', 'Tinggi saja'].map((t, i) => `<option value="${i}" ${H.confidenceMinimum === i ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="catatan" id="info-kerapatan"></div>`;
    const ubahPer = () => {
      const a = Number($('per-latih-a').value), b = Number($('per-latih-b').value), c = Number($('per-uji-a').value), d = Number($('per-uji-b').value);
      if (a > b || c > d) { KW.notifikasi('Tahun awal harus ≤ tahun akhir', 'galat'); return; }
      if (!(b < c || d < a)) KW.notifikasi('Periode pengembangan dan pengujian bertampalan — pengujian tidak lagi independen.', 'galat');
      P.pengembangan = [a, b]; P.pengujian = [c, d];
      jadwalkanHitung();
    };
    ['per-latih-a', 'per-latih-b', 'per-uji-a', 'per-uji-b'].forEach(id => $(id).addEventListener('change', ubahPer));
    $('sumber-kerapatan').addEventListener('change', (e) => { H.sumberKerapatanModel = e.target.value; jadwalkanHitung(); });
    $('bandwidth-kde').addEventListener('change', (e) => { H.bandwidthKdeKm = Number(e.target.value) || 5; jadwalkanHitung(); });
    $('conf-min').addEventListener('change', (e) => { H.confidenceMinimum = Number(e.target.value); KW.terapkanFilter(); jadwalkanHitung(); });
    const ki = S.kerapatanInfo;
    $('info-kerapatan').innerHTML = !ki ? '' : ki.sumber === 'hitung'
      ? `Kerapatan masukan model dihitung dari <b>${A(ki.jumlahTitik)}</b> titik api ${ki.periode.join('–')} (KDE Gaussian, bandwidth ${ki.bandwidth} km). Titik api periode pengujian tidak ikut dipakai.`
      : ki.sumber === 'file' ? `Kerapatan masukan model dari berkas <b>${E(ki.berkas)}</b>. Pastikan berkas hanya dibentuk dari titik api periode pengembangan.`
        : 'Kerapatan titik api belum tersedia: kelompok parameter ini tidak ikut dihitung.';

    bangunAHP();
  }

  function editorParameter(p, ki, pi) {
    const a = p.aturan || {};
    const lap = S.lapis[p.slot];
    const r = S.rincian[p.id];
    const statusData = lap ? `<span class="chip ok">data ada</span>` : `<span class="chip kosong">belum ada data</span>`;
    const metode = a.metode || 'otomatis';
    const opsiMetode = [['otomatis', 'Otomatis'], ['ambang', 'Ambang (batas tetap)'], ['kuantil', 'Kuantil'], ['langsung', 'Nilai sudah skor 1–5'], ['kategori', 'Kategori → skor'], ['keberadaan', 'Keberadaan']];
    let kategoriHTML = '';
    if (lap && lap.kategori) {
      kategoriHTML = `<div class="peta-kategori">${lap.kategori.slice(0, 40).map(t => {
        const nilai = (a.peta && a.peta[t] !== undefined) ? a.peta[t] : (r && r.peta ? r.peta[t] : 3);
        return `<label>${E(t)}<input type="number" min="1" max="5" step="1" value="${nilai}" data-ki="${ki}" data-pi="${pi}" data-kat="${E(t)}"></label>`;
      }).join('')}</div>`;
    } else if (metode === 'kategori') {
      const kode = new Set(Object.keys(a.peta || {}).map(Number));
      if (lap) for (let i = 0; i < lap.nilai.length; i += 5) if (Number.isFinite(lap.nilai[i])) kode.add(Math.round(lap.nilai[i]));
      kategoriHTML = `<div class="peta-kategori">${Array.from(kode).sort((x, y) => x - y).slice(0, 40).map(k => `<label>${k}${p.label && p.label[k] ? ' · ' + E(p.label[k]) : ''}<input type="number" min="1" max="5" step="1" value="${a.peta && a.peta[k] !== undefined ? a.peta[k] : ''}" placeholder="–" data-ki="${ki}" data-pi="${pi}" data-kode="${k}"></label>`).join('')}</div>`;
    }
    let dipakai = '';
    if (r) {
      if (r.metode === 'ambang' || r.metode === 'kuantil') dipakai = `Dipakai: ${r.metode}, arah ${r.arah}, batas ${r.batas.map(b => A(b, Math.abs(b) < 10 ? 3 : 1)).join(' | ')}`;
      else if (r.metode === 'langsung') dipakai = 'Dipakai: nilai langsung sebagai skor (rentang ' + A(r.statistik.min, 2) + '–' + A(r.statistik.max, 2) + ')';
      else if (r.metode === 'kategori-teks') dipakai = 'Dipakai: kategori atribut teks → skor';
      else dipakai = 'Dipakai: ' + r.metode;
      if (lap && lap.stat && lap.stat.n) dipakai += ` · data ${A(lap.stat.min, 2)} s.d. ${A(lap.stat.max, 2)}`;
      if (S.slot[p.slot] && S.slot[p.slot].field) dipakai += ` · atribut "${E(S.slot[p.slot].field)}"`;
    }
    return `<div class="param" data-ki="${ki}" data-pi="${pi}">
      <div class="param-kepala"><b>${E(p.nama)}</b>${statusData}</div>
      <div class="param-form">
        <label>Bobot<input type="number" min="0" step="0.1" value="${p.bobot}" data-ki="${ki}" data-pi="${pi}" data-kolom="bobot"></label>
        <label>Skoring<select data-ki="${ki}" data-pi="${pi}" data-kolom="metode">${opsiMetode.map(([v, t]) => `<option value="${v}" ${metode === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Arah<select data-ki="${ki}" data-pi="${pi}" data-kolom="arah"><option value="naik" ${a.arah !== 'turun' ? 'selected' : ''}>Nilai tinggi = bahaya</option><option value="turun" ${a.arah === 'turun' ? 'selected' : ''}>Nilai rendah = bahaya</option></select></label>
      </div>
      ${metode === 'ambang' ? `<div class="param-form"><span class="label-kecil">Batas skor 1|2|3|4|5</span>${[0, 1, 2, 3].map(i => `<input type="number" step="any" value="${a.batas && a.batas[i] !== undefined ? a.batas[i] : ''}" data-ki="${ki}" data-pi="${pi}" data-kolom="batas" data-b="${i}">`).join('')}</div>` : ''}
      ${kategoriHTML}
      ${p.catatan ? `<div class="catatan">${E(p.catatan)}</div>` : ''}
      ${dipakai ? `<div class="dipakai">${dipakai}</div>` : ''}
    </div>`;
  }
  function perbaruiInfoDipakai() {
    KW.CFG.model.kelompok.forEach((k, ki) => k.parameter.forEach((p, pi) => {
      const el = document.querySelector(`.param[data-ki="${ki}"][data-pi="${pi}"]`);
      if (!el) return;
      const baru = document.createElement('div');
      baru.innerHTML = editorParameter(p, ki, pi);
      const lama = el.querySelector('.dipakai'), dp = baru.querySelector('.dipakai');
      if (lama && dp) lama.innerHTML = dp.innerHTML; else if (!lama && dp) el.appendChild(dp);
    }));
    const tbody = document.querySelector('#model-kelas tbody');
    if (tbody) {
      const kc = KW.CFG.model.kelas;
      tbody.querySelectorAll('tr').forEach((tr, i) => { tr.children[1].textContent = (i === 0 ? '1,00' : A(kc.batas[i - 1], 2)) + ' – ' + (i === 4 ? '5,00' : A(kc.batas[i], 2)); });
    }
  }
  function ubahParameter(inp) {
    const p = KW.CFG.model.kelompok[Number(inp.dataset.ki)].parameter[Number(inp.dataset.pi)];
    p.aturan = p.aturan || {};
    const kol = inp.dataset.kolom;
    if (kol === 'bobot') p.bobot = Number(inp.value) || 0;
    else if (kol === 'metode') {
      p.aturan.metode = inp.value;
      if (inp.value === 'ambang' && (!p.aturan.batas || p.aturan.batas.length !== 4) && S.rincian[p.id] && S.rincian[p.id].batas) {
        p.aturan.batas = S.rincian[p.id].batas.map(b => Math.round(b * 1000) / 1000);
      }
      if (inp.value === 'kategori' && !p.aturan.peta) p.aturan.peta = {};
      KW.hitungModel(); KW.segarkanSemua(); return;
    } else if (kol === 'arah') p.aturan.arah = inp.value;
    else if (kol === 'batas') {
      p.aturan.batas = p.aturan.batas && p.aturan.batas.length === 4 ? p.aturan.batas : [NaN, NaN, NaN, NaN];
      p.aturan.batas[Number(inp.dataset.b)] = Number(inp.value);
    } else if (inp.dataset.kat !== undefined) {
      p.aturan.peta = p.aturan.peta || {}; p.aturan.peta[inp.dataset.kat] = Number(inp.value);
    } else if (inp.dataset.kode !== undefined) {
      p.aturan.peta = p.aturan.peta || {};
      if (inp.value === '') delete p.aturan.peta[inp.dataset.kode]; else p.aturan.peta[inp.dataset.kode] = Number(inp.value);
    }
    jadwalkanHitung();
  }

  /* -------------------------------------------------------- AHP */
  const SAATY = [9, 8, 7, 6, 5, 4, 3, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8, 1 / 9];
  const teksSaaty = (v) => v >= 1 ? String(v) : '1/' + Math.round(1 / v);
  let matriksAHP = null;
  function bangunAHP() {
    const kel = KW.CFG.model.kelompok;
    const n = kel.length;
    if (!matriksAHP || matriksAHP.length !== n) matriksAHP = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 1));
    let html = '<div class="ahp-gulir"><table class="tabel ahp"><thead><tr><th></th>' + kel.map(k => `<th title="${E(k.nama)}">${E(k.id)}</th>`).join('') + '</tr></thead><tbody>';
    for (let i = 0; i < n; i++) {
      html += `<tr><th title="${E(kel[i].nama)}">${E(kel[i].id)}</th>`;
      for (let j = 0; j < n; j++) {
        if (i === j) html += '<td>1</td>';
        else if (j > i) html += `<td><select data-i="${i}" data-j="${j}">${SAATY.map(v => `<option value="${v}" ${Math.abs(matriksAHP[i][j] - v) < 1e-9 ? 'selected' : ''}>${teksSaaty(v)}</option>`).join('')}</select></td>`;
        else html += `<td class="kebalikan">${teksSaaty(matriksAHP[i][j])}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div><div id="ahp-hasil"></div>';
    $('model-ahp').innerHTML = html;
    $('model-ahp').querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
      const i = Number(s.dataset.i), j = Number(s.dataset.j), v = Number(s.value);
      matriksAHP[i][j] = v; matriksAHP[j][i] = 1 / v; bangunAHP();
    }));
    const r = C.ahp(matriksAHP);
    $('ahp-hasil').innerHTML = `<table class="tabel kecil"><thead><tr><th>Kelompok</th><th>Bobot AHP</th></tr></thead><tbody>
      ${kel.map((k, i) => `<tr><td>${E(k.nama)}</td><td>${A(100 * r.bobot[i], 1)}%</td></tr>`).join('')}</tbody></table>
      <div class="ahp-uji ${r.konsisten ? 'ok' : 'peringatan'}">λmax = ${A(r.lambdaMaks, 3)} · CI = ${A(r.CI, 4)} · RI = ${A(r.RI, 2)} · <b>CR = ${A(r.CR, 3)}</b> ${r.konsisten ? '(konsisten, CR ≤ 0,10)' : '(tidak konsisten, CR > 0,10 — perbaiki penilaian)'}</div>
      <button type="button" class="tombol kecil" id="terapkan-ahp" ${r.konsisten ? '' : 'disabled'}>Terapkan sebagai bobot kelompok</button>
      <div class="catatan">Isi matriks dengan penilaian perbandingan berpasangan kelompok (skala Saaty 1–9): nilai di baris i kolom j = seberapa penting kelompok i dibanding j. Matriks awal berisi 1 (setara) karena matriks asli kelompok tidak tersedia di WebGIS.</div>`;
    $('terapkan-ahp').addEventListener('click', () => {
      kel.forEach((k, i) => { k.bobot = Math.round(1000 * r.bobot[i]) / 10; });
      KW.notifikasi('Bobot AHP diterapkan (CR = ' + A(r.CR, 3) + ')', 'ok');
      bangunPanelModel(); jadwalkanHitung();
    });
  }

  /* ============================================================ VALIDASI */
  function kategoriAUC(a) {
    if (!Number.isFinite(a)) return '–';
    if (a >= 0.9) return 'luar biasa (≥ 0,9)';
    if (a >= 0.8) return 'sangat baik (0,8–0,9)';
    if (a >= 0.7) return 'dapat diterima (0,7–0,8)';
    if (a > 0.5) return 'lemah (0,5–0,7)';
    return 'tidak lebih baik dari acak (≤ 0,5)';
  }
  function bangunPanelValidasi() {
    const v = S.validasi, box = $('validasi-isi');
    hapusGrafik('ch-roc');
    if (!v) { box.innerHTML = '<p class="kosong">Model belum dihitung.</p>'; return; }
    const kc = KW.CFG.model.kelas;
    let html = `<div class="kotak-info"><b>Metode.</b> Peta indeks bahaya (dibangun dari parameter dan titik api ${v.periodeLatih.join('–')})
      diuji terhadap titik api VIIRS ${v.periodeUji.join('–')} yang <b>tidak</b> dipakai dalam pembentukan model.
      Sel grid berisi ≥ 1 titik api uji = positif; sel lain = negatif. Diukur: ROC/AUC, kurva laju prediksi, dan proporsi kejadian pada kelas bahaya tinggi.</div>`;
    if (v.status !== 'tervalidasi') {
      html += `<div class="status-validasi belum"><b>Belum divalidasi.</b> Tidak ada titik api periode ${v.periodeUji.join('–')} yang terbaca
        (titik api termuat: ${A(S.hotspotSemua.length)}${S.tahunData ? ', tahun ' + S.tahunData.join('–') : ''}).
        Unggah data FIRMS VIIRS ${v.periodeUji.join('–')} di tab Data. WebGIS tidak menampilkan angka akurasi sebelum data uji tersedia.</div>`;
    } else {
      const auc = v.roc ? v.roc.auc : NaN;
      html += `<div class="kartu-grid">
        <div class="kartu"><span>AUC (ROC berbasis sel)</span><b>${A(auc, 3)}</b><small>${kategoriAUC(auc)}</small></div>
        <div class="kartu"><span>AUC laju prediksi</span><b>${A(v.laju ? v.laju.auc : NaN, 3)}</b><small>luas diurutkan dari skor tertinggi</small></div>
        <div class="kartu"><span>Titik api uji di kelas tinggi</span><b>${A(v.persenKejadianTinggi, 1)}%</b><small>pada ${A(v.persenLuasTinggi, 1)}% luas wilayah</small></div>
        <div class="kartu"><span>Data uji</span><b>${A(v.nUji)}</b><small>titik · ${A(v.roc ? v.roc.P : NaN)} sel positif dari ${A(v.roc ? v.roc.P + v.roc.N : NaN)} sel</small></div>
      </div>
      <div class="grafik-kotak tinggi"><canvas id="ch-roc"></canvas></div>
      <h4>Proporsi kejadian per kelas bahaya (data uji ${v.periodeUji.join('–')})</h4>
      ${tabelKelas(v.tabel)}
      <div class="catatan">Rasio frekuensi = % titik api / % luas kelas. Nilai > 1 berarti kejadian lebih sering daripada yang diharapkan dari luasnya; model yang baik memiliki rasio meningkat dari kelas rendah ke tinggi.</div>`;
    }
    if (v.tabelLatih) {
      html += `<h4>Kecocokan dengan data pengembangan ${v.periodeLatih.join('–')} (bukan validasi independen)</h4>${tabelKelas(v.tabelLatih)}
        <div class="catatan">Laju keberhasilan (success rate) memakai titik api yang ikut membentuk parameter kerapatan, sehingga nilainya cenderung lebih tinggi daripada pengujian independen.</div>`;
    }
    if (v.rocTerbakar) {
      html += `<h4>Validasi terhadap area bekas terbakar</h4>
        <div class="kartu-grid"><div class="kartu"><span>AUC area terbakar</span><b>${A(v.rocTerbakar.auc, 3)}</b><small>${kategoriAUC(v.rocTerbakar.auc)}</small></div></div>
        ${tabelKelas(v.tabelTerbakar, 'Sel terbakar')}`;
    } else {
      html += '<div class="catatan">Validasi terhadap area bekas terbakar: <b>belum tersedia</b> (unggah MCD64A1/KLHK di tab Data).</div>';
    }
    if (v.catatan.length) html += '<div class="kotak-peringatan">' + v.catatan.map(E).join('<br>') + '</div>';
    html += `<h4>Keterbatasan</h4><ul class="daftar">
      <li>Titik api adalah anomali panas aktif, bukan selalu kebakaran lahan (bisa industri/gas flare) dan tidak terdeteksi di bawah awan/asap tebal.</li>
      <li>Validasi berbasis sel ±1 km; kesalahan posisi VIIRS (±375 m) dapat memindahkan titik ke sel tetangga.</li>
      <li>AUC mengukur kemampuan mengurutkan wilayah, bukan probabilitas kebakaran absolut.</li>
      <li>Parameter dengan resolusi kasar (ERA5-Land ±9 km, CHIRPS ±5,6 km) diresampling ke 1 km sehingga variasi lokal tidak tertangkap.</li></ul>
      <div class="catatan">Kategori AUC mengikuti Hosmer &amp; Lemeshow (2000), <i>Applied Logistic Regression</i>.</div>`;
    box.innerHTML = html;
    if (v.status === 'tervalidasi' && v.roc && siapGrafik()) {
      const ds = [{ label: 'ROC data uji (AUC ' + A(v.roc.auc, 3) + ')', data: v.roc.roc.map(([x, y]) => ({ x, y })), borderColor: '#f97316', backgroundColor: '#f97316', showLine: true, pointRadius: 0, borderWidth: 2 }];
      if (v.laju) ds.push({ label: 'Laju prediksi (x = % luas)', data: v.laju.kurva.map(([x, y]) => ({ x, y })), borderColor: '#38bdf8', showLine: true, pointRadius: 0, borderWidth: 2 });
      if (v.lajuLatih && v.lajuLatih.kurva.length) ds.push({ label: 'Laju keberhasilan ' + v.periodeLatih.join('–'), data: v.lajuLatih.kurva.map(([x, y]) => ({ x, y })), borderColor: '#a3a3a3', borderDash: [4, 3], showLine: true, pointRadius: 0, borderWidth: 1.5 });
      ds.push({ label: 'Acak', data: [{ x: 0, y: 0 }, { x: 1, y: 1 }], borderColor: '#64748b', borderDash: [2, 2], showLine: true, pointRadius: 0, borderWidth: 1 });
      buatAtauPerbarui('ch-roc', { type: 'scatter', data: { datasets: ds },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
          scales: { x: { min: 0, max: 1, title: { display: true, text: 'False positive rate / proporsi luas' } }, y: { min: 0, max: 1, title: { display: true, text: 'True positive rate / proporsi kejadian' } } } } });
    }
  }
  function tabelKelas(tb, judulKejadian) {
    if (!tb) return '';
    const kc = KW.CFG.model.kelas;
    return `<table class="tabel kecil"><thead><tr><th>Kelas</th><th>Luas (ha)</th><th>% luas</th><th>${judulKejadian || 'Titik api'}</th><th>% kejadian</th><th>Rasio frek.</th></tr></thead><tbody>
      ${tb.baris.map(r => `<tr><td><i class="kotak" style="background:${kc.warna[r.kelas - 1]}"></i>${kc.nama[r.kelas - 1]}</td><td>${A(r.luasHa)}</td><td>${A(r.persenLuas, 1)}</td><td>${A(r.kejadian)}</td><td>${A(r.persenKejadian, 1)}</td><td>${A(r.rasioFrekuensi, 2)}</td></tr>`).join('')}
      </tbody></table>`;
  }

  /* ============================================================== DAMPAK */
  function bangunPanelDampak() {
    const box = $('dampak-isi');
    const d = S.dampak;
    hapusGrafik('ch-dampak');
    if (!d || !S.hasil || !S.hasil.selValid) { box.innerHTML = '<p class="kosong">Model belum dapat dihitung.</p>'; return; }
    const kc = KW.CFG.model.kelas, T = kc.kelasTinggiMulai, t = d.total;
    const kartu = (judul, nilai, ket, ada) => `<div class="kartu ${ada ? '' : 'redup'}"><span>${judul}</span><b>${ada ? nilai : 'Belum ada data'}</b><small>${ket}</small></div>`;
    let html = `<div class="kotak-info">Analisis overlay antara kelas bahaya <b>${kc.nama.slice(T - 1).join(' + ')}</b> (indeks &gt; ${A(S.hasil.batas[T - 2], 2)}) dengan karakteristik wilayah.
      Angka di bawah adalah <b>wilayah berpotensi terdampak</b> berdasarkan peta bahaya, <b>bukan</b> wilayah yang sudah terbakar.</div>
      <div class="kartu-grid">
        ${kartu('Luas bahaya tinggi', A(t.luasTinggi) + ' ha', A(100 * t.luasTinggi / S.hasil.luasStudiHa, 1) + '% wilayah studi', true)}
        ${kartu('Gambut pada bahaya tinggi', A(t.gambutTinggi) + ' ha', d.ada.gambut ? A(t.gambutTotal ? 100 * t.gambutTinggi / t.gambutTotal : NaN, 1) + '% dari ' + A(t.gambutTotal) + ' ha gambut' : 'Butuh peta gambut/KHG', d.ada.gambut)}
        ${kartu('Kawasan hutan pada bahaya tinggi', A(t.hutanTinggi) + ' ha', 'rincian per fungsi di bawah', d.ada.hutan)}
        ${kartu('Permukiman pada bahaya tinggi', A(t.permukimanTinggi) + ' ha', 'dari kelas tutupan lahan permukiman', d.ada.permukiman)}
        ${kartu('Fasilitas di zona bahaya tinggi', A(t.fasilitasTinggi) + ' titik', 'dari ' + A(t.fasilitasTotal) + ' fasilitas di wilayah studi', d.ada.fasilitas)}
        ${kartu('Penduduk di zona bahaya tinggi', A(t.pendudukTinggi) + ' jiwa', 'dari raster penduduk', d.ada.penduduk)}
      </div>
      <h4>Kejadian aktual (terpisah dari potensi)</h4>
      <div class="kartu-grid">${kartu('Area bekas terbakar', A(t.terbakar) + ' ha', d.ada.terbakar ? A(t.terbakar ? 100 * t.terbakarTinggi / t.terbakar : NaN, 1) + '% berada di kelas bahaya tinggi · ' + A(t.terbakarGambut) + ' ha di gambut' : 'Unggah data area terbakar di tab Data', d.ada.terbakar)}</div>`;
    if (d.ada.hutan && Object.keys(d.hutanPerKategori).length) {
      html += `<h4>Kawasan hutan pada bahaya tinggi per fungsi/atribut</h4><table class="tabel kecil"><thead><tr><th>Kategori</th><th>Luas (ha)</th></tr></thead><tbody>
        ${Object.entries(d.hutanPerKategori).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${E(k)}</td><td>${A(v)}</td></tr>`).join('')}</tbody></table>`;
    }
    if (S.prioritas) {
      const pr = S.prioritas, lz = S.hasil.zonaKelas.luasZona;
      const urut = pr.peringkat.map((r, z) => ({ r, z })).sort((a, b) => (a.r || 99) - (b.r || 99));
      html += `<h4>Statistik dampak & prioritas mitigasi per kabupaten/kota</h4>
        <div class="tabel-gulir"><table class="tabel kecil" id="tabel-kab"><thead><tr><th>#</th><th>Kab/Kota</th><th>Luas (ha)</th><th>Bahaya tinggi (ha)</th><th>%</th>
        ${d.ada.gambut ? '<th>Gambut tinggi (ha)</th>' : ''}${d.ada.hutan ? '<th>Hutan tinggi (ha)</th>' : ''}${d.ada.fasilitas ? '<th>Fasilitas</th>' : ''}
        <th>Titik api ${KW.CFG.periode.pengembangan.join('–')}</th><th>Indeks</th><th>Prioritas</th></tr></thead><tbody>
        ${urut.map(({ r, z }) => { const dz = d.perZona[z]; return `<tr data-z="${z}"><td>${r || '–'}</td><td><a href="#" data-z="${z}">${E(S.namaZona[z])}</a></td><td>${A(lz[z])}</td><td>${A(dz.luasTinggi)}</td><td>${A(lz[z] ? 100 * dz.luasTinggi / lz[z] : NaN, 1)}</td>
          ${d.ada.gambut ? `<td>${A(dz.gambutTinggi)}</td>` : ''}${d.ada.hutan ? `<td>${A(dz.hutanTinggi)}</td>` : ''}${d.ada.fasilitas ? `<td>${A(dz.fasilitasTinggi)}</td>` : ''}
          <td>${A(pr.hotspotLatih[z])}</td><td>${A(pr.skor[z], 3)}</td><td>${pr.tingkat[z] || '–'}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="grafik-kotak"><canvas id="ch-dampak"></canvas></div>
        <div class="kotak-info"><b>Indeks prioritas mitigasi</b> = rerata dari indikator berikut setelah dinormalisasi min–maks antar-kab/kota (bobot sama, karena tidak ada dasar a priori untuk membedakan bobotnya):
        <ol>${pr.indikator.map(i => `<li>${E(i.nama)}</li>`).join('')}</ol>
        Peringkat 1–${Math.ceil(urut.length / 3)} = Prioritas I, berikutnya Prioritas II, sisanya Prioritas III. Titik api periode pengujian tidak dipakai.</div>`;
    } else {
      html += '<div class="catatan">Statistik per kab/kota membutuhkan batas administrasi yang berisi lebih dari satu kab/kota.</div>';
    }
    // emisi
    const E2 = S.emisi;
    html += `<h4>Estimasi potensi emisi dari area terbakar</h4>
      <div class="kotak-info">${E(KW.CFG.emisi.rumus)}. A = luas terbakar aktual (ha), MB·Cf = massa bahan bakar terbakar (t bahan kering/ha), Gef = faktor emisi (g/kg bahan kering).
      Faktor emisi <b>tidak diisi bawaan</b>; masukkan dari IPCC 2006 Vol. 4 Bab 2 (Tabel 2.4–2.5) atau IPCC 2013 Wetlands Supplement (gambut) beserta rujukannya.</div>`;
    if (!d.ada.terbakar) {
      html += '<div class="status-validasi belum">Belum dapat dihitung: data area bekas terbakar belum tersedia. Peta bahaya menunjukkan potensi, sehingga tidak dipakai sebagai luas terbakar.</div>';
    } else {
      const aG = t.terbakarGambut, aM = t.terbakar - t.terbakarGambut;
      const eG = C.emisiKebakaran(aG, Number(E2.gambut.mbcf), Number(E2.gambut.gef));
      const eM = C.emisiKebakaran(aM, Number(E2.mineral.mbcf), Number(E2.mineral.gef));
      html += `<table class="tabel kecil emisi"><thead><tr><th>Lahan</th><th>A (ha)</th><th>MB·Cf (t/ha)</th><th>Gef (g/kg)</th><th>Emisi (ton)</th></tr></thead><tbody>
        <tr><td>Gambut</td><td>${A(aG)}</td><td><input type="number" step="any" id="em-g-mb" value="${E2.gambut.mbcf}"></td><td><input type="number" step="any" id="em-g-gef" value="${E2.gambut.gef}"></td><td>${eG === null ? '–' : A(eG)}</td></tr>
        <tr><td>Tanah mineral</td><td>${A(aM)}</td><td><input type="number" step="any" id="em-m-mb" value="${E2.mineral.mbcf}"></td><td><input type="number" step="any" id="em-m-gef" value="${E2.mineral.gef}"></td><td>${eM === null ? '–' : A(eM)}</td></tr>
        <tr><th colspan="4">Total ${E(E2.gas)}${(eG === null) !== (eM === null) ? ' <span class="ringan">(hanya baris yang faktor emisinya terisi)</span>' : ''}</th><th>${eG === null && eM === null ? '–' : A((eG || 0) + (eM || 0))}</th></tr></tbody></table>
        <div class="baris-form"><label>Gas</label><select id="em-gas">${['CO₂', 'CH₄', 'CO', 'N₂O'].map(g => `<option ${E2.gas === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        <div class="baris-form"><label>Rujukan faktor emisi</label><input type="text" id="em-rujukan" value="${E(E2.rujukan)}" placeholder="mis. IPCC 2006 Vol.4 Tabel 2.4–2.5"></div>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('a[data-z]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); KW.fokusZona(Number(a.dataset.z)); }));
    const ikat = (id, obj, key) => { const el = $(id); if (el) el.addEventListener('change', () => { obj[key] = el.value; bangunPanelDampak(); }); };
    ikat('em-g-mb', E2.gambut, 'mbcf'); ikat('em-g-gef', E2.gambut, 'gef'); ikat('em-m-mb', E2.mineral, 'mbcf'); ikat('em-m-gef', E2.mineral, 'gef');
    ikat('em-gas', E2, 'gas'); ikat('em-rujukan', E2, 'rujukan');
    if (S.prioritas && siapGrafik()) {
      const lz = S.hasil.zonaKelas.luasZona;
      const urut = S.namaZona.map((n, z) => ({ n, z })).sort((a, b) => d.perZona[b.z].luasTinggi - d.perZona[a.z].luasTinggi);
      const ds = [{ label: 'Bahaya tinggi (ha)', data: urut.map(o => Math.round(d.perZona[o.z].luasTinggi)), backgroundColor: '#ef4444' }];
      if (d.ada.gambut) ds.push({ label: 'Gambut pada bahaya tinggi (ha)', data: urut.map(o => Math.round(d.perZona[o.z].gambutTinggi)), backgroundColor: '#92400e' });
      buatAtauPerbarui('ch-dampak', { type: 'bar', data: { labels: urut.map(o => o.n), datasets: ds },
        options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } }, scales: { y: { beginAtZero: true, ticks: { callback: (x) => A(x) } } } } });
      void lz;
    }
  }

  /* ========================================================== METODOLOGI */
  function bangunPanelMetodologi() {
    const M = KW.CFG.model, P = KW.CFG.periode;
    const tot = M.kelompok.reduce((s, k) => s + (Number(k.bobot) || 0), 0) || 1;
    const statusSlot = (slot) => { const s = S.slot[slot]; return !s ? '–' : s.status === 'ok' ? '<span class="chip ok">terintegrasi</span>' : s.status === 'gagal' ? '<span class="chip gagal">gagal dimuat</span>' : '<span class="chip kosong">belum ada</span>'; };
    $('metodologi-isi').innerHTML = `
      <h4>Tujuan pemodelan</h4>
      <p>Mengidentifikasi variabel spasial yang berpengaruh terhadap karhutla, menganalisis pola dan riwayat titik api, menyusun model spasial tingkat bahaya,
      menganalisis potensi dampak, dan menentukan wilayah prioritas mitigasi di Kalimantan Timur (7 kabupaten, 3 kota; ${A(KW.CFG.wilayah.luasResmiKm2, 2)} km², BPS 2025).</p>
      <h4>Periode analisis</h4>
      <table class="tabel kecil"><tbody>
        <tr><th>Referensi klimatologis (SPI)</th><td>${P.klimatologi.join('–')}</td></tr>
        <tr><th>Informasi historis tambahan</th><td>${P.historis.join('–')}</td></tr>
        <tr><th>Pengembangan model</th><td>${P.pengembangan.join('–')}</td></tr>
        <tr><th>Pengujian temporal independen</th><td>${P.pengujian.join('–')} (tidak dipakai membangun/mengkalibrasi model)</td></tr></tbody></table>
      <h4>Parameter, pengolahan, dan pembobotan</h4>
      <div class="tabel-gulir"><table class="tabel kecil"><thead><tr><th>Kelompok (bobot)</th><th>Parameter</th><th>Bobot dalam kelompok</th><th>Skoring yang dipakai</th><th>Data</th></tr></thead><tbody>
      ${M.kelompok.map(k => k.parameter.map((p, i) => {
        const r = S.rincian[p.id];
        const sk = !r ? '–' : (r.metode === 'ambang' || r.metode === 'kuantil') ? `${r.metode}, arah ${r.arah}: ${r.batas.map(b => A(b, Math.abs(b) < 10 ? 3 : 1)).join(' | ')}` : r.metode === 'kategori-teks' ? 'kategori teks → skor' : r.metode;
        const pk = k.parameter.filter(x => Number(x.bobot) > 0).reduce((s, x) => s + Number(x.bobot), 0) || 1;
        return `<tr>${i === 0 ? `<td rowspan="${k.parameter.length}"><b>${E(k.nama)}</b><br>${A(100 * k.bobot / tot, 1)}%</td>` : ''}<td>${E(p.nama)}</td><td>${Number(p.bobot) > 0 ? A(100 * p.bobot / pk, 1) + '%' : '0 (nonaktif)'}</td><td>${E(sk)}</td><td>${p.slot === '_kerapatan' ? (S.lapis._kerapatan ? '<span class="chip ok">terhitung</span>' : '<span class="chip kosong">belum ada</span>') : statusSlot(p.slot)}</td></tr>`;
      }).join('')).join('')}</tbody></table></div>
      <p class="catatan">Bobot kelompok: AHP keseluruhan Kelompok 2 (λmax 5,026; CI 0,0066; CR 0,006; rujukan kelompok: Tiwari dkk., 2026; Farandika &amp; Hartono).
      Ambang skor LST: Simarmata dkk. (2025), JGEL 9(1):78–97, doi:10.22236/jgel.v9i1.14520, mengacu Jaiswal dkk. (2002).
      Bobot parameter di dalam kelompok dan skor kategori yang ditandai [ASUMSI] di konfigurasi adalah nilai awal yang harus disesuaikan dengan tabel skor kelompok.</p>
      <h4>Formula model</h4>${rumusHTML()}
      <h4>Klasifikasi</h4><p>Indeks 1–5 dibagi menjadi 5 kelas dengan metode <b>${M.kelas.metode}</b>, batas ${M.kelas.batas.map(b => A(b, 2)).join(' | ')}.
      "Bahaya tinggi" untuk analisis dampak = kelas ${M.kelas.nama.slice(M.kelas.kelasTinggiMulai - 1).join(' + ')}.</p>
      <h4>Pra-pemrosesan di WebGIS</h4><ul class="daftar">
        <li>Grid analisis geografis EPSG:4326, resolusi ${KW.CFG.grid.resolusiDerajat}° (±1,1 km), dipotong batas Kalimantan Timur.</li>
        <li>Raster diresampling: kategori dengan tetangga terdekat; kontinu dengan bilinear (sumber kasar) atau rata-rata blok (sumber halus). Raster UTM/Web Mercator ditransformasi otomatis.</li>
        <li>Poligon dirasterisasi (pusat sel di dalam poligon); garis kanal diubah menjadi jarak Euclidean (km).</li>
        <li>Titik api disaring confidence ≥ ${['rendah', 'nominal', 'tinggi'][KW.CFG.hotspot.confidenceMinimum]}; kerapatan dihitung dengan KDE Gaussian (bandwidth ${KW.CFG.hotspot.bandwidthKdeKm} km) hanya dari periode pengembangan.</li>
        <li>Luas dihitung secara geodesik per sel (bola, R = 6.371.008,8 m).</li></ul>
      <h4>Validasi</h4><p>ROC/AUC berbasis sel dan kurva laju prediksi terhadap titik api ${P.pengujian.join('–')}, proporsi kejadian pada kelas bahaya tinggi, dan rasio frekuensi per kelas; opsional terhadap area bekas terbakar.</p>
      <h4>Analisis dampak</h4><p>Overlay kelas bahaya tinggi dengan gambut/KHG, kawasan hutan/konsesi, permukiman (tutupan lahan dan titik fasilitas), penduduk (bila tersedia), serta perbandingan dengan area terbakar aktual. Emisi hanya dihitung dari area terbakar aktual dengan faktor emisi yang dimasukkan pengguna (IPCC 2006 Pers. 2.27).</p>
      <h4>Keterbatasan</h4><ul class="daftar">
        <li>Model weighted overlay bersifat pakar (knowledge-driven); kualitasnya bergantung pada skoring dan bobot.</li>
        <li>Parameter cuaca adalah agregat 2015–2022, sehingga peta menggambarkan bahaya struktural rata-rata, bukan bahaya harian.</li>
        <li>Perbedaan resolusi sumber (30 m hingga ±9 km) menimbulkan ketidakpastian pada skala lokal.</li>
        <li>Data yang belum tersedia (lihat tab Data) dikeluarkan dari perhitungan dengan renormalisasi bobot; hasil akan berubah setelah data dilengkapi.</li></ul>
      <h4>Sumber data</h4>
      <div class="tabel-gulir"><table class="tabel kecil"><thead><tr><th>Parameter</th><th>Sumber</th><th>Resolusi</th><th>Akses/lisensi</th></tr></thead><tbody>
      ${KW.SUMBER_DATA.map(d => `<tr><td>${E(d.p)}</td><td><a href="${d.u}" target="_blank" rel="noopener">${E(d.s)}</a></td><td>${E(d.r)}</td><td>${E(d.l)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ================================================================ DATA */
  KW.segarkanStatusData = function () {
    const box = $('data-slot');
    if (!box) return;
    const D = KW.CFG.data;
    const chip = (s) => !s ? '<span class="chip">–</span>' : s.status === 'ok' ? '<span class="chip ok">terintegrasi</span>' : s.status === 'memuat' ? '<span class="chip">memuat…</span>' : s.status === 'gagal' ? '<span class="chip gagal">gagal</span>' : '<span class="chip kosong">belum ada</span>';
    box.innerHTML = Object.keys(D).map(k => {
      const c = D[k], s = S.slot[k];
      let info = '';
      if (s && s.status === 'ok' && s.info) {
        if (s.data.tipe === 'vektor') {
          info = `${A(s.info.fitur)} fitur · ${E(s.info.geometri)}`;
          if (k === 'hotspot' && s.info.dalamWilayah !== undefined) info += ` · ${A(s.info.dalamWilayah)} di wilayah studi${s.info.tahun ? ', ' + s.info.tahun.join('–') : ''}`;
          if (s.info.atribut && s.info.atribut.length && k !== 'hotspot') {
            const sekarang = k === 'batas' ? S.fieldNama : s.field;
            info += `<label class="pilih-field">Atribut ${k === 'batas' ? 'nama' : 'nilai'}: <select data-slot="${k}"><option value="auto">otomatis${sekarang ? ' (' + E(sekarang) + ')' : ''}</option>${s.info.atribut.map(a => `<option value="${E(a)}" ${(c.field || c.fieldNama) === a ? 'selected' : ''}>${E(a)}</option>`).join('')}</select></label>`;
          }
        } else {
          info = `${A(s.info.lebar)}×${A(s.info.tinggi)} px · EPSG:${s.info.epsg} · noData ${s.info.noData === null ? 'tidak diset' : E(s.info.noData)}`;
          if (S.lapis[k] && S.lapis[k].stat && S.lapis[k].stat.n) info += ` · nilai ${A(S.lapis[k].stat.min, 2)} s.d. ${A(S.lapis[k].stat.max, 2)}`;
        }
        if (s.info.catatan) info += ' · ' + E(s.info.catatan);
      } else if (s && s.pesan) info = E(s.pesan);
      const format = c.jenis === 'raster' ? '.tif' : c.jenis === 'titik' ? '.geojson,.json,.csv,.zip' : c.jenis === 'vektor' ? '.geojson,.json,.zip' : '.tif,.tiff,.geojson,.json,.zip';
      return `<div class="slot ${s ? s.status : ''}">
        <div class="slot-kepala"><b>${E(c.label)}</b>${chip(s)}</div>
        <div class="slot-berkas">${s && s.nama ? E(s.nama.split('/').pop()) + (s.sumber === 'unggah' ? ' (unggahan)' : '') : (c.file ? E(c.file) : 'tidak ada berkas di konfigurasi')}</div>
        ${info ? `<div class="slot-info">${info}</div>` : ''}
        <label class="tombol kecil unggah">Unggah<input type="file" accept="${format}" data-slot="${k}" hidden></label>
      </div>`;
    }).join('');
    box.querySelectorAll('input[type=file]').forEach(inp => inp.addEventListener('change', () => {
      if (inp.files && inp.files[0]) KW.unggah(inp.dataset.slot, inp.files[0]);
    }));
    box.querySelectorAll('select[data-slot]').forEach(sel => sel.addEventListener('change', () => KW.gantiField(sel.dataset.slot, sel.value)));
    const ok = Object.values(S.slot).filter(s => s.status === 'ok').length;
    const st = $('status-data-ringkas');
    if (st) st.textContent = ok + '/' + Object.keys(D).length + ' data terintegrasi';
  };

  function pasangTombolData() {
    $('muat-ulang-data').addEventListener('click', () => KW.muatUlangSemua());
    $('hitung-ulang').addEventListener('click', () => { clearTimeout(tundaHitung); jadwalkanHitung(); });
    $('reset-model').addEventListener('click', () => {
      const asli = JSON.parse(JSON.stringify(KW.CFG_ASLI));
      KW.CFG.model = asli.model; KW.CFG.periode = asli.periode; KW.CFG.hotspot = asli.hotspot;
      matriksAHP = null;
      KW.terapkanFilter(); KW.hitungModel(); KW.segarkanSemua(); KW.notifikasi('Pengaturan model dikembalikan ke bawaan', 'ok');
    });
    $('simpan-pengaturan').addEventListener('click', () => KW.unduhPengaturan());
    $('muat-pengaturan').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.model) KW.CFG.model = j.model;
        if (j.periode) KW.CFG.periode = j.periode;
        if (j.hotspot) KW.CFG.hotspot = j.hotspot;
        matriksAHP = null;
        KW.terapkanFilter(); KW.hitungModel(); KW.segarkanSemua(); KW.notifikasi('Pengaturan dimuat dari ' + f.name, 'ok');
      } catch (err) { KW.notifikasi('Berkas pengaturan tidak valid: ' + err.message, 'galat'); }
      e.target.value = '';
    });
  }

  /* ========================================================= penyegaran */
  KW.segarkanSemua = function (opsi) {
    if (!S.siap) return;
    bangunDaftarLapisan();
    if (opsi && opsi.pertahankanEditor) {
      // editor tidak dibangun ulang agar penggeser/isian yang sedang dipakai tidak hilang
      $('model-rumus').innerHTML = rumusHTML();
      perbaruiInfoDipakai();
    } else bangunPanelModel();
    bangunPanelValidasi();
    bangunPanelDampak();
    bangunPanelMetodologi();
    KW.segarkanStatusData();
    KW.segarkanDashboard();
    KW.perbaruiPresetPeriode && KW.perbaruiPresetPeriode();
    KW.segarkanPeta && KW.segarkanPeta();
    const ks = $('ringkas-status');
    if (ks) {
      const kosong = KW.CFG.model.kelompok.filter(k => S.hasil && S.hasil.kelompokTanpaData.includes(k.id)).map(k => k.nama);
      const kurang = [];
      KW.CFG.model.kelompok.forEach(k => k.parameter.forEach(p => { if (Number(p.bobot) > 0 && !S.lapis[p.slot]) kurang.push(p.nama); }));
      ks.innerHTML = (kosong.length ? `<div class="kotak-peringatan">Kelompok tanpa data (dikeluarkan dari model, bobot dinormalisasi ulang): <b>${kosong.map(E).join(', ')}</b></div>` : '')
        + (kurang.length ? `<div class="catatan">Parameter belum ada data: ${kurang.map(E).join(', ')}. Lengkapi di tab Data.</div>` : '<div class="catatan ok">Semua parameter berbobot telah memiliki data.</div>')
        + (S.hasil ? `<div class="catatan">Sel dengan seluruh kelompok terisi: ${A(S.hasil.selValid ? 100 * S.hasil.selLengkap / S.hasil.selValid : 0, 1)}% · dihitung ${S.hasil.waktu.toLocaleTimeString('id-ID')}</div>` : '');
    }
  };

  KW.inisialisasiPanel = function () {
    pasangNavigasi();
    pasangTombolData();
    KW.segarkanStatusData();
  };
})();
