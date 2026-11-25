# Sumber Data

Tabel yang sama juga tampil di tab **Metodologi** WebGIS. Kolom "Akses" ditulis berdasarkan halaman resmi masing-masing penyedia saat WebGIS disusun (November 2026). Ketentuan akses bisa berubah, jadi cek ulang sebelum mengutip.

| Parameter | Sumber | Resolusi | Akses / lisensi | Tautan |
|---|---|---|---|---|
| Titik api VIIRS S-NPP 375 m, FRP | NASA FIRMS (VNP14IMG) | 375 m, per deteksi | Arsip sejak 20 Jan 2012, unduh lewat Earthdata Login atau kode email; API membutuhkan MAP_KEY gratis | https://firms.modaps.eosdis.nasa.gov/download/ |
| Curah hujan, SPI, HTH, KBDI | CHIRPS Daily v2.0 (CHC UCSB) | 0,05° (±5,6 km), harian | Domain publik; di GEE `UCSB-CHG/CHIRPS/DAILY` | https://www.chc.ucsb.edu/data/chirps |
| Suhu udara, kelembapan, angin | ERA5-Land (ECMWF/Copernicus) | 0,1° (±9 km), per jam | Lisensi Copernicus; di GEE `ECMWF/ERA5_LAND/HOURLY` | https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land |
| NDVI, NDMI, LST Landsat | Landsat 8/9 Collection 2 Level-2 (USGS) | 30 m (termal 100 m) | Domain publik; di GEE `LANDSAT/LC08/C02/T1_L2`, `LANDSAT/LC09/C02/T1_L2` | https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products |
| LST harian (dipakai kelompok) | MODIS MOD11A1 & MYD11A1 v6.1 (LP DAAC) | 1 km, harian | Terbuka; di GEE `MODIS/061/MOD11A1`, `MODIS/061/MYD11A1` | https://doi.org/10.5067/MODIS/MOD11A1.061 · https://doi.org/10.5067/MODIS/MYD11A1.061 |
| Tutupan lahan | KLHK Penutupan Lahan / ESA WorldCover | KLHK 1:250.000; WorldCover 10 m | WorldCover CC BY 4.0 | https://esa-worldcover.org/ |
| Gambut / KHG | Peta KHG KLHK / Peta Lahan Gambut BBSDLP | 1:50.000–1:250.000 | Ketentuan instansi | https://sigap.menlhk.go.id/ |
| Kemiringan lereng | DEMNAS (BIG) | 0,27″ (±8 m) | Gratis dengan akun Ina-Geoportal | https://tanahair.indonesia.go.id/ |
| Jalan, sungai, kanal, permukiman | RBI (BIG) / OpenStreetMap | 1:25.000–1:50.000 / bervariasi | RBI: Ina-Geoportal; OSM: ODbL | https://download.geofabrik.de/asia/indonesia.html |
| Kawasan hutan / konsesi | KLHK (SK Kawasan Hutan) / Bhumi ATR/BPN | bervariasi | Ketentuan instansi | https://bhumi.atrbpn.go.id/ |
| Area bekas terbakar | MODIS MCD64A1 v6.1 / SiPongi KLHK | 500 m, bulanan | Terbuka; di GEE `MODIS/061/MCD64A1` | https://doi.org/10.5067/MODIS/MCD64A1.061 |
| Penduduk | WorldPop | 100 m, tahunan | CC BY 4.0; di GEE `WorldPop/GP/100m/pop` | https://hub.worldpop.org/ |
| Batas administrasi | BIG (Ina-Geoportal) / BPS | kab/kota | Ketentuan BIG | https://tanahair.indonesia.go.id/ |

## Cara memperoleh data yang belum ada

**Titik api 2012–2025 (bila berkas kelompok belum mencakup 2023–2025).** Buka FIRMS *Archive Download*, lalu pilih *Create New Request*. Isi sumber **VIIRS S-NPP 375m**, wilayah *Country: Indonesia* atau poligon Kaltim, rentang tanggal 2012-01-20 s.d. 2025-12-31, dan format **CSV**. FIRMS akan mengirim tautan unduhan. CSV ini dapat diunggah langsung ke slot "Titik api" atau disimpan sebagai `data/titik_api_firms.csv`, lalu nama berkas di `config.js` diganti. Arsip *standard processing* (SV-C2) lebih disarankan daripada NRT untuk analisis historis. Untuk tahun yang hanya tersedia sebagai NRT, gabungkan kedua berkas.

**Area bekas terbakar dan penduduk.** Jalankan `docs/GEE_data_tambahan.js` di Code Editor GEE. Skrip menghasilkan `area_terbakar_MCD64A1_2023_2025.tif` (1 = terbakar) dan `penduduk_WorldPop_2020_1km.tif`. Sebagai alternatif area terbakar, unduh poligon luas kebakaran dari SiPongi KLHK bila tersedia untuk Kaltim. Poligon dapat diunggah langsung karena slot ini menerima raster maupun vektor.

**Kanal/drainase.** Di QGIS, gunakan plugin *QuickOSM* dengan kunci `waterway` dan nilai `canal`, `ditch`, `drain` pada extent AOI. Ekspor hasilnya sebagai GeoJSON EPSG:4326 ke `data/kanal.geojson`, lalu isi `kanal.file` di config. Jika kelompok punya data kanal dari BRGM/KLHK, data itu lebih lengkap untuk kanal di lahan gambut. Cakupan kanal di OSM tidak merata dan sebaiknya disebut sebagai keterbatasan.

**Faktor emisi.** Ambil nilai MB·Cf (t bahan kering/ha) dan Gef (g/kg bahan kering) dari IPCC 2006 *Guidelines for National GHG Inventories* Vol. 4 Bab 2, Tabel 2.4 (konsumsi bahan bakar) dan Tabel 2.5 (faktor emisi). Untuk gambut, gunakan IPCC 2013 *Wetlands Supplement* Bab 2. Masukkan nilainya di tab Dampak bersama rujukannya. WebGIS tidak menyediakan nilai bawaan.

## Rujukan yang dipakai di WebGIS

* Simarmata, N. dkk. (2025). *JGEL* 9(1):78–97. doi:10.22236/jgel.v9i1.14520. Dipakai sebagai ambang skor LST 20/25/30/35 °C, mengacu Jaiswal dkk. (2002).
* Saaty, T.L. (1980). *The Analytic Hierarchy Process*. McGraw-Hill. Dipakai untuk skala 1–9, indeks acak (RI), dan CR ≤ 0,10.
* Hosmer, D.W. & Lemeshow, S. (2000). *Applied Logistic Regression*, 2nd ed. Wiley. Dipakai untuk kategori nilai AUC.
* IPCC (2006). *Guidelines for National Greenhouse Gas Inventories*, Vol. 4, Bab 2, Persamaan 2.27. Dipakai untuk rumus emisi kebakaran.
* Rujukan bobot kelompok mengikuti slide pembobotan Kelompok 2 (Tiwari dkk., 2026; Farandika & Hartono).
