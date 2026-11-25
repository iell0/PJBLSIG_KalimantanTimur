/* =============================================================================
 * KarhutlaCore — fungsi analisis spasial murni (tanpa DOM, tanpa Leaflet)
 * Dipakai di browser (window.KarhutlaCore) dan diuji di Node (module.exports).
 *
 * Isi:
 *   1. Grid analisis & luas sel (geodesik, bola)
 *   2. Transformasi koordinat (EPSG:4326, 3857, UTM WGS84 utara/selatan)
 *   3. Resampling raster ke grid (terdekat / bilinear / rata-rata blok)
 *   4. Rasterisasi poligon (scanline even-odd) & titik ke sel
 *   5. Skoring parameter (ambang, kuantil, kategori, kata kunci, keberadaan)
 *   6. Weighted overlay dua tingkat & klasifikasi kelas bahaya
 *   7. Statistik luas per kelas & per kab/kota
 *   8. Kerapatan titik api (KDE Gaussian) & agregasi FRP per sel
 *   9. Validasi: ROC/AUC, kurva laju prediksi, rasio frekuensi per kelas
 *  10. Analisis dampak, indeks prioritas mitigasi, emisi (IPCC 2006 Pers. 2.27)
 *  11. AHP (vektor eigen, λmax, CI, CR)
 *  12. Penulis GeoTIFF (Float32/UInt8, EPSG:4326) dan utilitas CSV/tanggal
 * ===========================================================================*/
(function (root) {
  'use strict';

  const R_BUMI = 6371008.8;          // jari-jari rata-rata (m), untuk luas sel
  const DEG = Math.PI / 180;

  /* ------------------------------------------------------------------ 0 util */
  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function toNum(v) {
    if (isNum(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ------------------------------------------------------------- 1 grid */
  function buatGrid(bbox, res) {
    const x0 = Math.floor(bbox[0] / res) * res;
    const y1 = Math.ceil(bbox[3] / res) * res;
    const ncols = Math.max(1, Math.ceil((bbox[2] - x0) / res - 1e-9));
    const nrows = Math.max(1, Math.ceil((y1 - bbox[1]) / res - 1e-9));
    const g = {
      xmin: x0, ymax: y1, dx: res, dy: res, ncols, nrows, n: ncols * nrows,
      xmax: x0 + ncols * res, ymin: y1 - nrows * res
    };
    g.luasSelHa = new Float64Array(nrows);
    const dLon = res * DEG;
    for (let r = 0; r < nrows; r++) {
      const top = (y1 - r * res) * DEG, bot = (y1 - (r + 1) * res) * DEG;
      g.luasSelHa[r] = R_BUMI * R_BUMI * dLon * Math.abs(Math.sin(top) - Math.sin(bot)) / 1e4;
    }
    return g;
  }
  function pusatSel(grid, idx) {
    const r = Math.floor(idx / grid.ncols), c = idx - r * grid.ncols;
    return [grid.xmin + (c + 0.5) * grid.dx, grid.ymax - (r + 0.5) * grid.dy];
  }
  function indeksSel(grid, lon, lat) {
    const c = Math.floor((lon - grid.xmin) / grid.dx);
    const r = Math.floor((grid.ymax - lat) / grid.dy);
    if (c < 0 || r < 0 || c >= grid.ncols || r >= grid.nrows) return -1;
    return r * grid.ncols + c;
  }
  function luasSel(grid, idx) { return grid.luasSelHa[Math.floor(idx / grid.ncols)]; }

  /* -------------------------------------------------- 2 transformasi CRS */
  const WGS = { a: 6378137, f: 1 / 298.257223563 };
  WGS.e2 = WGS.f * (2 - WGS.f);
  WGS.ep2 = WGS.e2 / (1 - WGS.e2);

  function utmMaju(zone, selatan) {
    const k0 = 0.9996, a = WGS.a, e2 = WGS.e2, ep2 = WGS.ep2;
    const e4 = e2 * e2, e6 = e4 * e2;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
    return function (lon, lat) {
      const phi = lat * DEG, lam = lon * DEG;
      const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
      const N = a / Math.sqrt(1 - e2 * s * s);
      const T = t * t, C = ep2 * c * c, A = (lam - lon0) * c;
      const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
        - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
        + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
        - (35 * e6 / 3072) * Math.sin(6 * phi));
      const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6
        + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
      let y = k0 * (M + N * t * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
        + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
      if (selatan) y += 10000000;
      return [x, y];
    };
  }
  function utmBalik(zone, selatan) {
    const k0 = 0.9996, a = WGS.a, e2 = WGS.e2, ep2 = WGS.ep2;
    const e4 = e2 * e2, e6 = e4 * e2;
    const lon0 = ((zone - 1) * 6 - 180 + 3) * DEG;
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    return function (x, y) {
      const xx = x - 500000, yy = selatan ? y - 10000000 : y;
      const M = yy / k0;
      const mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
      const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
        + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
        + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
      const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
      const N1 = a / Math.sqrt(1 - e2 * s * s), T1 = t * t, C1 = ep2 * c * c;
      const R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5);
      const D = xx / (N1 * k0);
      const lat = phi1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
      const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
      return [lon / DEG, lat / DEG];
    };
  }
  /** Fungsi (lon,lat) -> koordinat di CRS sumber. null bila CRS tak didukung. */
  function transformasiKe(epsg) {
    if (!epsg || epsg === 4326 || epsg === 4269 || epsg === 4979 || epsg === 4755) return (lon, lat) => [lon, lat];
    if (epsg === 3857 || epsg === 900913 || epsg === 102100) {
      return (lon, lat) => [6378137 * lon * DEG, 6378137 * Math.log(Math.tan(Math.PI / 4 + lat * DEG / 2))];
    }
    if (epsg >= 32601 && epsg <= 32660) return utmMaju(epsg - 32600, false);
    if (epsg >= 32701 && epsg <= 32760) return utmMaju(epsg - 32700, true);
    return null;
  }
  /** Fungsi koordinat CRS sumber -> (lon,lat). */
  function transformasiDari(epsg) {
    if (!epsg || epsg === 4326 || epsg === 4269 || epsg === 4979 || epsg === 4755) return (x, y) => [x, y];
    if (epsg === 3857 || epsg === 900913 || epsg === 102100) {
      return (x, y) => [x / 6378137 / DEG, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) / DEG];
    }
    if (epsg >= 32601 && epsg <= 32660) return utmBalik(epsg - 32600, false);
    if (epsg >= 32701 && epsg <= 32760) return utmBalik(epsg - 32700, true);
    return null;
  }

  /* ---------------------------------------------- 3 resampling raster */
  function apakahNoData(v, noData) {
    if (!Number.isFinite(v)) return true;
    if (noData !== null && noData !== undefined && Number.isFinite(noData) && v === noData) return true;
    if (Math.abs(v) > 1e30) return true;
    return false;
  }
  /**
   * src: { nilai: TypedArray (baris-mayor), lebar, tinggi, bbox:[x0,y0,x1,y1] (CRS sumber),
   *        epsg, noData }
   * opsi.metode: 'auto' | 'terdekat' | 'bilinear' | 'rata'; opsi.kategorikal
   * Hasil: Float32Array sepanjang grid.n (NaN = tidak ada data)
   */
  function resampleRaster(src, grid, mask, opsi) {
    opsi = opsi || {};
    const ke = transformasiKe(src.epsg);
    if (!ke) throw new Error('CRS EPSG:' + src.epsg + ' belum didukung. Ekspor ulang raster ke EPSG:4326.');
    const out = new Float32Array(grid.n).fill(NaN);
    const [x0, y0, x1, y1] = src.bbox;
    const w = src.lebar, h = src.tinggi, v = src.nilai, nd = src.noData;
    const sx = w / (x1 - x0), sy = h / (y1 - y0);
    // ukuran piksel sumber relatif terhadap sel grid (di pusat grid)
    const cLon = (grid.xmin + grid.xmax) / 2, cLat = (grid.ymin + grid.ymax) / 2;
    const pA = ke(cLon, cLat), pB = ke(cLon + grid.dx, cLat), pC = ke(cLon, cLat + grid.dy);
    const pxPerSelX = Math.abs((pB[0] - pA[0]) * sx), pxPerSelY = Math.abs((pC[1] - pA[1]) * sy);
    let metode = opsi.metode || 'auto';
    if (metode === 'auto') {
      if (opsi.kategorikal) metode = 'terdekat';
      else if (pxPerSelX >= 2 || pxPerSelY >= 2) metode = 'rata';
      else metode = 'bilinear';
    }
    const ambil = (c, r) => {
      if (c < 0 || r < 0 || c >= w || r >= h) return NaN;
      const val = v[r * w + c];
      return apakahNoData(val, nd) ? NaN : val;
    };
    const halfX = Math.min(8, Math.max(1, Math.floor(pxPerSelX / 2)));
    const halfY = Math.min(8, Math.max(1, Math.floor(pxPerSelY / 2)));
    const stepX = Math.max(1, Math.floor(pxPerSelX / 2 / halfX));
    const stepY = Math.max(1, Math.floor(pxPerSelY / 2 / halfY));
    for (let r = 0; r < grid.nrows; r++) {
      const lat = grid.ymax - (r + 0.5) * grid.dy;
      for (let c = 0; c < grid.ncols; c++) {
        const idx = r * grid.ncols + c;
        if (mask && !mask[idx]) continue;
        const lon = grid.xmin + (c + 0.5) * grid.dx;
        const p = ke(lon, lat);
        const px = (p[0] - x0) * sx - 0.5, py = (y1 - p[1]) * sy - 0.5;
        if (metode === 'terdekat') {
          out[idx] = ambil(Math.round(px), Math.round(py));
        } else if (metode === 'bilinear') {
          const ci = Math.floor(px), ri = Math.floor(py), fx = px - ci, fy = py - ri;
          const a = ambil(ci, ri), b = ambil(ci + 1, ri), c2 = ambil(ci, ri + 1), d = ambil(ci + 1, ri + 1);
          if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c2) || Number.isNaN(d)) {
            out[idx] = ambil(Math.round(px), Math.round(py));
          } else {
            out[idx] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c2 * (1 - fx) * fy + d * fx * fy;
          }
        } else { // rata-rata blok
          const cc = Math.round(px), rr = Math.round(py);
          let s = 0, n = 0;
          for (let j = -halfY; j <= halfY; j++) {
            for (let i = -halfX; i <= halfX; i++) {
              const val = ambil(cc + i * stepX, rr + j * stepY);
              if (!Number.isNaN(val)) { s += val; n++; }
            }
          }
          out[idx] = n ? s / n : NaN;
        }
      }
    }
    return out;
  }

  /* ----------------------------------- 4 rasterisasi poligon & titik */
  function ambilPoligon(geom) {
    if (!geom) return [];
    if (geom.type === 'Polygon') return [geom.coordinates];
    if (geom.type === 'MultiPolygon') return geom.coordinates;
    if (geom.type === 'GeometryCollection') {
      return (geom.geometries || []).reduce((acc, g) => acc.concat(ambilPoligon(g)), []);
    }
    return [];
  }
  function bboxRings(rings) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const ring of rings) for (const p of ring) {
      if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0];
      if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1];
    }
    return [a, b, c, d];
  }
  /** Mengisi sel yang pusatnya berada di dalam poligon (aturan even-odd). */
  function isiPoligon(rings, grid, out, nilai) {
    const bb = bboxRings(rings);
    if (!Number.isFinite(bb[0])) return 0;
    const rA = Math.max(0, Math.ceil((grid.ymax - bb[3]) / grid.dy - 0.5));
    const rB = Math.min(grid.nrows - 1, Math.floor((grid.ymax - bb[1]) / grid.dy - 0.5));
    // kumpulkan sisi
    let nE = 0;
    for (const ring of rings) nE += ring.length;
    const E = new Float64Array(nE * 4);
    let k = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length];
        if (p[1] === q[1]) continue;
        E[k++] = p[0]; E[k++] = p[1]; E[k++] = q[0]; E[k++] = q[1];
      }
    }
    const nEdge = k / 4;
    let terisi = 0;
    const xs = [];
    for (let r = rA; r <= rB; r++) {
      const y = grid.ymax - (r + 0.5) * grid.dy;
      xs.length = 0;
      for (let e = 0; e < nEdge; e++) {
        const ax = E[e * 4], ay = E[e * 4 + 1], bx = E[e * 4 + 2], by = E[e * 4 + 3];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay));
      }
      if (xs.length < 2) continue;
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const c0 = Math.max(0, Math.ceil((xs[i] - grid.xmin) / grid.dx - 0.5));
        const c1 = Math.min(grid.ncols - 1, Math.floor((xs[i + 1] - grid.xmin) / grid.dx - 0.5));
        for (let c = c0; c <= c1; c++) { out[r * grid.ncols + c] = nilai; terisi++; }
      }
    }
    if (terisi === 0) { // poligon lebih kecil dari satu sel: tandai sel pusatnya
      const idx = indeksSel(grid, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2);
      if (idx >= 0) { out[idx] = nilai; terisi = 1; }
    }
    return terisi;
  }
  /** Int32Array indeks fitur per sel (-1 = tidak tertutup poligon). */
  function rasterisasiFitur(features, grid) {
    const out = new Int32Array(grid.n).fill(-1);
    features.forEach((f, i) => {
      for (const poly of ambilPoligon(f.geometry)) isiPoligon(poly, grid, out, i);
    });
    return out;
  }
  /** Garis (LineString/MultiLineString) -> sel yang dilalui (dengan pencuplikan rapat). */
  function rasterisasiGaris(features, grid) {
    const out = new Int32Array(grid.n).fill(-1);
    const step = Math.min(grid.dx, grid.dy) / 3;
    features.forEach((f, i) => {
      const g = f.geometry; if (!g) return;
      const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const ln of lines) {
        for (let j = 0; j + 1 < ln.length; j++) {
          const [ax, ay] = ln[j], [bx, by] = ln[j + 1];
          const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / step));
          for (let s = 0; s <= n; s++) {
            const idx = indeksSel(grid, ax + (bx - ax) * s / n, ay + (by - ay) * s / n);
            if (idx >= 0) out[idx] = i;
          }
        }
      }
    });
    return out;
  }
  /** Transformasi koordinat GeoJSON (in-place) dari CRS proyeksi ke lon/lat. */
  function reproyeksiGeoJSON(fc, epsg) {
    const dari = transformasiDari(epsg);
    if (!dari) throw new Error('CRS GeoJSON EPSG:' + epsg + ' belum didukung. Ekspor ulang ke EPSG:4326.');
    const ubah = (co) => {
      if (typeof co[0] === 'number') { const p = dari(co[0], co[1]); co[0] = p[0]; co[1] = p[1]; return; }
      co.forEach(ubah);
    };
    const geom = (g) => {
      if (!g) return;
      if (g.type === 'GeometryCollection') g.geometries.forEach(geom); else ubah(g.coordinates);
    };
    (fc.features || []).forEach(f => geom(f.geometry));
    return fc;
  }
  function epsgGeoJSON(fc) {
    const nm = fc && fc.crs && fc.crs.properties && fc.crs.properties.name;
    if (!nm) return 4326;
    const m = String(nm).match(/(\d{4,6})\s*$/);
    if (!m) return 4326;
    const code = Number(m[1]);
    return code === 84 ? 4326 : code;
  }


  /** Jarak Euclidean (km) ke sel sumber terdekat — transformasi jarak dua lintasan (8 tetangga). */
  function jarakKeSumber(sumber, grid, mask) {
    const W = grid.ncols, H = grid.nrows, INF = 1e12;
    const latMid = (grid.ymin + grid.ymax) / 2;
    const kx = grid.dx * 111.32 * Math.cos(latMid * DEG), ky = grid.dy * 110.57, kd = Math.hypot(kx, ky);
    const d = new Float64Array(grid.n).fill(INF);
    let ada = false;
    for (let i = 0; i < grid.n; i++) if (sumber[i]) { d[i] = 0; ada = true; }
    if (!ada) return null;
    const rel = (i, j, w) => { if (d[j] + w < d[i]) d[i] = d[j] + w; };
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (c > 0) rel(i, i - 1, kx);
      if (r > 0) { rel(i, i - W, ky); if (c > 0) rel(i, i - W - 1, kd); if (c < W - 1) rel(i, i - W + 1, kd); }
    }
    for (let r = H - 1; r >= 0; r--) for (let c = W - 1; c >= 0; c--) {
      const i = r * W + c;
      if (c < W - 1) rel(i, i + 1, kx);
      if (r < H - 1) { rel(i, i + W, ky); if (c < W - 1) rel(i, i + W + 1, kd); if (c > 0) rel(i, i + W - 1, kd); }
    }
    const out = new Float32Array(grid.n);
    for (let i = 0; i < grid.n; i++) out[i] = (mask && !mask[i]) ? NaN : d[i];
    return out;
  }

  /* ------------------------------------------------ 5 deteksi atribut */
  const KANDIDAT_FIELD = {
    nama: ['WADMKK', 'KAB_KOTA', 'KABKOT', 'KABKOTA', 'NAMA_KAB', 'NAMKAB', 'kabupaten', 'Kabupaten', 'KABUPATEN',
      'NAMOBJ', 'NAME_2', 'shapeName', 'ADM2_EN', 'ADM2_ID', 'nama', 'NAMA', 'Nama', 'name', 'NAME', 'Name'],
    nilai: ['skor', 'SKOR', 'Skor', 'score', 'SCORE', 'Score', 'nilai', 'NILAI', 'Nilai', 'value', 'VALUE',
      'kelas', 'KELAS', 'Kelas', 'gridcode', 'GRIDCODE', 'DN', 'class', 'CLASS'],
    gambut: ['skor', 'SKOR', 'Skor', 'score', 'kedalaman', 'KEDALAMAN', 'Kedalaman', 'KETEBALAN', 'Ketebalan',
      'tebal', 'TEBAL', 'DEPTH', 'depth', 'kelas', 'KELAS', 'Kelas'],
    kawasan: ['skor', 'SKOR', 'Skor', 'score', 'FUNGSIKWS', 'FUNGSI_KWS', 'FUNGSI', 'fungsi', 'Fungsi',
      'KWS_HUTAN', 'KAWASAN', 'Kawasan', 'kawasan', 'NAMOBJ', 'REMARK', 'KETERANGAN', 'keterangan', 'Keterangan']
  };
  const FIELD_ABAIKAN = /^(fid|id|objectid|object_id|ogc_fid|shape_area|shape_leng|shape_length|area|luas|luas_ha|perimeter|len|length|lat|lon|latitude|longitude|x|y|system:index)$/i;
  function deteksiField(features, kandidat) {
    if (!features || !features.length) return null;
    const contoh = features.slice(0, 200).map(f => f.properties || {});
    const keys = new Set(); contoh.forEach(p => Object.keys(p).forEach(k => keys.add(k)));
    const ada = (k) => contoh.filter(p => p[k] !== null && p[k] !== undefined && p[k] !== '').length >= contoh.length * 0.5;
    for (const k of kandidat) if (keys.has(k) && ada(k)) return k;
    const lower = {}; keys.forEach(k => { lower[k.toLowerCase()] = k; });
    for (const k of kandidat) { const kk = lower[k.toLowerCase()]; if (kk && ada(kk)) return kk; }
    return null;
  }
  function deteksiFieldNumerik(features) {
    const contoh = features.slice(0, 200).map(f => f.properties || {});
    const keys = new Set(); contoh.forEach(p => Object.keys(p).forEach(k => keys.add(k)));
    for (const k of keys) {
      if (FIELD_ABAIKAN.test(k)) continue;
      const vals = contoh.map(p => toNum(p[k])).filter(Number.isFinite);
      if (vals.length >= contoh.length * 0.5) return k;
    }
    return null;
  }

  /** Nilai atribut vektor -> grid. Hasil {nilai, kategori|null, adaFitur}. */
  function nilaiVektorKeGrid(idxGrid, features, field) {
    const n = idxGrid.length;
    const nilai = new Float32Array(n).fill(NaN);
    const adaFitur = new Uint8Array(n);
    let kategori = null;
    if (field) {
      const raw = features.map(f => (f.properties || {})[field]);
      const num = raw.map(toNum);
      const nNum = num.filter(Number.isFinite).length, nAda = raw.filter(v => v !== null && v !== undefined && v !== '').length;
      if (nAda > 0 && nNum < nAda * 0.8) { // atribut teks
        kategori = [];
        const kode = new Map();
        const kodeFitur = raw.map(v => {
          if (v === null || v === undefined || v === '') return NaN;
          const s = String(v).trim();
          if (!kode.has(s)) { kode.set(s, kategori.length); kategori.push(s); }
          return kode.get(s);
        });
        for (let i = 0; i < n; i++) { const f = idxGrid[i]; if (f >= 0) { adaFitur[i] = 1; nilai[i] = kodeFitur[f]; } }
        return { nilai, kategori, adaFitur, field };
      }
      for (let i = 0; i < n; i++) { const f = idxGrid[i]; if (f >= 0) { adaFitur[i] = 1; nilai[i] = num[f]; } }
      return { nilai, kategori: null, adaFitur, field };
    }
    for (let i = 0; i < n; i++) if (idxGrid[i] >= 0) adaFitur[i] = 1;
    return { nilai, kategori: null, adaFitur, field: null };
  }

  /* --------------------------------------------------- 6 statistik */
  function statistik(values, mask) {
    let n = 0, mn = Infinity, mx = -Infinity, s = 0, semuaBulat = true;
    for (let i = 0; i < values.length; i++) {
      if (mask && !mask[i]) continue;
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      n++; s += v; if (v < mn) mn = v; if (v > mx) mx = v;
      if (semuaBulat && Math.abs(v - Math.round(v)) > 1e-6) semuaBulat = false;
    }
    return { n, min: n ? mn : NaN, max: n ? mx : NaN, rerata: n ? s / n : NaN, semuaBulat };
  }
  function sampelNilai(values, mask, maks) {
    maks = maks || 200000;
    let n = 0;
    for (let i = 0; i < values.length; i++) if ((!mask || mask[i]) && Number.isFinite(values[i])) n++;
    const step = Math.max(1, Math.floor(n / maks));
    const out = []; let k = 0;
    for (let i = 0; i < values.length; i++) {
      if ((!mask || mask[i]) && Number.isFinite(values[i])) { if (k % step === 0) out.push(values[i]); k++; }
    }
    return Float64Array.from(out).sort();
  }
  function kuantil(sorted, p) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /* ------------------------------------------------------ 7 skoring */
  function skorAmbang(v, b, arah) {
    let k = 0;
    for (let i = 0; i < b.length; i++) if (v > b[i]) k++;
    return arah === 'turun' ? 5 - k : 1 + k;
  }
  function skorKataKunci(teks, daftar) {
    if (!daftar) return null;
    for (const d of daftar) if (new RegExp(d.pola, 'i').test(teks)) return d.skor;
    return null;
  }
  /**
   * lapis: {nilai: Float32Array, kategori: string[]|null, adaFitur?: Uint8Array}
   * aturan: lihat config.js. Hasil {skor: Float32Array, rincian}
   */
  function skorkan(lapis, mask, aturan) {
    const n = lapis.nilai.length;
    const skor = new Float32Array(n).fill(NaN);
    const a = aturan || { metode: 'otomatis', arah: 'naik' };
    const arah = a.arah || 'naik';
    let metode = a.metode || 'otomatis';
    const rincian = { metodeDiminta: metode };
    const st = statistik(lapis.nilai, mask);
    rincian.statistik = st;

    if (lapis.kategori) {
      // atribut teks
      const peta = a.peta || {};
      const skorKode = lapis.kategori.map(t => {
        if (peta[t] !== undefined) return Number(peta[t]);
        const kk = skorKataKunci(t, a.kataKunci);
        return kk !== null ? kk : (a.skorKategoriLain !== undefined ? a.skorKategoriLain : 3);
      });
      for (let i = 0; i < n; i++) {
        if (mask && !mask[i]) continue;
        const v = lapis.nilai[i];
        if (Number.isFinite(v)) skor[i] = skorKode[v];
      }
      rincian.metode = 'kategori-teks';
      rincian.peta = {}; lapis.kategori.forEach((t, i) => { rincian.peta[t] = skorKode[i]; });
    } else {
      if (metode === 'otomatis') {
        if (st.n === 0) metode = 'keberadaan';
        else if (st.min >= 1 && st.max <= 5) metode = 'langsung';
        else metode = 'kuantil';
      }
      rincian.metode = metode;
      if (metode === 'ambang' || metode === 'kuantil') {
        let b = a.batas;
        if (metode === 'kuantil' || !b || b.length !== 4) {
          const s = sampelNilai(lapis.nilai, mask);
          b = [0.2, 0.4, 0.6, 0.8].map(p => kuantil(s, p));
        }
        rincian.batas = b.slice(); rincian.arah = arah;
        for (let i = 0; i < n; i++) {
          if (mask && !mask[i]) continue;
          const v = lapis.nilai[i];
          if (Number.isFinite(v)) skor[i] = skorAmbang(v, b, arah);
        }
      } else if (metode === 'langsung') {
        for (let i = 0; i < n; i++) {
          if (mask && !mask[i]) continue;
          const v = lapis.nilai[i];
          if (Number.isFinite(v)) skor[i] = clamp(v, 1, 5);
        }
      } else if (metode === 'kategori') {
        const peta = a.peta || {};
        rincian.peta = Object.assign({}, peta);
        for (let i = 0; i < n; i++) {
          if (mask && !mask[i]) continue;
          const v = lapis.nilai[i];
          if (!Number.isFinite(v)) continue;
          const s = peta[Math.round(v)];
          if (s !== undefined && s !== null && s !== '') skor[i] = Number(s);
        }
      } else if (metode === 'keberadaan') {
        rincian.skorAda = a.skorAda !== undefined ? a.skorAda : 5;
      }
    }
    // piksel yang tertutup fitur vektor tanpa nilai atribut -> skorAda
    if (lapis.adaFitur) {
      const skorAda = a.skorAda !== undefined ? a.skorAda : (metode === 'keberadaan' ? 5 : null);
      const diLuar = a.skorDiLuar !== undefined ? a.skorDiLuar : null;
      rincian.skorDiLuar = diLuar;
      for (let i = 0; i < n; i++) {
        if (mask && !mask[i]) continue;
        if (lapis.adaFitur[i]) {
          if (Number.isNaN(skor[i]) && skorAda !== null) skor[i] = skorAda;
        } else if (diLuar !== null && diLuar !== undefined) {
          skor[i] = diLuar;
        }
      }
    }
    return { skor, rincian };
  }

  /* --------------------------------- 8 weighted overlay & klasifikasi */
  /**
   * skorParam: { idParameter: Float32Array skor 1–5 }
   * kelompok: [{id, bobot, parameter:[{id, bobot}]}]
   */
  function hitungModel(grid, mask, skorParam, kelompok) {
    const n = grid.n;
    const indeks = new Float32Array(n).fill(NaN);
    const jumlahKelompok = new Uint8Array(n);
    const aktif = kelompok.map(k => ({
      id: k.id, bobot: Number(k.bobot) || 0,
      param: k.parameter.filter(p => (Number(p.bobot) || 0) > 0 && skorParam[p.id])
        .map(p => ({ id: p.id, bobot: Number(p.bobot), skor: skorParam[p.id] }))
    })).filter(k => k.bobot > 0 && k.param.length > 0);
    const nAktif = aktif.length;
    let selLengkap = 0, selValid = 0;
    for (let i = 0; i < n; i++) {
      if (mask && !mask[i]) continue;
      let num = 0, den = 0, cnt = 0;
      for (const k of aktif) {
        let gn = 0, gd = 0;
        for (const p of k.param) {
          const s = p.skor[i];
          if (Number.isFinite(s)) { gn += p.bobot * s; gd += p.bobot; }
        }
        if (gd > 0) { num += k.bobot * (gn / gd); den += k.bobot; cnt++; }
      }
      if (den > 0) {
        indeks[i] = num / den; jumlahKelompok[i] = cnt; selValid++;
        if (cnt === nAktif) selLengkap++;
      }
    }
    const totalBobot = aktif.reduce((s, k) => s + k.bobot, 0);
    return {
      indeks, jumlahKelompok, nKelompokAktif: nAktif, selValid, selLengkap,
      bobotEfektif: aktif.map(k => ({ id: k.id, bobot: totalBobot ? k.bobot / totalBobot : 0 })),
      kelompokTanpaData: kelompok.filter(k => !aktif.find(a => a.id === k.id)).map(k => k.id)
    };
  }
  function batasKelas(indeks, mask, metode, batasManual) {
    if (metode === 'kuantil') {
      const s = sampelNilai(indeks, mask);
      return [0.2, 0.4, 0.6, 0.8].map(p => kuantil(s, p));
    }
    if (metode === 'manual' && batasManual && batasManual.length === 4) return batasManual.map(Number);
    return [1.8, 2.6, 3.4, 4.2];
  }
  function klasifikasi(indeks, batas) {
    const out = new Uint8Array(indeks.length);
    for (let i = 0; i < indeks.length; i++) {
      const v = indeks[i];
      if (!Number.isFinite(v)) continue;
      let k = 1;
      for (let j = 0; j < batas.length; j++) if (v > batas[j] + 1e-6) k++; // toleransi presisi Float32
      out[i] = k;
    }
    return out;
  }

  /* -------------------------------------------- 9 statistik luas */
  function luasPerKelas(grid, kelas, nKelas) {
    nKelas = nKelas || 5;
    const out = new Float64Array(nKelas + 1);
    for (let i = 0; i < kelas.length; i++) if (kelas[i]) out[kelas[i]] += luasSel(grid, i);
    return Array.from(out).slice(1);
  }
  /** Matriks zona × kelas (ha). zona: Int32Array indeks zona (-1 = di luar). */
  function luasZonaKelas(grid, zona, kelas, nZona, nKelas) {
    nKelas = nKelas || 5;
    const m = Array.from({ length: nZona }, () => new Float64Array(nKelas + 1));
    const luasZona = new Float64Array(nZona);
    for (let i = 0; i < zona.length; i++) {
      const z = zona[i]; if (z < 0) continue;
      const a = luasSel(grid, i);
      luasZona[z] += a;
      if (kelas[i]) m[z][kelas[i]] += a;
    }
    return { matriks: m.map(r => Array.from(r).slice(1)), luasZona: Array.from(luasZona) };
  }

  /* --------------------------------- 10 kerapatan titik api & FRP */
  function hitungTitikPerSel(titik, grid, mask) {
    const jumlah = new Float32Array(grid.n);
    const frpSum = new Float32Array(grid.n), frpMax = new Float32Array(grid.n);
    let diDalam = 0;
    for (const t of titik) {
      const idx = indeksSel(grid, t.lon, t.lat);
      if (idx < 0 || (mask && !mask[idx])) continue;
      jumlah[idx]++; diDalam++;
      if (Number.isFinite(t.frp)) { frpSum[idx] += t.frp; if (t.frp > frpMax[idx]) frpMax[idx] = t.frp; }
    }
    return { jumlah, frpSum, frpMax, diDalam };
  }
  function kernelGauss(sigma) {
    const rad = Math.max(1, Math.ceil(3 * sigma));
    const k = new Float64Array(2 * rad + 1); let s = 0;
    for (let i = -rad; i <= rad; i++) { k[i + rad] = Math.exp(-0.5 * (i / sigma) ** 2); s += k[i + rad]; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    return { k, rad };
  }
  /** KDE Gaussian (separabel). Hasil kerapatan titik per km². */
  function kde(jumlah, grid, bandwidthKm, mask) {
    const latMid = (grid.ymin + grid.ymax) / 2;
    const kmX = grid.dx * 111.32 * Math.cos(latMid * DEG), kmY = grid.dy * 110.57;
    const gx = kernelGauss(bandwidthKm / kmX), gy = kernelGauss(bandwidthKm / kmY);
    const W = grid.ncols, H = grid.nrows;
    const tmp = new Float32Array(grid.n), out = new Float32Array(grid.n);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const v = jumlah[r * W + c]; if (!v) continue;
        for (let i = -gx.rad; i <= gx.rad; i++) {
          const cc = c + i; if (cc < 0 || cc >= W) continue;
          tmp[r * W + cc] += v * gx.k[i + gx.rad];
        }
      }
    }
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const v = tmp[r * W + c]; if (!v) continue;
        for (let j = -gy.rad; j <= gy.rad; j++) {
          const rr = r + j; if (rr < 0 || rr >= H) continue;
          out[rr * W + c] += v * gy.k[j + gy.rad];
        }
      }
    }
    for (let i = 0; i < grid.n; i++) {
      if (mask && !mask[i]) { out[i] = NaN; continue; }
      out[i] = out[i] / (luasSel(grid, i) / 100); // ha -> km²
    }
    return out;
  }

  /* ---------------------------------------------- 11 validasi */
  /** ROC/AUC berbasis sel: positif = sel berisi ≥1 kejadian. */
  function rocAuc(skor, mask, positif, nBin) {
    nBin = nBin || 1000;
    const st = statistik(skor, mask);
    if (!st.n) return null;
    const lo = st.min, hi = st.max, span = (hi - lo) || 1;
    const pos = new Float64Array(nBin), neg = new Float64Array(nBin);
    let P = 0, N = 0;
    for (let i = 0; i < skor.length; i++) {
      if (mask && !mask[i]) continue;
      const v = skor[i]; if (!Number.isFinite(v)) continue;
      const b = Math.min(nBin - 1, Math.floor((v - lo) / span * nBin));
      if (positif[i]) { pos[b]++; P++; } else { neg[b]++; N++; }
    }
    if (!P || !N) return { auc: NaN, roc: [], P, N };
    const roc = [[0, 0]]; let tp = 0, fp = 0, auc = 0;
    for (let b = nBin - 1; b >= 0; b--) {
      if (!pos[b] && !neg[b]) continue;
      const tpr0 = tp / P, fpr0 = fp / N;
      tp += pos[b]; fp += neg[b];
      const tpr = tp / P, fpr = fp / N;
      auc += (fpr - fpr0) * (tpr + tpr0) / 2;
      roc.push([fpr, tpr]);
    }
    return { auc, roc, P, N };
  }
  /** Kurva laju prediksi/keberhasilan: % luas (skor tertinggi dulu) vs % kejadian (titik). */
  function kurvaLaju(grid, skor, mask, titikPerSel, nBin) {
    nBin = nBin || 200;
    const st = statistik(skor, mask);
    if (!st.n) return null;
    const lo = st.min, span = (st.max - st.min) || 1;
    const luas = new Float64Array(nBin), kej = new Float64Array(nBin);
    let A = 0, K = 0;
    for (let i = 0; i < skor.length; i++) {
      if (mask && !mask[i]) continue;
      const v = skor[i]; if (!Number.isFinite(v)) continue;
      const b = Math.min(nBin - 1, Math.floor((v - lo) / span * nBin));
      const a = luasSel(grid, i); luas[b] += a; A += a;
      const t = titikPerSel[i] || 0; kej[b] += t; K += t;
    }
    if (!K) return { kurva: [], auc: NaN, K };
    const kurva = [[0, 0]]; let ca = 0, ck = 0, auc = 0;
    for (let b = nBin - 1; b >= 0; b--) {
      if (!luas[b]) continue;
      const x0 = ca / A, y0 = ck / K;
      ca += luas[b]; ck += kej[b];
      const x1 = ca / A, y1 = ck / K;
      auc += (x1 - x0) * (y0 + y1) / 2;
      kurva.push([x1, y1]);
    }
    return { kurva, auc, K };
  }
  /** Tabel per kelas: % luas, jumlah & % kejadian, rasio frekuensi. */
  function tabelKelasKejadian(grid, kelas, titikPerSel, nKelas) {
    nKelas = nKelas || 5;
    const luas = new Float64Array(nKelas + 1), kej = new Float64Array(nKelas + 1);
    for (let i = 0; i < kelas.length; i++) {
      const k = kelas[i]; if (!k) continue;
      luas[k] += luasSel(grid, i); kej[k] += titikPerSel[i] || 0;
    }
    const A = luas.reduce((s, v) => s + v, 0), K = kej.reduce((s, v) => s + v, 0);
    const baris = [];
    for (let k = 1; k <= nKelas; k++) {
      const pa = A ? luas[k] / A : 0, pk = K ? kej[k] / K : 0;
      baris.push({ kelas: k, luasHa: luas[k], persenLuas: pa * 100, kejadian: kej[k], persenKejadian: pk * 100, rasioFrekuensi: pa > 0 ? pk / pa : NaN });
    }
    return { baris, totalLuas: A, totalKejadian: K };
  }

  /* ---------------------------------- 12 dampak, prioritas, emisi */
  /**
   * lapisan: { gambut: Uint8Array|null, hutanIdx: Int32Array|null, hutanKategori: string[]|null,
   *            permukiman: Uint8Array|null, penduduk: Float32Array|null, terbakar: Uint8Array|null }
   */
  function analisisDampak(grid, kelas, zona, nZona, lapisan, kelasTinggiMulai, fasilitas) {
    const T = kelasTinggiMulai || 4;
    const hasil = {
      total: { luasTinggi: 0, gambutTinggi: 0, gambutTotal: 0, hutanTinggi: 0, permukimanTinggi: 0, pendudukTinggi: 0,
        terbakar: 0, terbakarTinggi: 0, terbakarGambut: 0, fasilitasTinggi: 0, fasilitasTotal: 0 },
      hutanPerKategori: {},
      perZona: Array.from({ length: nZona }, () => ({ luasTinggi: 0, gambutTinggi: 0, hutanTinggi: 0,
        permukimanTinggi: 0, pendudukTinggi: 0, terbakar: 0, fasilitasTinggi: 0 }))
    };
    const L = lapisan || {};
    for (let i = 0; i < kelas.length; i++) {
      const k = kelas[i];
      const a = luasSel(grid, i);
      const z = zona ? zona[i] : -1;
      const tinggi = k >= T;
      if (L.gambut && L.gambut[i]) hasil.total.gambutTotal += a;
      if (L.terbakar && L.terbakar[i]) {
        hasil.total.terbakar += a; if (z >= 0) hasil.perZona[z].terbakar += a;
        if (tinggi) hasil.total.terbakarTinggi += a;
        if (L.gambut && L.gambut[i]) hasil.total.terbakarGambut += a;
      }
      if (!tinggi) continue;
      hasil.total.luasTinggi += a; if (z >= 0) hasil.perZona[z].luasTinggi += a;
      if (L.gambut && L.gambut[i]) { hasil.total.gambutTinggi += a; if (z >= 0) hasil.perZona[z].gambutTinggi += a; }
      if (L.hutanIdx && L.hutanIdx[i] >= 0) {
        hasil.total.hutanTinggi += a; if (z >= 0) hasil.perZona[z].hutanTinggi += a;
        const kat = L.hutanKategori ? (L.hutanKategori[L.hutanIdx[i]] || 'Tanpa keterangan') : 'Kawasan hutan';
        hasil.hutanPerKategori[kat] = (hasil.hutanPerKategori[kat] || 0) + a;
      }
      if (L.permukiman && L.permukiman[i]) { hasil.total.permukimanTinggi += a; if (z >= 0) hasil.perZona[z].permukimanTinggi += a; }
      if (L.penduduk && Number.isFinite(L.penduduk[i])) { hasil.total.pendudukTinggi += L.penduduk[i]; if (z >= 0) hasil.perZona[z].pendudukTinggi += L.penduduk[i]; }
    }
    if (fasilitas) {
      for (const f of fasilitas) {
        const idx = indeksSel(grid, f.lon, f.lat);
        if (idx < 0 || !kelas[idx]) continue;
        hasil.total.fasilitasTotal++;
        if (kelas[idx] >= T) {
          hasil.total.fasilitasTinggi++;
          const z = zona ? zona[idx] : -1; if (z >= 0) hasil.perZona[z].fasilitasTinggi++;
        }
      }
    }
    return hasil;
  }
  /** Indeks prioritas: rerata indikator ter-normalisasi min–maks (bobot sama). */
  function indeksPrioritas(indikator) {
    // indikator: [{nama, nilai: number[]}], panjang nilai = jumlah zona
    const nZ = indikator.length ? indikator[0].nilai.length : 0;
    const norm = indikator.map(ind => {
      const v = ind.nilai.filter(Number.isFinite);
      const mn = Math.min(...v), mx = Math.max(...v);
      return ind.nilai.map(x => Number.isFinite(x) ? (mx > mn ? (x - mn) / (mx - mn) : 0) : NaN);
    });
    const skor = [];
    for (let z = 0; z < nZ; z++) {
      const vals = norm.map(n => n[z]).filter(Number.isFinite);
      skor.push(vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : NaN);
    }
    const urut = skor.map((s, z) => ({ s, z })).filter(o => Number.isFinite(o.s)).sort((a, b) => b.s - a.s);
    const peringkat = new Array(nZ).fill(null), tingkat = new Array(nZ).fill(null);
    urut.forEach((o, i) => {
      peringkat[o.z] = i + 1;
      tingkat[o.z] = i < Math.ceil(urut.length / 3) ? 'Prioritas I' : (i < Math.ceil(2 * urut.length / 3) ? 'Prioritas II' : 'Prioritas III');
    });
    return { skor, peringkat, tingkat, ternormalisasi: norm };
  }
  /** IPCC 2006 Vol.4 Bab 2 Pers. 2.27: L = A × MB × Cf × Gef × 10⁻³ (ton gas). */
  function emisiKebakaran(luasHa, mbCf, gef) {
    if (!(luasHa > 0) || !(mbCf > 0) || !(gef > 0)) return null;
    return luasHa * mbCf * gef * 1e-3;
  }

  /* -------------------------------------------------------- 13 AHP */
  const RI = [0, 0, 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59];
  function ahp(M) {
    const n = M.length;
    let w = new Array(n).fill(1 / n);
    for (let it = 0; it < 1000; it++) {
      const v = M.map(row => row.reduce((s, a, j) => s + a * w[j], 0));
      const s = v.reduce((a, b) => a + b, 0);
      const wn = v.map(x => x / s);
      const d = wn.reduce((acc, x, i) => acc + Math.abs(x - w[i]), 0);
      w = wn;
      if (d < 1e-12) break;
    }
    const Aw = M.map(row => row.reduce((s, a, j) => s + a * w[j], 0));
    const lambda = Aw.reduce((s, x, i) => s + x / w[i], 0) / n;
    const CI = n > 1 ? (lambda - n) / (n - 1) : 0;
    const ri = RI[n] || 1.59;
    return { bobot: w, lambdaMaks: lambda, CI, RI: ri, CR: ri > 0 ? CI / ri : 0, konsisten: n < 3 || CI / ri <= 0.1 };
  }

  /* ------------------------------------------ 14 penulis GeoTIFF */
  /**
   * Menulis GeoTIFF tanpa kompresi, satu band, EPSG:4326.
   * jenis: 'float32' | 'uint8'. nilai: TypedArray baris-mayor sepanjang grid.n.
   */
  function tulisGeoTIFF(grid, nilai, jenis, noData) {
    const W = grid.ncols, H = grid.nrows;
    const bps = jenis === 'uint8' ? 1 : 4;
    const dataBytes = W * H * bps;
    const ndStr = (noData === undefined || noData === null) ? null : String(noData) + '\0';
    const tags = [];
    const SHORT = 3, LONG = 4, DOUBLE = 12, ASCII = 2;
    tags.push([256, LONG, 1, [W]]);
    tags.push([257, LONG, 1, [H]]);
    tags.push([258, SHORT, 1, [bps * 8]]);
    tags.push([259, SHORT, 1, [1]]);
    tags.push([262, SHORT, 1, [1]]);
    tags.push([273, LONG, 1, [0]]);            // diisi kemudian
    tags.push([277, SHORT, 1, [1]]);
    tags.push([278, LONG, 1, [H]]);
    tags.push([279, LONG, 1, [dataBytes]]);
    tags.push([284, SHORT, 1, [1]]);
    tags.push([339, SHORT, 1, [jenis === 'uint8' ? 1 : 3]]);
    tags.push([33550, DOUBLE, 3, [grid.dx, grid.dy, 0]]);
    tags.push([33922, DOUBLE, 6, [0, 0, 0, grid.xmin, grid.ymax, 0]]);
    const geokeys = [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326];
    tags.push([34735, SHORT, geokeys.length, geokeys]);
    if (ndStr) tags.push([42113, ASCII, ndStr.length, ndStr]);
    tags.sort((a, b) => a[0] - b[0]);
    const ukuranTipe = { 2: 1, 3: 2, 4: 4, 12: 8 };
    const ifdOffset = 8;
    const ifdSize = 2 + tags.length * 12 + 4;
    let extraOffset = ifdOffset + ifdSize;
    const extra = [];
    for (const t of tags) {
      const sz = ukuranTipe[t[1]] * t[2];
      if (sz > 4) { if (extraOffset % 2) extraOffset++; t.offset = extraOffset; extra.push(t); extraOffset += sz; }
    }
    let dataOffset = extraOffset; if (dataOffset % 4) dataOffset += 4 - (dataOffset % 4);
    tags.find(t => t[0] === 273)[3] = [dataOffset];
    const buf = new ArrayBuffer(dataOffset + dataBytes);
    const dv = new DataView(buf);
    dv.setUint8(0, 0x49); dv.setUint8(1, 0x49); dv.setUint16(2, 42, true); dv.setUint32(4, ifdOffset, true);
    const tulisNilai = (off, t) => {
      const [, type, , vals] = t;
      if (type === ASCII) { for (let i = 0; i < vals.length; i++) dv.setUint8(off + i, vals.charCodeAt(i)); return; }
      for (let i = 0; i < vals.length; i++) {
        if (type === SHORT) dv.setUint16(off + i * 2, vals[i], true);
        else if (type === LONG) dv.setUint32(off + i * 4, vals[i], true);
        else if (type === DOUBLE) dv.setFloat64(off + i * 8, vals[i], true);
      }
    };
    dv.setUint16(ifdOffset, tags.length, true);
    tags.forEach((t, i) => {
      const e = ifdOffset + 2 + i * 12;
      dv.setUint16(e, t[0], true); dv.setUint16(e + 2, t[1], true); dv.setUint32(e + 4, t[2], true);
      if (t.offset !== undefined) dv.setUint32(e + 8, t.offset, true); else tulisNilai(e + 8, t);
    });
    dv.setUint32(ifdOffset + 2 + tags.length * 12, 0, true);
    extra.forEach(t => tulisNilai(t.offset, t));
    if (jenis === 'uint8') {
      new Uint8Array(buf, dataOffset, dataBytes).set(nilai);
    } else {
      for (let i = 0; i < W * H; i++) {
        const v = nilai[i];
        dv.setFloat32(dataOffset + i * 4, Number.isFinite(v) ? v : (noData !== undefined ? noData : NaN), true);
      }
    }
    return buf;
  }

  /* ------------------------------------- 15 CSV, tanggal, hotspot */
  function parseCSV(teks) {
    const baris = teks.replace(/^﻿/, '').split(/\r?\n/).filter(b => b.trim() !== '');
    if (!baris.length) return [];
    const sep = (baris[0].match(/;/g) || []).length > (baris[0].match(/,/g) || []).length ? ';' : ',';
    const pecah = (s) => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (q) {
          if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
        } else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur); return out;
    };
    const head = pecah(baris[0]).map(h => h.trim());
    return baris.slice(1).map(b => {
      const v = pecah(b); const o = {};
      head.forEach((h, i) => { o[h] = v[i] !== undefined ? v[i].trim() : ''; });
      return o;
    });
  }
  function keCSV(baris, kolom) {
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [kolom.map(esc).join(',')].concat(baris.map(b => kolom.map(k => esc(b[k])).join(','))).join('\n');
  }
  function parseTanggal(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) {
      let ms = v;
      if (v > 1e11) ms = v; else if (v > 1e8) ms = v * 1000; else if (v > 19000000 && v < 21000000) {
        const s = String(Math.round(v)); return parseTanggal(s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8));
      } else return null;
      const d = new Date(ms);
      if (isNaN(d)) return null;
      return { tahun: d.getUTCFullYear(), bulan: d.getUTCMonth() + 1, iso: d.toISOString().slice(0, 10) };
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return { tahun: +m[1], bulan: +m[2], iso: m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') };
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return { tahun: +m[3], bulan: +m[2], iso: m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') };
    if (/^\d+(\.\d+)?$/.test(s)) return parseTanggal(Number(s));
    return null;
  }
  function ambilProp(p, nama) {
    for (const n of nama) if (p[n] !== undefined && p[n] !== null && p[n] !== '') return p[n];
    const lower = {}; Object.keys(p).forEach(k => { lower[k.toLowerCase()] = k; });
    for (const n of nama) { const k = lower[n.toLowerCase()]; if (k && p[k] !== '' && p[k] !== null) return p[k]; }
    return undefined;
  }
  function tingkatConfidence(v) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim().toLowerCase();
    if (s === 'l' || s === 'low' || s === 'rendah') return 0;
    if (s === 'n' || s === 'nominal' || s === 'sedang') return 1;
    if (s === 'h' || s === 'high' || s === 'tinggi') return 2;
    const n = toNum(s);
    if (Number.isFinite(n)) return n < 30 ? 0 : (n < 80 ? 1 : 2);
    return null;
  }
  /** Menyeragamkan satu titik api (Feature GeoJSON atau baris CSV). */
  function normalisasiHotspot(sumber) {
    const p = sumber.properties || sumber;
    let lon = NaN, lat = NaN;
    const g = sumber.geometry;
    if (g && g.type === 'Point') { lon = g.coordinates[0]; lat = g.coordinates[1]; }
    else if (g && g.type === 'MultiPoint' && g.coordinates.length) { lon = g.coordinates[0][0]; lat = g.coordinates[0][1]; }
    if (!Number.isFinite(lon)) lon = toNum(ambilProp(p, ['longitude', 'lon', 'LONGITUDE', 'Long', 'x', 'X']));
    if (!Number.isFinite(lat)) lat = toNum(ambilProp(p, ['latitude', 'lat', 'LATITUDE', 'Lat', 'y', 'Y']));
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const tgl = parseTanggal(ambilProp(p, ['acq_date', 'ACQ_DATE', 'tanggal', 'TANGGAL', 'date', 'DATE', 'acq_datetime', 'system:time_start']));
    const conf = ambilProp(p, ['confidence', 'CONFIDENCE', 'conf', 'kepercayaan']);
    return {
      lon, lat,
      tahun: tgl ? tgl.tahun : null, bulan: tgl ? tgl.bulan : null, tanggal: tgl ? tgl.iso : null,
      jam: ambilProp(p, ['acq_time', 'ACQ_TIME']),
      frp: toNum(ambilProp(p, ['frp', 'FRP'])),
      confAsli: conf === undefined ? null : conf,
      conf: tingkatConfidence(conf),
      satelit: ambilProp(p, ['satellite', 'SATELLITE', 'satelit']) || null,
      instrumen: ambilProp(p, ['instrument', 'INSTRUMENT', 'sensor', 'SENSOR']) || null,
      brightness: toNum(ambilProp(p, ['bright_ti4', 'BRIGHT_TI4', 'brightness', 'BRIGHTNESS'])),
      brightness2: toNum(ambilProp(p, ['bright_ti5', 'BRIGHT_TI5', 'bright_t31', 'BRIGHT_T31'])),
      siangMalam: ambilProp(p, ['daynight', 'DAYNIGHT']) || null,
      versi: ambilProp(p, ['version', 'VERSION']) || null,
      props: p
    };
  }
  function normalisasiTitik(sumber) {
    const p = sumber.properties || sumber;
    let lon = NaN, lat = NaN; const g = sumber.geometry;
    if (g && g.type === 'Point') { lon = g.coordinates[0]; lat = g.coordinates[1]; }
    else if (g && g.type === 'MultiPoint' && g.coordinates.length) { lon = g.coordinates[0][0]; lat = g.coordinates[0][1]; }
    else if (g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
      const bb = bboxRings(ambilPoligon(g)[0] || []); lon = (bb[0] + bb[2]) / 2; lat = (bb[1] + bb[3]) / 2;
    }
    if (!Number.isFinite(lon)) lon = toNum(ambilProp(p, ['longitude', 'lon', 'x', 'X']));
    if (!Number.isFinite(lat)) lat = toNum(ambilProp(p, ['latitude', 'lat', 'y', 'Y']));
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return { lon, lat, props: p };
  }

  const api = {
    buatGrid, pusatSel, indeksSel, luasSel,
    transformasiKe, transformasiDari, utmMaju, utmBalik,
    apakahNoData, resampleRaster,
    ambilPoligon, isiPoligon, rasterisasiFitur, rasterisasiGaris, jarakKeSumber, reproyeksiGeoJSON, epsgGeoJSON,
    KANDIDAT_FIELD, deteksiField, deteksiFieldNumerik, nilaiVektorKeGrid,
    statistik, sampelNilai, kuantil, skorAmbang, skorkan,
    hitungModel, batasKelas, klasifikasi,
    luasPerKelas, luasZonaKelas,
    hitungTitikPerSel, kde,
    rocAuc, kurvaLaju, tabelKelasKejadian,
    analisisDampak, indeksPrioritas, emisiKebakaran,
    ahp, RI,
    tulisGeoTIFF,
    parseCSV, keCSV, parseTanggal, tingkatConfidence, normalisasiHotspot, normalisasiTitik, toNum
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KarhutlaCore = api;
})(typeof self !== 'undefined' ? self : this);
