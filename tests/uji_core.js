/* Uji unit modul analisis (jalankan: node tests/uji_core.js) */
const C = require('../js/core.js');
const fs = require('fs');
const path = require('path');
let lulus = 0, gagal = 0;
function cek(nama, kondisi, info) {
  if (kondisi) { lulus++; } else { gagal++; console.log('GAGAL:', nama, info !== undefined ? info : ''); }
}
const dekat = (a, b, tol) => Math.abs(a - b) <= tol;

/* 1. Grid & luas sel */
{
  const g = C.buatGrid([0, 0, 1, 1], 0.01);
  cek('grid ukuran', g.ncols === 100 && g.nrows === 100, [g.ncols, g.nrows]);
  let total = 0; for (let r = 0; r < g.nrows; r++) total += g.luasSelHa[r] * g.ncols;
  cek('luas 1°x1° di ekuator ≈ 12.364 km²', dekat(total / 100, 12363.6, 2), total / 100);
  cek('indeksSel', C.indeksSel(g, 0.005, 0.995) === 0 && C.indeksSel(g, 0.995, 0.005) === g.n - 1);
  cek('indeksSel di luar', C.indeksSel(g, 1.5, 0.5) === -1);
}

/* 2. UTM */
{
  const f = C.transformasiKe(32650);
  const p = f(117, 0);
  cek('UTM 50N meridian tengah di ekuator', dekat(p[0], 500000, 1e-6) && dekat(p[1], 0, 1e-6), p);
  const s = C.transformasiKe(32750)(117, 0);
  cek('UTM 50S northing palsu', dekat(s[1], 10000000, 1e-6), s);
  for (const [lon, lat, epsg] of [[116.3, -1.2, 32750], [118.9, 2.4, 32650], [114.1, 0.7, 32650], [-74.006, 40.7128, 32618]]) {
    const q = C.transformasiKe(epsg)(lon, lat);
    const b = C.transformasiDari(epsg)(q[0], q[1]);
    cek('UTM bolak-balik ' + epsg, dekat(b[0], lon, 1e-7) && dekat(b[1], lat, 1e-7), [lon, lat, b]);
  }
  // Satu derajat lintang dekat ekuator ≈ 110.574 km (WGS84) × k0
  const a = C.transformasiKe(32650)(117, 0), b2 = C.transformasiKe(32650)(117, 1);
  cek('UTM skala meridian', dekat(b2[1] - a[1], 110574.4 * 0.9996, 30), b2[1] - a[1]);
  const m = C.transformasiKe(3857)(180, 0);
  cek('Web Mercator', dekat(m[0], 20037508.34, 0.01));
}

/* 3. Rasterisasi poligon */
{
  const g = C.buatGrid([-0.5, -0.5, 1.5, 1.5], 0.1);
  const kotak = { type: 'Feature', properties: { skor: 4 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } };
  const idx = C.rasterisasiFitur([kotak], g);
  const n = idx.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0);
  cek('poligon kotak 1x1 = 100 sel', n === 100, n);
  const berlubang = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
    [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [[0.2, 0.2], [0.2, 0.8], [0.8, 0.8], [0.8, 0.2], [0.2, 0.2]]] } };
  const idx2 = C.rasterisasiFitur([berlubang], g);
  const n2 = idx2.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0);
  cek('poligon berlubang = 100 - 36 sel', n2 === 64, n2);
  const multi = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [
    [[[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5], [0, 0]]], [[[1, 1], [1.4, 1], [1.4, 1.4], [1, 1.4], [1, 1]]]] } };
  const idx3 = C.rasterisasiFitur([multi], g);
  cek('multipoligon = 25 + 16 sel', idx3.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0) === 41);
  const kecil = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0.51, 0.51], [0.52, 0.51], [0.52, 0.52], [0.51, 0.51]]] } };
  const idx4 = C.rasterisasiFitur([kecil], g);
  cek('poligon kecil tetap menandai 1 sel', idx4.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0) === 1);
  // segitiga: luas 0.5 -> ±50 sel
  const seg = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } };
  const n5 = C.rasterisasiFitur([seg], g).reduce((s, v) => s + (v >= 0 ? 1 : 0), 0);
  cek('segitiga ≈ 50 sel', Math.abs(n5 - 50) <= 6, n5);
  // garis
  const gr = C.rasterisasiGaris([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0.01, 0.05], [0.99, 0.05]] } }], g);
  cek('garis horizontal 1° = 10 sel', gr.reduce((s, v) => s + (v >= 0 ? 1 : 0), 0) === 10);
}

/* 4. Resampling */
{
  const g = C.buatGrid([116, -1, 117, 0], 0.01);
  // raster 4326 identik dengan grid
  const w = 100, h = 100, val = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) val[r * w + c] = r * 1000 + c;
  const out = C.resampleRaster({ nilai: val, lebar: w, tinggi: h, bbox: [116, -1, 117, 0], epsg: 4326, noData: -9999 }, g, null, { metode: 'terdekat' });
  let ok = true; for (let i = 0; i < g.n; i++) if (out[i] !== val[i]) { ok = false; break; }
  cek('resampling identitas (terdekat)', ok);
  // raster UTM 50S dengan f = lon + 10*lat
  const fwd = C.transformasiKe(32750), inv = C.transformasiDari(32750);
  const pA = fwd(115.95, -1.05), pB = fwd(117.05, 0.05);
  const x0 = Math.min(pA[0], pB[0]), x1 = Math.max(pA[0], pB[0]), y0 = Math.min(pA[1], pB[1]), y1 = Math.max(pA[1], pB[1]);
  const W = 400, H = 400, v2 = new Float32Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const x = x0 + (c + 0.5) * (x1 - x0) / W, y = y1 - (r + 0.5) * (y1 - y0) / H;
    const ll = inv(x, y); v2[r * W + c] = ll[0] + 10 * ll[1];
  }
  const out2 = C.resampleRaster({ nilai: v2, lebar: W, tinggi: H, bbox: [x0, y0, x1, y1], epsg: 32750, noData: null }, g, null, { metode: 'bilinear' });
  let maxErr = 0;
  for (let i = 0; i < g.n; i++) { const [lon, lat] = C.pusatSel(g, i); maxErr = Math.max(maxErr, Math.abs(out2[i] - (lon + 10 * lat))); }
  cek('resampling UTM->4326 bilinear akurat', maxErr < 0.01, maxErr);
  // rata-rata blok dari raster halus
  const W3 = 1000, H3 = 1000, v3 = new Float32Array(W3 * H3);
  for (let i = 0; i < v3.length; i++) v3[i] = (i % 2) ? 10 : 0;
  const out3 = C.resampleRaster({ nilai: v3, lebar: W3, tinggi: H3, bbox: [116, -1, 117, 0], epsg: 4326, noData: null }, g, null, { metode: 'auto' });
  const st3 = C.statistik(out3);
  cek('resampling rata-rata blok ≈ 5', Math.abs(st3.rerata - 5) < 0.6, st3);
  // noData
  const v4 = new Float32Array(100 * 100).fill(-9999);
  const out4 = C.resampleRaster({ nilai: v4, lebar: 100, tinggi: 100, bbox: [116, -1, 117, 0], epsg: 4326, noData: -9999 }, g, null, {});
  cek('noData -> NaN', C.statistik(out4).n === 0);
}

/* 5. Skoring */
{
  const nilai = Float32Array.from([10, 22, 27, 31, 40, NaN]);
  const s = C.skorkan({ nilai, kategori: null }, null, { metode: 'ambang', arah: 'naik', batas: [20, 25, 30, 35] }).skor;
  cek('ambang naik (LST Simarmata)', [1, 2, 3, 4, 5].every((v, i) => s[i] === v) && Number.isNaN(s[5]), Array.from(s));
  const t = C.skorkan({ nilai, kategori: null }, null, { metode: 'ambang', arah: 'turun', batas: [20, 25, 30, 35] }).skor;
  cek('ambang turun', [5, 4, 3, 2, 1].every((v, i) => t[i] === v), Array.from(t));
  const seq = new Float32Array(1000); for (let i = 0; i < 1000; i++) seq[i] = i;
  const q = C.skorkan({ nilai: seq, kategori: null }, null, { metode: 'kuantil', arah: 'naik' }).skor;
  const hit = [0, 0, 0, 0, 0, 0]; q.forEach(v => hit[v]++);
  cek('kuantil ±200 per kelas', hit.slice(1).every(h => Math.abs(h - 200) <= 2), hit);
  const kat = C.skorkan({ nilai: Float32Array.from([1, 2, 3, 9]), kategori: null }, null, { metode: 'kategori', peta: { 1: 2, 2: 5, 3: 4 } }).skor;
  cek('kategori', kat[0] === 2 && kat[1] === 5 && kat[2] === 4 && Number.isNaN(kat[3]));
  const teks = C.skorkan({ nilai: Float32Array.from([0, 1, 2, NaN]), kategori: ['Hutan Lindung', 'APL', 'Hutan Produksi'] }, null,
    { kataKunci: [{ pola: 'lindung', skor: 2 }, { pola: 'APL', skor: 4 }], skorKategoriLain: 3 }).skor;
  cek('kategori teks + kata kunci', teks[0] === 2 && teks[1] === 4 && teks[2] === 3 && Number.isNaN(teks[3]));
  const oto = C.skorkan({ nilai: Float32Array.from([1, 3, 5]), kategori: null }, null, { metode: 'otomatis' });
  cek('otomatis -> langsung', oto.rincian.metode === 'langsung' && oto.skor[1] === 3);
  const ada = C.skorkan({ nilai: Float32Array.from([NaN, NaN, NaN]), kategori: null, adaFitur: Uint8Array.from([1, 0, 1]) }, null,
    { metode: 'otomatis', skorAda: 5, skorDiLuar: 1 }).skor;
  cek('keberadaan gambut', ada[0] === 5 && ada[1] === 1 && ada[2] === 5, Array.from(ada));
  const mask = Uint8Array.from([1, 0, 1, 1, 1, 1]);
  const sm = C.skorkan({ nilai, kategori: null }, mask, { metode: 'ambang', arah: 'naik', batas: [20, 25, 30, 35] }).skor;
  cek('mask dihormati', Number.isNaN(sm[1]));
}

/* 6. Model & klasifikasi */
{
  const g = C.buatGrid([0, 0, 0.03, 0.01], 0.01); // 3 sel
  const skor = { a: Float32Array.from([5, 1, 3]), b: Float32Array.from([1, 1, NaN]), c: Float32Array.from([3, 5, 2]) };
  const kel = [
    { id: 'K1', bobot: 60, parameter: [{ id: 'a', bobot: 1 }, { id: 'b', bobot: 1 }] },
    { id: 'K2', bobot: 40, parameter: [{ id: 'c', bobot: 1 }] },
    { id: 'K3', bobot: 10, parameter: [{ id: 'tidakada', bobot: 1 }] }
  ];
  const m = C.hitungModel(g, null, skor, kel);
  // sel0: K1=(5+1)/2=3, K2=3 -> (0.6*3+0.4*3)=3 ; sel1: K1=1,K2=5 -> 0.6+2=2.6 ; sel2: K1=3 (b NaN), K2=2 -> 1.8+0.8=2.6
  cek('model sel0', dekat(m.indeks[0], 3, 1e-6), m.indeks[0]);
  cek('model sel1', dekat(m.indeks[1], 2.6, 1e-6), m.indeks[1]);
  cek('model sel2 (parameter hilang dinormalisasi)', dekat(m.indeks[2], 2.6, 1e-6), m.indeks[2]);
  cek('kelompok tanpa data terlapor', m.kelompokTanpaData.includes('K3'));
  const k = C.klasifikasi(Float32Array.from([1.0, 1.8, 1.81, 3.4, 4.3, NaN]), [1.8, 2.6, 3.4, 4.2]);
  cek('klasifikasi batas inklusif bawah', Array.from(k).join() === '1,1,2,3,5,0', Array.from(k));
}

/* 7. AHP */
{
  const r = C.ahp([[1, 2, 4], [0.5, 1, 2], [0.25, 0.5, 1]]);
  cek('AHP konsisten sempurna', dekat(r.bobot[0], 4 / 7, 1e-9) && dekat(r.lambdaMaks, 3, 1e-9) && dekat(r.CR, 0, 1e-9), r);
  const r2 = C.ahp([[1, 3, 5], [1 / 3, 1, 3], [1 / 5, 1 / 3, 1]]);
  // nilai rujukan umum: w ≈ [0.637, 0.258, 0.105], λ ≈ 3.039, CR ≈ 0.033
  cek('AHP contoh Saaty', dekat(r2.bobot[0], 0.637, 0.002) && dekat(r2.lambdaMaks, 3.039, 0.002) && dekat(r2.CR, 0.033, 0.003), r2);
}

/* 8. ROC/AUC & kurva laju */
{
  const g = C.buatGrid([0, 0, 1, 0.1], 0.01); // 100x10
  const skor = new Float32Array(g.n), pos = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) { skor[i] = i; pos[i] = i >= g.n - 50 ? 1 : 0; }
  cek('AUC sempurna = 1', dekat(C.rocAuc(skor, null, pos).auc, 1, 1e-6));
  const inv = new Uint8Array(g.n); for (let i = 0; i < 50; i++) inv[i] = 1;
  cek('AUC terbalik = 0', dekat(C.rocAuc(skor, null, inv).auc, 0, 1e-6));
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const acak = new Uint8Array(g.n); for (let i = 0; i < g.n; i++) acak[i] = rnd() < 0.1 ? 1 : 0;
  const au = C.rocAuc(skor, null, acak).auc;
  cek('AUC acak ≈ 0.5', Math.abs(au - 0.5) < 0.08, au);
  const tps = new Float32Array(g.n); for (let i = g.n - 50; i < g.n; i++) tps[i] = 2;
  const kl = C.kurvaLaju(g, skor, null, tps);
  cek('kurva laju: 5% luas teratas memuat 100% kejadian', kl.kurva.some(([x, y]) => x <= 0.051 && y >= 0.999), kl.kurva.slice(0, 5));
  const kelas = C.klasifikasi(skor, [200, 400, 600, 800]);
  const tb = C.tabelKelasKejadian(g, kelas, tps);
  cek('tabel kelas: semua kejadian di kelas 5', tb.baris[4].kejadian === 100 && dekat(tb.baris[4].persenKejadian, 100, 1e-9));
  cek('rasio frekuensi kelas 5 = 5', dekat(tb.baris[4].rasioFrekuensi, 100 / tb.baris[4].persenLuas, 1e-9));
}

/* 9. KDE */
{
  const g = C.buatGrid([116, -1, 118, 1], 0.01);
  const titik = []; for (let i = 0; i < 100; i++) titik.push({ lon: 117 + (i % 10) * 0.01, lat: 0 + Math.floor(i / 10) * 0.01, frp: 10 });
  const ps = C.hitungTitikPerSel(titik, g, null);
  cek('titik per sel', ps.diDalam === 100 && ps.frpSum.reduce((s, v) => s + v, 0) === 1000);
  const d = C.kde(ps.jumlah, g, 5, null);
  let tot = 0; for (let i = 0; i < g.n; i++) tot += d[i] * C.luasSel(g, i) / 100;
  cek('KDE terintegrasi ≈ jumlah titik', dekat(tot, 100, 0.5), tot);
}

/* 10. Statistik zona, dampak, prioritas, emisi */
{
  const g = C.buatGrid([0, 0, 0.04, 0.01], 0.01); // 4 sel
  const kelas = Uint8Array.from([5, 4, 2, 1]);
  const zona = Int32Array.from([0, 0, 1, 1]);
  const lz = C.luasZonaKelas(g, zona, kelas, 2);
  const a = g.luasSelHa[0];
  cek('luas zona', dekat(lz.luasZona[0], 2 * a, 1e-6) && dekat(lz.matriks[0][4], a, 1e-6));
  const gambut = Uint8Array.from([1, 0, 1, 0]);
  const dm = C.analisisDampak(g, kelas, zona, 2, { gambut }, 4, [{ lon: 0.005, lat: 0.005 }, { lon: 0.035, lat: 0.005 }]);
  cek('dampak gambut tinggi', dekat(dm.total.gambutTinggi, a, 1e-6) && dekat(dm.total.gambutTotal, 2 * a, 1e-6));
  cek('dampak fasilitas', dm.total.fasilitasTinggi === 1 && dm.total.fasilitasTotal === 2);
  const pr = C.indeksPrioritas([{ nama: 'a', nilai: [10, 0, 5] }, { nama: 'b', nilai: [1, 0, NaN] }]);
  cek('prioritas peringkat', pr.peringkat[0] === 1 && pr.peringkat[1] === 3 && pr.tingkat[0] === 'Prioritas I', pr);
  cek('emisi IPCC', dekat(C.emisiKebakaran(100, 10, 1580), 1580, 1e-9) && C.emisiKebakaran(0, 1, 1) === null);
}

/* 11. CSV, tanggal, hotspot */
{
  const rows = C.parseCSV('latitude,longitude,acq_date,confidence,frp,note\n-0.5,116.9,2019-09-15,n,12.5,"a, b"\n0.1,117.2,15/08/2023,h,3,');
  cek('CSV', rows.length === 2 && rows[0].note === 'a, b' && rows[1].frp === '3');
  const h = C.normalisasiHotspot(rows[0]);
  cek('hotspot CSV', h.lon === 116.9 && h.tahun === 2019 && h.bulan === 9 && h.conf === 1 && h.frp === 12.5, h);
  const h2 = C.normalisasiHotspot(rows[1]);
  cek('tanggal dd/mm/yyyy', h2.tahun === 2023 && h2.bulan === 8 && h2.conf === 2);
  const f = { type: 'Feature', geometry: { type: 'Point', coordinates: [117, 0] }, properties: { ACQ_DATE: 1568505600000, CONFIDENCE: 85, FRP: '4,2' } };
  const h3 = C.normalisasiHotspot(f);
  cek('hotspot GeoJSON ms epoch', h3.tahun === 2019 && h3.conf === 2 && dekat(h3.frp, 4.2, 1e-9), h3);
  cek('tanggal yyyymmdd', C.parseTanggal(20150701).tahun === 2015);
  const csv = C.keCSV([{ a: 1, b: 'x,y' }], ['a', 'b']);
  cek('keCSV', csv === 'a,b\n1,"x,y"', csv);
}

/* 12. Deteksi field */
{
  const fs1 = [{ properties: { FID: 1, WADMKK: 'Paser' } }, { properties: { FID: 2, WADMKK: 'Berau' } }];
  cek('deteksi nama kab', C.deteksiField(fs1, C.KANDIDAT_FIELD.nama) === 'WADMKK');
  const fs2 = [{ properties: { fid: 1, Shape_Area: 3, kedalaman_m: 2.5 } }];
  cek('deteksi numerik', C.deteksiFieldNumerik(fs2) === 'kedalaman_m');
  const fs3 = [{ properties: { Kedalaman: 'Dalam' } }, { properties: { Kedalaman: 'Dangkal' } }];
  const idx = Int32Array.from([0, 1, -1]);
  const nv = C.nilaiVektorKeGrid(idx, fs3, 'Kedalaman');
  cek('vektor teks -> kategori', nv.kategori && nv.kategori.length === 2 && nv.nilai[1] === 1 && Number.isNaN(nv.nilai[2]));
}

/* 13. GeoTIFF writer -> dibaca ulang dengan tifffile (Python) */
{
  const g = C.buatGrid([116, -1, 116.05, -0.97], 0.01); // 5 x 3
  const v = new Float32Array(g.n); for (let i = 0; i < g.n; i++) v[i] = i + 0.5; v[3] = NaN;
  const buf = C.tulisGeoTIFF(g, v, 'float32', -9999);
  const fp = path.join(__dirname, '_uji_float.tif'); fs.writeFileSync(fp, Buffer.from(buf));
  const u = new Uint8Array(g.n); for (let i = 0; i < g.n; i++) u[i] = (i % 5) + 1;
  const fp2 = path.join(__dirname, '_uji_uint8.tif'); fs.writeFileSync(fp2, Buffer.from(C.tulisGeoTIFF(g, u, 'uint8', 0)));
  const { execSync } = require('child_process');
  const py = `
import tifffile, json, numpy as np
r = {}
with tifffile.TiffFile(r'${fp}') as t:
    p = t.pages[0]; a = p.asarray()
    r['shape'] = list(a.shape); r['dtype'] = str(a.dtype); r['v0'] = float(a[0,0]); r['v3'] = float(a[0,3]); r['last'] = float(a[-1,-1])
    r['scale'] = list(p.tags['ModelPixelScaleTag'].value); r['tie'] = list(p.tags['ModelTiepointTag'].value)
    r['geokeys'] = list(p.tags['GeoKeyDirectoryTag'].value); r['nodata'] = p.tags['GDAL_NODATA'].value if 'GDAL_NODATA' in p.tags else None
with tifffile.TiffFile(r'${fp2}') as t:
    a = t.pages[0].asarray(); r['u_dtype'] = str(a.dtype); r['u_row'] = a[1].tolist()
print(json.dumps(r))`;
  const out = JSON.parse(execSync('python3 -c "' + py.replace(/"/g, '\\"') + '"').toString());
  cek('GeoTIFF bentuk', out.shape[0] === 3 && out.shape[1] === 5 && out.dtype === 'float32', out);
  cek('GeoTIFF nilai', out.v0 === 0.5 && out.v3 === -9999 && out.last === 14.5, out);
  cek('GeoTIFF georeferensi', dekat(out.scale[0], 0.01, 1e-12) && dekat(out.tie[3], 116, 1e-9) && dekat(out.tie[4], -0.97, 1e-9), out);
  cek('GeoTIFF EPSG:4326', out.geokeys.join(',').endsWith('2048,0,1,4326'), out.geokeys);
  cek('GeoTIFF nodata', String(out.nodata).trim() === '-9999', out.nodata);
  cek('GeoTIFF uint8', out.u_dtype === 'uint8' && out.u_row.join() === '1,2,3,4,5', out);
  fs.unlinkSync(fp); fs.unlinkSync(fp2);
}


/* 14. Jarak */
{
  const g = C.buatGrid([0, 0, 1, 0.01], 0.01); // 100 x 1
  const src = new Uint8Array(g.n); src[0] = 1;
  const d = C.jarakKeSumber(src, g, null);
  cek('jarak sepanjang ekuator ≈ 1,113 km per sel', dekat(d[10], 10 * 1.1132, 0.01), d[10]);
  cek('jarak tanpa sumber = null', C.jarakKeSumber(new Uint8Array(g.n), g, null) === null);
}

console.log(`\nHasil uji: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
