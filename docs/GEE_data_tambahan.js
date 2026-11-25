/* =============================================================================
 * GOOGLE EARTH ENGINE — DATA TAMBAHAN UNTUK WEBGIS KARHUTLA KALTIM
 * GD4103 SIG · Kelompok 2 | K-02 · ITB
 *
 * Menghasilkan dua GeoTIFF (EPSG:4326) ke Google Drive, folder "WebGIS_Karhutla":
 *   1. area_terbakar_MCD64A1_2023_2025.tif  -> slot "Area bekas terbakar aktual"
 *        1 = terbakar minimal sekali pada 2023–2025, 0 = tidak terbakar
 *        Sumber: MODIS MCD64A1 v6.1 Burned Area, 500 m, bulanan
 *        (Giglio dkk., doi:10.5067/MODIS/MCD64A1.061)
 *   2. penduduk_WorldPop_2020_1km.tif        -> slot "Jumlah penduduk per piksel"
 *        jumlah jiwa per piksel ±1 km (dijumlahkan dari WorldPop 100 m)
 *        Sumber: WorldPop Global Project Population Data 2020, 100 m
 *
 * Wilayah ekspor berupa kotak pembatas; WebGIS memotongnya sendiri dengan
 * batas AOI_Kaltim_PL_Kota.geojson, jadi tidak perlu mengunggah AOI ke GEE.
 *
 * Setelah selesai: Tasks -> RUN kedua ekspor -> unduh dari Drive -> salin ke
 * folder data/ lalu isi nama berkasnya di js/config.js:
 *   penduduk:      { ..., file: 'data/penduduk_WorldPop_2020_1km.tif' }
 *   area_terbakar: { ..., file: 'data/area_terbakar_MCD64A1_2023_2025.tif' }
 * atau unggah langsung lewat tab Data.
 * ===========================================================================*/

var wilayah = ee.Geometry.Rectangle([113.8, -2.6, 119.1, 2.6], 'EPSG:4326', false);
Map.centerObject(wilayah, 7);

/* ---------------------------------------------------------------- 1. MCD64A1 */
// BurnDate: 0 = tidak terbakar, 1–366 = hari terbakar, -1 = tidak terpetakan, -2 = air.
// Periode 2023–2025 = periode PENGUJIAN, sehingga hanya dipakai untuk validasi
// tambahan dan estimasi emisi, tidak untuk membangun model.
function areaTerbakar(mulai, akhir) {
  return ee.ImageCollection('MODIS/061/MCD64A1')
    .filterDate(mulai, akhir)
    .select('BurnDate')
    .map(function (img) { return img.gt(0); })
    .max()
    .unmask(0)
    .rename('terbakar')
    .toByte()
    .clip(wilayah);
}
var terbakarUji = areaTerbakar('2023-01-01', '2026-01-01');

var jumlahBulan = ee.ImageCollection('MODIS/061/MCD64A1').filterDate('2023-01-01', '2026-01-01').size();
print('Jumlah citra bulanan MCD64A1 2023–2025 yang tersedia:', jumlahBulan,
      '(maksimum 36; bila kurang, data bulan terakhir belum dirilis)');
var luasHa = terbakarUji.multiply(ee.Image.pixelArea()).divide(1e4).reduceRegion({
  reducer: ee.Reducer.sum(), geometry: wilayah, scale: 500, maxPixels: 1e10
});
print('Luas terbakar MCD64A1 2023–2025 dalam kotak pembatas (ha, belum dipotong AOI):', luasHa);
Map.addLayer(terbakarUji.selfMask(), { palette: ['#111827'] }, 'Area terbakar MCD64A1 2023–2025');

Export.image.toDrive({
  image: terbakarUji,
  description: 'area_terbakar_MCD64A1_2023_2025',
  folder: 'WebGIS_Karhutla',
  fileNamePrefix: 'area_terbakar_MCD64A1_2023_2025',
  region: wilayah,
  scale: 500,
  crs: 'EPSG:4326',
  maxPixels: 1e10,
  fileFormat: 'GeoTIFF'
});

/* ----------------------------------------------------------------- 2. WorldPop */
// WorldPop GP 100 m tersedia 2000–2020. Dijumlahkan ke ±1 km agar berkas kecil;
// WebGIS lalu menjumlahkannya lagi ke sel grid 0,01°.
var pop100 = ee.ImageCollection('WorldPop/GP/100m/pop')
  .filter(ee.Filter.eq('country', 'IDN'))
  .filter(ee.Filter.eq('year', 2020))
  .first()
  .select('population');
var pop1km = pop100
  .reduceResolution({ reducer: ee.Reducer.sum(), maxPixels: 1024 })
  .reproject({ crs: 'EPSG:4326', scale: 1000 })
  .rename('penduduk')
  .toFloat()
  .clip(wilayah);
print('Total penduduk WorldPop 2020 dalam kotak pembatas (jiwa, belum dipotong AOI):',
  pop1km.reduceRegion({ reducer: ee.Reducer.sum(), geometry: wilayah, scale: 1000, maxPixels: 1e10 }));
Map.addLayer(pop1km, { min: 0, max: 500, palette: ['#fff5eb', '#fd8d3c', '#7f2704'] }, 'Penduduk WorldPop 2020 (±1 km)', false);

Export.image.toDrive({
  image: pop1km,
  description: 'penduduk_WorldPop_2020_1km',
  folder: 'WebGIS_Karhutla',
  fileNamePrefix: 'penduduk_WorldPop_2020_1km',
  region: wilayah,
  scale: 1000,
  crs: 'EPSG:4326',
  maxPixels: 1e10,
  fileFormat: 'GeoTIFF'
});
