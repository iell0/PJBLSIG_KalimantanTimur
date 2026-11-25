/* =============================================================================
 * Unduh hasil: CSV, GeoJSON, GeoTIFF, PNG, PDF, dan JSON pengaturan model
 * ===========================================================================*/
(function () {
  'use strict';
  const KW = window.KW, C = window.KarhutlaCore, S = KW.S;
  const URL_HTML2CANVAS = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  const URL_JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';

  function unduh(nama, isi, mime) {
    const blob = isi instanceof Blob ? isi : new Blob([isi], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nama;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  KW.unduh = unduh;
  function muatSkrip(url) {
    return new Promise((ok, gagal) => {
      const s = document.createElement('script'); s.src = url; s.onload = ok;
      s.onerror = () => gagal(new Error('Gagal memuat ' + url)); document.head.appendChild(s);
    });
  }
  const tgl = () => new Date().toISOString().slice(0, 10);
  const r2 = (v) => Number.isFinite(v) ? Math.round(v * 100) / 100 : '';
  const r4 = (v) => Number.isFinite(v) ? Math.round(v * 10000) / 10000 : '';
  const perlu = (cond, pesan) => { if (!cond) { KW.notifikasi(pesan, 'galat'); return false; } return true; };

  /* ------------------------------------------------------------ CSV */
  function csvTahunan() {
    if (!perlu(S.hotspotSemua.length, 'Belum ada data titik api')) return;
    const P = KW.CFG.periode;
    const th = S.hotspotSemua.map(h => h.tahun).filter(Boolean);
    const a = Math.min(...th), b = Math.max(...th);
    const semua = KW.saringHotspot([a, b], S.filter.bulan);
    const baris = [];
    for (let y = a; y <= b; y++) {
      const t = semua.filter(h => h.tahun === y);
      const frp = t.map(h => h.frp).filter(Number.isFinite);
      baris.push({
        tahun: y, jumlah_titik_api: t.length,
        periode: y >= P.pengujian[0] && y <= P.pengujian[1] ? 'pengujian' : y >= P.pengembangan[0] && y <= P.pengembangan[1] ? 'pengembangan' : y >= P.historis[0] && y <= P.historis[1] ? 'historis' : 'lain',
        frp_total_MW: r2(frp.reduce((s, v) => s + v, 0)), frp_rerata_MW: frp.length ? r2(frp.reduce((s, v) => s + v, 0) / frp.length) : '',
        frp_maks_MW: frp.length ? r2(Math.max(...frp)) : ''
      });
    }
    const kol = ['tahun', 'periode', 'jumlah_titik_api', 'frp_total_MW', 'frp_rerata_MW', 'frp_maks_MW'];
    unduh(`statistik_titik_api_per_tahun_${tgl()}.csv`, '﻿' + C.keCSV(baris, kol), 'text/csv');
  }
  function barisZona() {
    const kc = KW.CFG.model.kelas, d = S.dampak, pr = S.prioritas, P = KW.CFG.periode;
    const lz = S.hasil.zonaKelas.luasZona, m = S.hasil.zonaKelas.matriks;
    return S.namaZona.map((n, z) => {
      const o = { kab_kota: n, luas_ha: lz[z] };
      kc.nama.forEach((k, i) => { o['luas_' + k.toLowerCase().replace(/ /g, '_') + '_ha'] = m[z][i]; });
      o.persen_bahaya_tinggi = lz[z] ? 100 * d.perZona[z].luasTinggi / lz[z] : '';
      if (d.ada.gambut) o.gambut_bahaya_tinggi_ha = d.perZona[z].gambutTinggi;
      if (d.ada.hutan) o.kawasan_hutan_bahaya_tinggi_ha = d.perZona[z].hutanTinggi;
      if (d.ada.permukiman) o.permukiman_bahaya_tinggi_ha = d.perZona[z].permukimanTinggi;
      if (d.ada.fasilitas) o.fasilitas_bahaya_tinggi = d.perZona[z].fasilitasTinggi;
      if (d.ada.penduduk) o.penduduk_bahaya_tinggi = d.perZona[z].pendudukTinggi;
      if (d.ada.terbakar) o.area_terbakar_aktual_ha = d.perZona[z].terbakar;
      o['titik_api_' + P.pengembangan.join('_')] = KW.saringHotspot(P.pengembangan, [1, 12]).filter(h => h.zona === z).length;
      o['titik_api_' + P.pengujian.join('_')] = KW.saringHotspot(P.pengujian, [1, 12]).filter(h => h.zona === z).length;
      o['titik_api_tampilan_' + S.filter.tahun.join('_')] = S.hotspotTampil.filter(h => h.zona === z).length;
      if (pr) { o.indeks_prioritas = r4(pr.skor[z]); o.peringkat_prioritas = pr.peringkat[z]; o.tingkat_prioritas = pr.tingkat[z]; }
      Object.keys(o).forEach(k => { if (typeof o[k] === 'number' && !Number.isInteger(o[k]) && k !== 'indeks_prioritas') o[k] = r2(o[k]); });
      return o;
    });
  }
  function csvZona() {
    if (!perlu(S.hasil && S.hasil.zonaKelas, 'Statistik per kab/kota membutuhkan batas kab/kota dan hasil model')) return;
    const b = barisZona();
    unduh(`statistik_kab_kota_bahaya_dampak_${tgl()}.csv`, '﻿' + C.keCSV(b, Object.keys(b[0])), 'text/csv');
  }
  function barisTitik() {
    const kc = KW.CFG.model.kelas;
    return S.hotspotTampil.map(h => ({
      tanggal: h.tanggal, jam_utc: h.jam || '', latitude: h.lat, longitude: h.lon, satelit: h.satelit || '', instrumen: h.instrumen || '',
      confidence: h.confAsli === null ? '' : h.confAsli, frp_MW: Number.isFinite(h.frp) ? h.frp : '',
      bright_ti4_K: r2(h.brightness), bright_ti5_K: r2(h.brightness2),
      siang_malam: h.siangMalam || '', kab_kota: h.zona >= 0 ? S.namaZona[h.zona] : '',
      kelas_bahaya: S.hasil && S.hasil.kelas[h.idx] ? kc.nama[S.hasil.kelas[h.idx] - 1] : '',
      indeks_bahaya: S.hasil && Number.isFinite(S.hasil.indeks[h.idx]) ? Math.round(S.hasil.indeks[h.idx] * 1000) / 1000 : ''
    }));
  }
  function csvTitik() {
    if (!perlu(S.hotspotTampil.length, 'Tidak ada titik api pada periode tampilan')) return;
    const b = barisTitik();
    unduh(`titik_api_${S.filter.tahun.join('_')}_${tgl()}.csv`, '﻿' + C.keCSV(b, Object.keys(b[0])), 'text/csv');
  }

  /* -------------------------------------------------------- GeoJSON */
  function geojsonTitik() {
    if (!perlu(S.hotspotTampil.length, 'Tidak ada titik api pada periode tampilan')) return;
    const b = barisTitik();
    const fc = { type: 'FeatureCollection', features: S.hotspotTampil.map((h, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [h.lon, h.lat] }, properties: b[i] })) };
    unduh(`titik_api_${S.filter.tahun.join('_')}_${tgl()}.geojson`, JSON.stringify(fc), 'application/geo+json');
  }
  function geojsonZona() {
    if (!perlu(S.fiturBatas && S.hasil && S.hasil.zonaKelas, 'Butuh batas kab/kota dan hasil model')) return;
    const b = barisZona();
    const fc = { type: 'FeatureCollection', features: S.fiturBatas.map((f, z) => ({ type: 'Feature', geometry: f.geometry, properties: b[z] })) };
    unduh(`kab_kota_bahaya_dampak_prioritas_${tgl()}.geojson`, JSON.stringify(fc), 'application/geo+json');
  }

  /* -------------------------------------------------------- GeoTIFF */
  function tiffIndeks() {
    if (!perlu(S.hasil && S.hasil.selValid, 'Model belum dihitung')) return;
    unduh(`indeks_bahaya_karhutla_kaltim_${tgl()}.tif`, new Blob([C.tulisGeoTIFF(S.grid, S.hasil.indeks, 'float32', -9999)], { type: 'image/tiff' }));
  }
  function tiffKelas() {
    if (!perlu(S.hasil && S.hasil.selValid, 'Model belum dihitung')) return;
    unduh(`kelas_bahaya_karhutla_kaltim_${tgl()}.tif`, new Blob([C.tulisGeoTIFF(S.grid, S.hasil.kelas, 'uint8', 0)], { type: 'image/tiff' }));
  }

  /* ------------------------------------------------------------ PNG */
  async function gambarPeta() {
    if (!window.html2canvas) await muatSkrip(URL_HTML2CANVAS);
    const el = document.getElementById('map');
    return window.html2canvas(el, { useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false,
      ignoreElements: (n) => n.classList && (n.classList.contains('leaflet-control-zoom') || n.classList.contains('tombol-home') || n.classList.contains('leaflet-control-layers')) });
  }
  async function png() {
    KW.memuat('Membuat gambar peta…');
    try {
      const cv = await gambarPeta();
      cv.toBlob(b => unduh(`peta_webgis_karhutla_${tgl()}.png`, b), 'image/png');
    } catch (e) {
      KW.notifikasi('Gagal membuat PNG (' + e.message + '). Alternatif: tangkapan layar sistem operasi.', 'galat');
    }
    KW.memuat(null);
  }

  /* ------------------------------------------------------------ PDF */
  const asci = (s) => String(s).replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/λ/g, 'lambda ').replace(/∩/g, 'irisan').replace(/[–—]/g, '-')
    .replace(/²/g, '2').replace(/[₂]/g, '2').replace(/[₄]/g, '4').replace(/·/g, '-').replace(/[^\x00-\xFF]/g, '');
  async function pdf() {
    if (!perlu(S.hasil, 'Model belum dihitung')) return;
    KW.memuat('Menyusun laporan PDF…');
    try {
      if (!window.jspdf) await muatSkrip(URL_JSPDF);
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      const A = KW.angka, kc = KW.CFG.model.kelas, W = 210, M = 14;
      let y = 16;
      const teks = (t, ukuran, tebal, warna) => {
        doc.setFont('helvetica', tebal ? 'bold' : 'normal'); doc.setFontSize(ukuran || 10); doc.setTextColor(warna || '#111827');
        const baris = doc.splitTextToSize(asci(t), W - 2 * M);
        baris.forEach(b => { if (y > 282) { doc.addPage(); y = 16; } doc.text(b, M, y); y += (ukuran || 10) * 0.45; });
        y += 1.5;
      };
      const tabel = (kepala, isi, lebar) => {
        doc.setFontSize(8.5);
        const tulisBaris = (sel, tebal) => {
          if (y > 280) { doc.addPage(); y = 16; }
          doc.setFont('helvetica', tebal ? 'bold' : 'normal');
          let x = M; sel.forEach((c, i) => { doc.text(asci(c).slice(0, 48), x, y); x += lebar[i]; });
          y += 4.6;
        };
        tulisBaris(kepala, true);
        doc.setDrawColor('#9ca3af'); doc.line(M, y - 3.4, W - M, y - 3.4);
        isi.forEach(r => tulisBaris(r, false));
        y += 2;
      };
      teks(KW.CFG.aplikasi.nama, 14, true, '#9a3412');
      teks(KW.CFG.aplikasi.subjudul, 10);
      teks(KW.CFG.aplikasi.identitas.join(' | ') + ' | Dicetak ' + new Date().toLocaleString('id-ID'), 8.5, false, '#4b5563');
      try {
        const cv = await gambarPeta();
        const img = cv.toDataURL('image/jpeg', 0.85);
        const h = (W - 2 * M) * cv.height / cv.width;
        doc.addImage(img, 'JPEG', M, y, W - 2 * M, Math.min(h, 120)); y += Math.min(h, 120) + 4;
      } catch (e) { teks('(Gambar peta tidak dapat dibuat: ' + e.message + ')', 8.5, false, '#6b7280'); }
      teks('Ringkasan', 12, true);
      const T = kc.kelasTinggiMulai;
      const tinggi = S.hasil.luasKelas.slice(T - 1).reduce((a, b) => a + b, 0);
      teks(`Titik api pada periode tampilan ${S.filter.tahun.join('-')}: ${A(S.hotspotTampil.length)} titik (total di wilayah studi ${A(S.hotspotSemua.length)}).`, 9.5);
      teks(`Luas bahaya tinggi (${kc.nama.slice(T - 1).join(' + ')}): ${A(tinggi)} ha (${A(100 * tinggi / S.hasil.luasStudiHa, 1)}% wilayah studi).`, 9.5);
      const v = S.validasi;
      teks(v && v.status === 'tervalidasi' ? `Validasi terhadap titik api ${v.periodeUji.join('-')} (${A(v.nUji)} titik): AUC = ${A(v.roc.auc, 3)}; ${A(v.persenKejadianTinggi, 1)}% titik api uji berada di kelas bahaya tinggi yang meliputi ${A(v.persenLuasTinggi, 1)}% luas.`
        : `Validasi: belum divalidasi (titik api periode ${KW.CFG.periode.pengujian.join('-')} belum tersedia).`, 9.5);
      teks('Pembobotan kelompok parameter', 12, true);
      const tot = KW.CFG.model.kelompok.reduce((s, k) => s + Number(k.bobot), 0) || 1;
      tabel(['Kelompok', 'Bobot', 'Status data'], KW.CFG.model.kelompok.map(k => [k.nama, A(100 * k.bobot / tot, 1) + '%', S.hasil.kelompokTanpaData.includes(k.id) ? 'tidak ada data' : 'dipakai']), [90, 30, 60]);
      teks('Luas per kelas bahaya', 12, true);
      tabel(['Kelas', 'Rentang indeks', 'Luas (ha)', '%'], kc.nama.map((n, i) => [n, (i === 0 ? '1,00' : A(S.hasil.batas[i - 1], 2)) + ' - ' + (i === 4 ? '5,00' : A(S.hasil.batas[i], 2)), A(S.hasil.luasKelas[i]), A(100 * S.hasil.luasKelas[i] / S.hasil.luasStudiHa, 1)]), [50, 45, 45, 30]);
      if (S.prioritas) {
        teks('Prioritas mitigasi per kabupaten/kota', 12, true);
        const lz = S.hasil.zonaKelas.luasZona, pr = S.prioritas;
        const urut = pr.peringkat.map((r, z) => ({ r, z })).filter(o => o.r).sort((a, b) => a.r - b.r);
        tabel(['#', 'Kab/Kota', 'Bahaya tinggi (ha)', '% luas', 'Tingkat'], urut.map(({ r, z }) => [String(r), S.namaZona[z], A(S.dampak.perZona[z].luasTinggi), A(100 * S.dampak.perZona[z].luasTinggi / lz[z], 1), pr.tingkat[z]]), [10, 55, 40, 25, 40]);
      }
      const grafikAda = ['ch-kelas', 'ch-tahun', 'ch-roc'].map(id => KW.grafik[id]).filter(g => g && g.width > 50);
      for (const g of grafikAda) {
        const img = g.toBase64Image('image/png', 1);
        const w = W - 2 * M, h = w * g.height / g.width;
        if (y + h > 282) { doc.addPage(); y = 16; }
        doc.setFillColor('#0f172a'); doc.rect(M, y, w, h, 'F');
        doc.addImage(img, 'PNG', M, y, w, h); y += h + 4;
      }
      teks('Catatan: angka dihitung di WebGIS dari data yang dimuat pada saat cetak. Lihat tab Metodologi untuk asumsi, sumber data, dan keterbatasan.', 8, false, '#4b5563');
      doc.save(`laporan_ringkas_webgis_karhutla_${tgl()}.pdf`);
    } catch (e) {
      KW.notifikasi('Gagal membuat PDF: ' + e.message, 'galat');
    }
    KW.memuat(null);
  }

  /* -------------------------------------------------- JSON pengaturan */
  KW.unduhPengaturan = function () {
    const j = { dibuat: new Date().toISOString(), aplikasi: KW.CFG.aplikasi.nama, model: KW.CFG.model, periode: KW.CFG.periode, hotspot: KW.CFG.hotspot };
    unduh(`pengaturan_model_karhutla_${tgl()}.json`, JSON.stringify(j, null, 2), 'application/json');
  };

  document.addEventListener('DOMContentLoaded', () => {
    const ikat = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    ikat('ekspor-csv-tahun', csvTahunan);
    ikat('ekspor-csv-zona', csvZona);
    ikat('ekspor-csv-titik', csvTitik);
    ikat('ekspor-geojson-titik', geojsonTitik);
    ikat('ekspor-geojson-zona', geojsonZona);
    ikat('ekspor-tif-indeks', tiffIndeks);
    ikat('ekspor-tif-kelas', tiffKelas);
    ikat('ekspor-png', png);
    ikat('ekspor-pdf', pdf);
    ikat('ekspor-json', KW.unduhPengaturan);
  });
})();
