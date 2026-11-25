/* =============================================================================
 * Inti aplikasi: status, alur pemrosesan data, dan pemodelan
 *   muat data -> grid analisis -> gridkan parameter -> skor -> model ->
 *   klasifikasi -> statistik -> validasi -> dampak -> prioritas
 * ===========================================================================*/
(function () {
  'use strict';
  const C = window.KarhutlaCore;
  const D = window.KarhutlaData;
  const KW = window.KW = window.KW || {};

  const salin = (o) => JSON.parse(JSON.stringify(o));
  KW.CFG_ASLI = salin(window.KARHUTLA_CONFIG);
  KW.CFG = salin(window.KARHUTLA_CONFIG);
  KW.C = C;

  const P = KW.CFG.periode;
  KW.S = {
    grid: null, mask: null, zona: null, namaZona: [], fiturBatas: null, fieldNama: null, adaZona: false,
    slot: {}, lapis: {},
    hotspotSemua: [], hotspotDiLuar: 0, hotspotTanpaTanggal: 0,
    fasilitas: [],
    skor: {}, rincian: {},
    hasil: null, validasi: null, dampak: null, prioritas: null,
    kerapatanInfo: null,
    filter: { tahun: [P.semuaHotspot[0], P.semuaHotspot[1]], bulan: [1, 12], kelasTampil: [true, true, true, true, true] },
    hotspotTampil: [],
    emisi: { gambut: { mbcf: '', gef: '' }, mineral: { mbcf: '', gef: '' }, gas: 'CO₂', rujukan: '' },
    versi: 0, siap: false
  };
  const S = KW.S;

  /* --------------------------------------------------------- utilitas UI */
  KW.angka = function (v, d) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    d = d === undefined ? 0 : d;
    return v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  KW.esc = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  KW.notifikasi = function (pesan, jenis) {
    const box = document.getElementById('toast');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (jenis || 'info');
    el.textContent = pesan;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('hilang'); setTimeout(() => el.remove(), 400); }, jenis === 'galat' ? 7000 : 4000);
  };
  KW.memuat = function (pesan) {
    const el = document.getElementById('memuat');
    if (!el) return;
    if (pesan) { el.querySelector('.memuat-teks').textContent = pesan; el.classList.add('aktif'); }
    else el.classList.remove('aktif');
  };
  const jeda = () => new Promise(r => setTimeout(r, 0));

  /* --------------------------------------------------------- pemuatan */
  function infoSlot(key) { return KW.CFG.data[key]; }

  async function muatSlot(key, sumber) {
    const cfg = infoSlot(key);
    S.slot[key] = { status: 'memuat', sumber: typeof sumber === 'string' ? 'folder' : 'unggah',
      nama: typeof sumber === 'string' ? sumber : sumber.name, pesan: '' };
    KW.segarkanStatusData && KW.segarkanStatusData();
    try {
      const jenis = cfg.jenis === 'raster_atau_vektor' ? null : cfg.jenis;
      const hasil = await D.muatBerkas(sumber, jenis, key === 'batas' ? null : S.grid, KW.CFG.grid.maksDimensiBacaRaster);
      const slot = S.slot[key];
      slot.data = hasil; slot.status = 'ok';
      if (hasil.tipe === 'vektor') {
        slot.info = { fitur: hasil.fc.features.length, geometri: D.jenisGeometri(hasil.fc), atribut: D.daftarAtribut(hasil.fc) };
        if (!hasil.fc.features.length) { slot.status = 'gagal'; slot.pesan = 'Berkas tidak berisi fitur'; }
      } else {
        const r = hasil.raster;
        slot.info = { lebar: r.info.lebarAsli, tinggi: r.info.tinggiAsli, epsg: r.epsg, resolusi: r.info.resolusiAsli,
          noData: r.noData, dibaca: [r.lebar, r.tinggi], band: r.info.jumlahBand };
      }
    } catch (e) {
      S.slot[key].status = e.tidakAda ? 'kosong' : 'gagal';
      S.slot[key].pesan = e.message;
      if (!e.tidakAda) console.warn('Slot ' + key + ':', e);
    }
    KW.segarkanStatusData && KW.segarkanStatusData();
  }
  KW.muatSlot = muatSlot;

  function siapkanGrid() {
    const res = KW.CFG.grid.resolusiDerajat;
    const b = S.slot.batas;
    if (b && b.status === 'ok' && b.data.tipe === 'vektor') {
      const fc = b.data.fc;
      let bb = [Infinity, Infinity, -Infinity, -Infinity];
      fc.features.forEach(f => C.ambilPoligon(f.geometry).forEach(poly => poly.forEach(ring => ring.forEach(p => {
        if (p[0] < bb[0]) bb[0] = p[0]; if (p[1] < bb[1]) bb[1] = p[1];
        if (p[0] > bb[2]) bb[2] = p[0]; if (p[1] > bb[3]) bb[3] = p[1];
      }))));
      if (!Number.isFinite(bb[0])) bb = KW.CFG.wilayah.bboxCadangan;
      S.grid = C.buatGrid([bb[0] - res, bb[1] - res, bb[2] + res, bb[3] + res], res);
      S.fiturBatas = fc.features;
      const pilihan = KW.CFG.data.batas.fieldNama;
      S.fieldNama = (pilihan && pilihan !== 'auto') ? pilihan : C.deteksiField(fc.features, C.KANDIDAT_FIELD.nama);
      S.zona = C.rasterisasiFitur(fc.features, S.grid);
      S.mask = new Uint8Array(S.grid.n);
      for (let i = 0; i < S.grid.n; i++) S.mask[i] = S.zona[i] >= 0 ? 1 : 0;
      S.namaZona = fc.features.map((f, i) => {
        const v = S.fieldNama ? (f.properties || {})[S.fieldNama] : null;
        return v ? String(v) : 'Wilayah ' + (i + 1);
      });
      S.adaZona = fc.features.length > 1;
    } else {
      S.grid = C.buatGrid(KW.CFG.wilayah.bboxCadangan, res);
      S.mask = new Uint8Array(S.grid.n).fill(1);
      S.zona = new Int32Array(S.grid.n).fill(-1);
      S.fiturBatas = null; S.namaZona = []; S.adaZona = false;
    }
  }

  /* ------------------------------------------------ gridkan setiap slot */
  function fieldUntuk(key, fc) {
    const cfg = infoSlot(key);
    if (cfg.field && cfg.field !== 'auto') return cfg.field;
           const gambut = key === 'gambut' || key === 'gambut_dampak', hutan = key === 'kawasan_hutan' || key === 'hutan_dampak';
    const kand = gambut ? C.KANDIDAT_FIELD.gambut : hutan ? C.KANDIDAT_FIELD.kawasan : C.KANDIDAT_FIELD.nilai;
    return C.deteksiField(fc.features, kand) || (hutan || key === 'gambut_dampak' ? null : C.deteksiFieldNumerik(fc.features));
  }
  function gridkanSlot(key) {
    delete S.lapis[key];
    const slot = S.slot[key];
    if (!slot || slot.status !== 'ok') return;
    const cfg = infoSlot(key);
    try {
      if (slot.data.tipe === 'raster') {
        const r = slot.data.raster;
        const kategorikal = !!cfg.kategorikal || key === 'area_terbakar';
        let metode = 'auto';
        if (key === 'penduduk') metode = 'rata';
        const nilai = C.resampleRaster(r, S.grid, S.mask, { kategorikal, metode });
        if (key === 'penduduk') { // jumlah jiwa per piksel asli -> jumlah per sel grid
          const rx = Math.abs(r.info.resolusiAsli[0]), ry = Math.abs(r.info.resolusiAsli[1]);
          const cLat = (S.grid.ymin + S.grid.ymax) / 2 * Math.PI / 180;
          const selX = S.grid.dx * 111320 * Math.cos(cLat), selY = S.grid.dy * 110570;
          const faktor = rx < 1 ? (S.grid.dx / rx) * (S.grid.dy / ry) : (selX * selY) / (rx * ry);
          for (let i = 0; i < nilai.length; i++) if (Number.isFinite(nilai[i])) nilai[i] *= faktor;
          slot.info.catatan = 'Rata-rata jiwa/piksel dikalikan ' + faktor.toFixed(1) + ' (jumlah piksel asli per sel)';
        }
        S.lapis[key] = { nilai, kategori: null, adaFitur: null, jenis: 'raster', stat: C.statistik(nilai, S.mask) };
        if (key === 'area_terbakar') S.lapis[key].adaFitur = Uint8Array.from(nilai, v => Number.isFinite(v) && v > 0 ? 1 : 0);
        return;
      }
      const fc = slot.data.fc;
      const geom = D.jenisGeometri(fc);
      if (geom === 'LineString') {
        const idx = C.rasterisasiGaris(fc.features, S.grid);
        const ada = Uint8Array.from(idx, v => v >= 0 ? 1 : 0);
        const jarak = C.jarakKeSumber(ada, S.grid, S.mask);
        S.lapis[key] = { nilai: jarak || new Float32Array(S.grid.n).fill(NaN), kategori: null, adaFitur: null, jenis: 'jarak',
          satuan: 'km', idx, stat: jarak ? C.statistik(jarak, S.mask) : null };
        slot.info.catatan = 'Garis dikonversi ke jarak Euclidean (km)';
        return;
      }
      if (geom === 'Point') {
        if (key === 'fasilitas' || key === 'hotspot') return; // diproses terpisah
        const ada = new Uint8Array(S.grid.n);
        fc.features.forEach(f => { const t = C.normalisasiTitik(f); if (t) { const i = C.indeksSel(S.grid, t.lon, t.lat); if (i >= 0) ada[i] = 1; } });
        S.lapis[key] = { nilai: new Float32Array(S.grid.n).fill(NaN), kategori: null, adaFitur: ada, jenis: 'titik' };
        return;
      }
      const idx = C.rasterisasiFitur(fc.features, S.grid);
      const field = fieldUntuk(key, fc);
      slot.field = field;
      const v = C.nilaiVektorKeGrid(idx, fc.features, field);
      S.lapis[key] = Object.assign(v, { jenis: 'vektor', idx, stat: C.statistik(v.nilai, S.mask) });
    } catch (e) {
      slot.status = 'gagal'; slot.pesan = e.message;
      console.warn('Gridkan ' + key, e);
    }
  }

  /* --------------------------------------------------------- titik api */
  function siapkanHotspot() {
    S.hotspotSemua = []; S.hotspotDiLuar = 0; S.hotspotTanpaTanggal = 0;
    const slot = S.slot.hotspot;
    if (!slot || slot.status !== 'ok' || slot.data.tipe !== 'vektor') return;
    for (const f of slot.data.fc.features) {
      const h = C.normalisasiHotspot(f);
      if (!h) continue;
      const idx = C.indeksSel(S.grid, h.lon, h.lat);
      if (idx < 0 || !S.mask[idx]) { S.hotspotDiLuar++; continue; }
      if (!h.tahun) S.hotspotTanpaTanggal++;
      h.idx = idx; h.zona = S.zona[idx];
      S.hotspotSemua.push(h);
    }
    const th = S.hotspotSemua.map(h => h.tahun).filter(Boolean);
    S.tahunData = th.length ? [Math.min(...th), Math.max(...th)] : null;
    slot.info.dalamWilayah = S.hotspotSemua.length;
    slot.info.luarWilayah = S.hotspotDiLuar;
    slot.info.tahun = S.tahunData;
  }
  function siapkanFasilitas() {
    S.fasilitas = [];
    const slot = S.slot.fasilitas;
    if (!slot || slot.status !== 'ok' || slot.data.tipe !== 'vektor') return;
    for (const f of slot.data.fc.features) {
      const t = C.normalisasiTitik(f);
      if (!t) continue;
      const idx = C.indeksSel(S.grid, t.lon, t.lat);
      if (idx < 0 || !S.mask[idx]) continue;
      t.idx = idx; t.zona = S.zona[idx]; t.feature = f;
      S.fasilitas.push(t);
    }
  }
  /** Titik api sesuai rentang tahun, bulan, dan confidence minimum. */
  KW.saringHotspot = function (tahun, bulan, confMin) {
    const cm = confMin === undefined ? KW.CFG.hotspot.confidenceMinimum : confMin;
    const b = bulan || [1, 12];
    return S.hotspotSemua.filter(h => h.tahun && h.tahun >= tahun[0] && h.tahun <= tahun[1]
      && h.bulan >= b[0] && h.bulan <= b[1] && (h.conf === null || h.conf >= cm));
  };
  KW.terapkanFilter = function () {
    S.hotspotTampil = KW.saringHotspot(S.filter.tahun, S.filter.bulan);
    KW.saatFilterBerubah && KW.saatFilterBerubah();
  };

  /* --------------------------------------------------------- pemodelan */
  function siapkanKerapatanModel() {
    const hs = KW.CFG.hotspot;
    const lat = KW.CFG.periode.pengembangan;
    const titik = KW.saringHotspot(lat, [1, 12]);
    const fileAda = S.lapis.kerapatan_kde;
    if ((hs.sumberKerapatanModel === 'hitung' && titik.length) || (!fileAda && titik.length)) {
      const per = C.hitungTitikPerSel(titik, S.grid, S.mask);
      const kd = C.kde(per.jumlah, S.grid, Number(hs.bandwidthKdeKm) || 5, S.mask);
      S.lapis._kerapatan = { nilai: kd, kategori: null, jenis: 'turunan', satuan: 'titik/km²', stat: C.statistik(kd, S.mask) };
      S.kerapatanInfo = { sumber: 'hitung', jumlahTitik: titik.length, periode: lat.slice(), bandwidth: Number(hs.bandwidthKdeKm) || 5 };
    } else if (fileAda) {
      S.lapis._kerapatan = Object.assign({}, fileAda);
      S.kerapatanInfo = { sumber: 'file', berkas: S.slot.kerapatan_kde.nama };
    } else {
      delete S.lapis._kerapatan;
      S.kerapatanInfo = { sumber: 'tidak ada' };
    }
  }

  KW.hitungModel = function () {
    if (!S.grid) return;
    siapkanKerapatanModel();
    S.skor = {}; S.rincian = {};
    const kelompok = KW.CFG.model.kelompok;
    for (const k of kelompok) {
      for (const p of k.parameter) {
        const lapis = S.lapis[p.slot];
        if (!lapis) continue;
        const aturan = Object.assign({}, p.aturan);
        const h = C.skorkan(lapis, S.mask, aturan);
        S.skor[p.id] = h.skor; S.rincian[p.id] = h.rincian;
      }
    }
    const m = C.hitungModel(S.grid, S.mask, S.skor, kelompok);
    const kcfg = KW.CFG.model.kelas;
    const batas = C.batasKelas(m.indeks, S.mask, kcfg.metode, kcfg.batas);
    if (kcfg.metode !== 'manual') kcfg.batas = batas.map(v => Math.round(v * 1000) / 1000);
    const kelas = C.klasifikasi(m.indeks, batas);
    const luasKelas = C.luasPerKelas(S.grid, kelas, 5);
    const zonaKelas = S.adaZona ? C.luasZonaKelas(S.grid, S.zona, kelas, S.namaZona.length, 5) : null;
    let luasTotal = 0; for (let i = 0; i < S.grid.n; i++) if (S.mask[i]) luasTotal += C.luasSel(S.grid, i);
    S.hasil = Object.assign(m, { batas, kelas, luasKelas, zonaKelas, luasStudiHa: luasTotal, waktu: new Date() });
    hitungDampak();
    hitungValidasi();
    S.versi++;
  };

  function hitungDampak() {
    const T = KW.CFG.model.kelas.kelasTinggiMulai;
    const lap = {};
        const g = (S.lapis.gambut_dampak && S.lapis.gambut_dampak.adaFitur) ? S.lapis.gambut_dampak : S.lapis.gambut;
    if (g && g.adaFitur) {
      lap.gambut = new Uint8Array(S.grid.n);
      const bukan = g.kategori ? g.kategori.map(t => /non|bukan|mineral|tidak/i.test(t)) : null;
      for (let i = 0; i < S.grid.n; i++) {
        if (!g.adaFitur[i] || !S.mask[i]) continue;
        if (bukan && Number.isFinite(g.nilai[i]) && bukan[g.nilai[i]]) continue;
        lap.gambut[i] = 1;
      }
    }
        const kunciHutan = (S.lapis.hutan_dampak && S.lapis.hutan_dampak.idx) ? 'hutan_dampak' : 'kawasan_hutan';
    const h = S.lapis[kunciHutan];
    if (h && h.idx && S.slot[kunciHutan].data.tipe === 'vektor') {
      lap.hutanIdx = h.idx;
      const fc = S.slot[kunciHutan].data.fc, field = S.slot[kunciHutan].field;
      lap.hutanKategori = fc.features.map(f => field ? String((f.properties || {})[field] ?? 'Tanpa keterangan') : 'Kawasan hutan');
    }
    const tl = S.lapis.tutupan_lahan;
    const pTl = KW.cariParameter('tutupan_lahan');
    if (tl && pTl && pTl.label) {
      const kode = Object.keys(pTl.label).filter(k => /permukiman|pemukiman|terbangun|built|lahan terbangun/i.test(pTl.label[k])).map(Number);
      if (kode.length) {
        lap.permukiman = new Uint8Array(S.grid.n);
        for (let i = 0; i < S.grid.n; i++) if (kode.includes(Math.round(tl.nilai[i]))) lap.permukiman[i] = 1;
      }
    }
    if (S.lapis.penduduk) lap.penduduk = S.lapis.penduduk.nilai;
    if (S.lapis.area_terbakar) lap.terbakar = S.lapis.area_terbakar.adaFitur;
    const nZ = S.namaZona.length;
    S.dampak = C.analisisDampak(S.grid, S.hasil.kelas, S.adaZona ? S.zona : null, nZ, lap, T, S.fasilitas.length ? S.fasilitas : null);
    S.dampak.ada = { gambut: !!lap.gambut, hutan: !!lap.hutanIdx, permukiman: !!lap.permukiman, penduduk: !!lap.penduduk,
      terbakar: !!lap.terbakar, fasilitas: S.fasilitas.length > 0 };
    S.lapisDampak = lap;

    // indeks prioritas per kab/kota
    S.prioritas = null;
    if (S.adaZona && S.hasil.zonaKelas) {
      const lz = S.hasil.zonaKelas.luasZona;
      const latih = KW.saringHotspot(KW.CFG.periode.pengembangan, [1, 12]);
      const hitZ = new Array(nZ).fill(0); latih.forEach(t => { if (t.zona >= 0) hitZ[t.zona]++; });
      const ind = [
        { nama: '% luas bahaya tinggi', nilai: S.dampak.perZona.map((z, i) => lz[i] ? 100 * z.luasTinggi / lz[i] : NaN) },
        { nama: 'Kerapatan titik api ' + KW.CFG.periode.pengembangan.join('–') + ' (titik/100 km²)',
          nilai: hitZ.map((c, i) => (lz[i] && S.hotspotSemua.length) ? c / (lz[i] / 10000) : NaN) }
      ];
      if (lap.gambut) ind.push({ nama: '% luas gambut berbahaya tinggi', nilai: S.dampak.perZona.map((z, i) => lz[i] ? 100 * z.gambutTinggi / lz[i] : NaN) });
      const pr = C.indeksPrioritas(ind);
      S.prioritas = Object.assign(pr, { indikator: ind, hotspotLatih: hitZ });
    }
  }

  function hitungValidasi() {
    const per = KW.CFG.periode;
    const uji = KW.saringHotspot(per.pengujian, [1, 12]);
    const latih = KW.saringHotspot(per.pengembangan, [1, 12]);
    const hasil = { periodeUji: per.pengujian.slice(), periodeLatih: per.pengembangan.slice(), nUji: uji.length, nLatih: latih.length };
    const perSel = (titik) => { const a = new Float32Array(S.grid.n); titik.forEach(t => { a[t.idx]++; }); return a; };
    if (uji.length) {
      const ps = perSel(uji);
      const pos = Uint8Array.from(ps, v => v > 0 ? 1 : 0);
      hasil.roc = C.rocAuc(S.hasil.indeks, S.mask, pos);
      hasil.laju = C.kurvaLaju(S.grid, S.hasil.indeks, S.mask, ps);
      hasil.tabel = C.tabelKelasKejadian(S.grid, S.hasil.kelas, ps, 5);
      const T = KW.CFG.model.kelas.kelasTinggiMulai;
      const b = hasil.tabel.baris.filter(r => r.kelas >= T);
      hasil.persenKejadianTinggi = b.reduce((s, r) => s + r.persenKejadian, 0);
      hasil.persenLuasTinggi = b.reduce((s, r) => s + r.persenLuas, 0);
      hasil.status = 'tervalidasi';
    } else {
      hasil.status = 'belum';
    }
    if (latih.length) {
      const ps = perSel(latih);
      hasil.lajuLatih = C.kurvaLaju(S.grid, S.hasil.indeks, S.mask, ps);
      hasil.tabelLatih = C.tabelKelasKejadian(S.grid, S.hasil.kelas, ps, 5);
    }
    if (S.lapis.area_terbakar) {
      const pos = S.lapis.area_terbakar.adaFitur;
      hasil.rocTerbakar = C.rocAuc(S.hasil.indeks, S.mask, pos);
      const ps = Float32Array.from(pos);
      hasil.tabelTerbakar = C.tabelKelasKejadian(S.grid, S.hasil.kelas, ps, 5);
    }
    // catatan independensi
    hasil.catatan = [];
    if (S.kerapatanInfo && S.kerapatanInfo.sumber === 'file') {
      hasil.catatan.push('Kerapatan titik api diambil dari berkas KDE yang periodenya tidak tercatat di WebGIS. Pastikan berkas hanya dibentuk dari titik api ' + per.pengembangan.join('–') + '; bila memuat 2023–2025, pengujian tidak independen.');
    }
    if (S.hotspotTanpaTanggal) hasil.catatan.push(S.hotspotTanpaTanggal + ' titik api tidak memiliki tanggal sehingga tidak dipakai dalam validasi.');
    S.validasi = hasil;
  }

  KW.cariParameter = function (id) {
    for (const k of KW.CFG.model.kelompok) for (const p of k.parameter) if (p.id === id) return p;
    return null;
  };

  /* --------------------------------------------------------- alur utama */
  KW.prosesSemua = async function () {
    KW.memuat('Menyiapkan grid analisis…'); await jeda();
    Object.keys(KW.CFG.data).forEach(k => { if (k !== 'batas' && k !== 'hotspot') gridkanSlot(k); });
    siapkanHotspot(); siapkanFasilitas();
    KW.memuat('Menghitung model bahaya…'); await jeda();
    KW.hitungModel();
    KW.terapkanFilter();
    S.siap = true;
    KW.memuat(null);
    KW.segarkanSemua && KW.segarkanSemua();
  };

  KW.muatUlangSemua = async function () {
    KW.memuat('Memuat batas wilayah…'); await jeda();
    const b = KW.CFG.data.batas;
    if (b.file) await muatSlot('batas', b.file); else S.slot.batas = { status: 'kosong', pesan: 'Belum ada berkas' };
    siapkanGrid();
    KW.siapkanPetaWilayah && KW.siapkanPetaWilayah();
    KW.memuat('Memuat parameter, titik api, dan data dampak…');
    const kunci = Object.keys(KW.CFG.data).filter(k => k !== 'batas');
    await Promise.all(kunci.map(k => {
      const f = KW.CFG.data[k].file;
      if (f) return muatSlot(k, f);
      S.slot[k] = { status: 'kosong', pesan: 'Belum ada berkas di konfigurasi' };
      return Promise.resolve();
    }));
    await KW.prosesSemua();
    const ok = Object.values(S.slot).filter(s => s.status === 'ok').length;
    KW.notifikasi(ok + ' dari ' + Object.keys(KW.CFG.data).length + ' data berhasil dimuat', ok ? 'ok' : 'galat');
  };

  /** Unggahan pengguna ke slot tertentu. */
  KW.unggah = async function (key, file) {
    KW.memuat('Membaca ' + file.name + '…'); await jeda();
    await muatSlot(key, file);
    if (S.slot[key].status !== 'ok') { KW.memuat(null); KW.notifikasi('Gagal memuat ' + file.name + ': ' + S.slot[key].pesan, 'galat'); return; }
    if (key === 'batas') {
      siapkanGrid();
      KW.siapkanPetaWilayah && KW.siapkanPetaWilayah();
      // raster perlu dibaca ulang terhadap grid baru (hanya yang berasal dari folder)
      for (const k of Object.keys(S.slot)) {
        const s = S.slot[k];
        if (k !== 'batas' && s.status === 'ok' && s.data.tipe === 'raster' && s.sumber === 'folder') await muatSlot(k, KW.CFG.data[k].file);
      }
    }
    await KW.prosesSemua();
    KW.notifikasi(file.name + ' dimuat ke slot "' + infoSlot(key).label + '"', 'ok');
  };

  /** Ganti field atribut slot vektor lalu hitung ulang. */
  KW.gantiField = async function (key, field) {
    KW.CFG.data[key][key === 'batas' ? 'fieldNama' : 'field'] = field || 'auto';
    if (key === 'batas') { siapkanGrid(); KW.siapkanPetaWilayah && KW.siapkanPetaWilayah(); }
    await KW.prosesSemua();
  };

  KW.mulai = async function () {
    KW.inisialisasiPeta && KW.inisialisasiPeta();
    KW.inisialisasiPanel && KW.inisialisasiPanel();
    if (location.protocol === 'file:') {
      KW.notifikasi('Buka WebGIS melalui server lokal (mis. VS Code Live Server atau "python -m http.server"), bukan dengan klik ganda file. Data di folder data/ tidak bisa dibaca dari file://. Fitur unggah tetap berfungsi.', 'galat');
    }
    await KW.muatUlangSemua();
  };
})();

KW.layerSlopeTiles = null;
KW.tampilkanSlopeTiles = function () {
  const cfg = KW.CFG.visualisasi.slopeTiles;
  if (!cfg || !cfg.aktif) return;
  if (!KW.layerSlopeTiles) {
    KW.layerSlopeTiles = L.tileLayer(cfg.url, {
      minZoom: cfg.minZoom,
      maxZoom: cfg.maxZoom,
      opacity: cfg.opacity,
      attribution: cfg.attribution,
      crossOrigin: true
    });
  }
  return KW.layerSlopeTiles;
};
