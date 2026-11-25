/* =============================================================================
 * Pemuat data: folder data/ (fetch) dan unggahan pengguna
 * Format: GeoJSON, CSV (titik), Shapefile (.zip), GeoTIFF (.tif/.tiff)
 * Raster besar tidak dibaca penuh: hanya jendela yang menutupi wilayah studi,
 * pada ukuran tereduksi sesuai grid analisis.
 * ===========================================================================*/
(function () {
  'use strict';
  const C = window.KarhutlaCore;
  const URL_GEOTIFF_ESM = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm';
  const URL_SHPJS = 'https://unpkg.com/shpjs@4.0.4/dist/shp.js';

  let _geotiff = null;
  async function pustakaGeoTIFF() {
    if (_geotiff) return _geotiff;
    if (window.GeoTIFF && window.GeoTIFF.fromArrayBuffer) { _geotiff = window.GeoTIFF; return _geotiff; }
    _geotiff = await import(URL_GEOTIFF_ESM);
    return _geotiff;
  }
  function muatSkrip(url) {
    return new Promise((ok, gagal) => {
      const s = document.createElement('script');
      s.src = url; s.onload = ok; s.onerror = () => gagal(new Error('Gagal memuat pustaka ' + url));
      document.head.appendChild(s);
    });
  }
  async function pustakaShp() {
    if (!window.shp) await muatSkrip(URL_SHPJS);
    if (!window.shp) throw new Error('Pustaka shapefile (shpjs) tidak tersedia');
    return window.shp;
  }

  function ekstensi(nama) {
    const m = String(nama || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  /** Membaca GeoTIFF; bila grid diketahui, hanya jendela wilayah studi yang dibaca. */
  async function bacaGeoTIFF(buffer, grid, maksDimensi) {
    const GT = await pustakaGeoTIFF();
    const tiff = await GT.fromArrayBuffer(buffer);
    const img = await tiff.getImage();
    const W = img.getWidth(), H = img.getHeight();
    const bb = img.getBoundingBox();
    const gk = img.getGeoKeys ? (img.getGeoKeys() || {}) : {};
    let epsg = gk.ProjectedCSTypeGeoKey || gk.GeographicTypeGeoKey || 4326;
    if (epsg === 32767) throw new Error('CRS raster tidak standar (user-defined). Ekspor ulang ke EPSG:4326.');
    let noData = null;
    try { noData = img.getGDALNoData(); } catch (e) { noData = null; }
    const nBand = img.getSamplesPerPixel();
    maksDimensi = maksDimensi || 2600;

    let win = [0, 0, W, H], bboxWin = bb.slice();
    const geografis = !C.transformasiKe(epsg) || epsg === 4326 || epsg === 4269 || epsg === 4755;
    const resX = (bb[2] - bb[0]) / W, resY = (bb[3] - bb[1]) / H;
    let tw, th;
    if (grid && geografis) {
      const px0 = Math.max(0, Math.floor((grid.xmin - bb[0]) / resX) - 1);
      const px1 = Math.min(W, Math.ceil((grid.xmax - bb[0]) / resX) + 1);
      const py0 = Math.max(0, Math.floor((bb[3] - grid.ymax) / resY) - 1);
      const py1 = Math.min(H, Math.ceil((bb[3] - grid.ymin) / resY) + 1);
      if (px1 <= px0 || py1 <= py0) throw new Error('Raster tidak bertampalan dengan wilayah studi.');
      win = [px0, py0, px1, py1];
      bboxWin = [bb[0] + px0 * resX, bb[3] - py1 * resY, bb[0] + px1 * resX, bb[3] - py0 * resY];
      const ww = px1 - px0, hh = py1 - py0;
      // target ±2 piksel per sel grid (cukup untuk rata-rata blok), dibatasi maksDimensi
      const targetW = Math.ceil((bboxWin[2] - bboxWin[0]) / grid.dx * 2);
      const targetH = Math.ceil((bboxWin[3] - bboxWin[1]) / grid.dy * 2);
      tw = Math.min(ww, targetW, maksDimensi); th = Math.min(hh, targetH, maksDimensi);
    } else {
      const f = Math.min(1, maksDimensi / Math.max(W, H));
      tw = Math.max(1, Math.round(W * f)); th = Math.max(1, Math.round(H * f));
    }
    const data = await img.readRasters({ window: win, width: tw, height: th, samples: [0], interleave: true, resampleMethod: 'nearest' });
    return {
      nilai: data, lebar: tw, tinggi: th, bbox: bboxWin, epsg, noData,
      info: { lebarAsli: W, tinggiAsli: H, resolusiAsli: [resX, resY], jumlahBand: nBand, epsg, noData,
        dibacaSebagian: (tw < (win[2] - win[0]) || th < (win[3] - win[1])) }
    };
  }

  /** Membaca vektor/titik dari ArrayBuffer/teks sesuai ekstensi. Hasil FeatureCollection lon/lat. */
  async function bacaVektor(isi, namaFile) {
    const eks = ekstensi(namaFile);
    if (eks === 'zip') {
      const shp = await pustakaShp();
      let fc = await shp(isi);
      if (Array.isArray(fc)) {
        // beberapa layer di dalam zip: gabungkan
        fc = { type: 'FeatureCollection', features: fc.reduce((a, x) => a.concat(x.features || []), []) };
      }
      return fc;
    }
    const teks = typeof isi === 'string' ? isi : new TextDecoder('utf-8').decode(isi);
    if (eks === 'csv' || eks === 'txt') {
      const baris = C.parseCSV(teks);
      const features = [];
      for (const b of baris) {
        const t = C.normalisasiTitik(b);
        if (t) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lon, t.lat] }, properties: b });
      }
      return { type: 'FeatureCollection', features };
    }
    const fc = JSON.parse(teks);
    if (Array.isArray(fc)) { // JSON berupa daftar rekaman (mis. unduhan JSON NASA FIRMS)
      const features = [];
      for (const b of fc) { const t = C.normalisasiTitik(b); if (t) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lon, t.lat] }, properties: b }); }
      if (!features.length) throw new Error('JSON tidak berisi koordinat latitude/longitude');
      return { type: 'FeatureCollection', features };
    }
    if (fc.type === 'Feature') return { type: 'FeatureCollection', features: [fc] };
    if (!fc.features) throw new Error('Bukan GeoJSON FeatureCollection');
    const epsg = C.epsgGeoJSON(fc);
    if (epsg !== 4326) C.reproyeksiGeoJSON(fc, epsg);
    return fc;
  }

  /** Muat satu berkas (dari URL atau File). */
  async function muatBerkas(sumber, jenis, grid, maksDimensi) {
    let nama, buffer;
    if (typeof sumber === 'string') {
      nama = sumber;
      const url = sumber.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(url);
      if (!res.ok) { const e = new Error('Berkas tidak ditemukan (HTTP ' + res.status + ')'); e.tidakAda = true; throw e; }
      buffer = await res.arrayBuffer();
    } else {
      nama = sumber.name;
      buffer = await sumber.arrayBuffer();
    }
    const eks = ekstensi(nama);
    if (eks === 'tif' || eks === 'tiff') {
      if (jenis === 'vektor' || jenis === 'titik') throw new Error('Slot ini membutuhkan data vektor/titik, bukan GeoTIFF');
      return { tipe: 'raster', nama, raster: await bacaGeoTIFF(buffer, grid, maksDimensi), ukuranByte: buffer.byteLength };
    }
    if (jenis === 'raster') throw new Error('Slot ini membutuhkan GeoTIFF (.tif)');
    const fc = await bacaVektor(buffer, nama);
    return { tipe: 'vektor', nama, fc, ukuranByte: buffer.byteLength };
  }

  /** Jenis geometri dominan dari FeatureCollection. */
  function jenisGeometri(fc) {
    const hit = {};
    (fc.features || []).slice(0, 500).forEach(f => {
      const t = f.geometry ? f.geometry.type.replace('Multi', '') : 'Kosong';
      hit[t] = (hit[t] || 0) + 1;
    });
    return Object.keys(hit).sort((a, b) => hit[b] - hit[a])[0] || 'Kosong';
  }
  function daftarAtribut(fc) {
    const keys = new Set();
    (fc.features || []).slice(0, 200).forEach(f => Object.keys(f.properties || {}).forEach(k => keys.add(k)));
    return Array.from(keys);
  }

  window.KarhutlaData = { muatBerkas, bacaGeoTIFF, bacaVektor, jenisGeometri, daftarAtribut, ekstensi, pustakaGeoTIFF };
})();
