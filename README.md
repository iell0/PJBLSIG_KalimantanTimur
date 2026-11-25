# WebGIS Bahaya dan Dampak Karhutla Kalimantan Timur

**Sistem Informasi Geografis untuk Pemodelan Bahaya Kebakaran Hutan dan Lahan**
GD4103 Sistem Informasi Geografis · Kelompok 2 | K-02 · Institut Teknologi Bandung

WebGIS ini adalah situs statis (HTML, CSS, JavaScript) tanpa server aplikasi. Semua perhitungan, yaitu resampling parameter ke grid analisis, skoring 1–5, weighted overlay, klasifikasi, validasi ROC/AUC, overlay dampak, dan indeks prioritas, dijalankan di peramban dari data yang ada di folder `data/` atau data yang diunggah pengguna. Tidak ada angka hasil yang ditanam di kode. Jika suatu data belum tersedia, WebGIS menulis "Belum ada data" atau "Belum divalidasi" dan tidak mengisinya dengan contoh.

---

## 1. Struktur folder

```
webgis-karhutla/
├── index.html            halaman utama (header, rel menu, panel, peta)
├── css/style.css         tampilan
├── js/
│   ├── config.js         SATU-SATUNYA file yang perlu diedit: nama berkas, bobot, aturan skor, periode
│   ├── core.js           mesin analisis murni (grid, CRS, rasterisasi, skoring, model, ROC, KDE, dampak, AHP, GeoTIFF)
│   ├── data.js           pembaca GeoJSON / CSV / Shapefile .zip / GeoTIFF
│   ├── app.js            alur: muat → grid → skor → model → validasi → dampak → prioritas
│   ├── peta.js           Leaflet: basemap, 3 kelompok layer, legenda, pop-up, pencarian, time slider
│   ├── panel.js          tab Ringkasan, Layer, Model, Validasi, Dampak, Metodologi, Data
│   └── ekspor.js         unduh CSV, GeoJSON, GeoTIFF, PNG, PDF, JSON pengaturan
├── data/                 taruh data kelompok di sini (lihat data/BACA_SAYA.md)
├── docs/
│   ├── SUMBER_DATA.md         sumber, resolusi, lisensi, dan cara memperoleh data yang belum ada
│   ├── KESESUAIAN_FITUR.md    pemetaan permintaan/KAK → fitur dan lokasi kode
│   └── GEE_data_tambahan.js   skrip GEE untuk area terbakar MCD64A1 dan penduduk WorldPop
└── tests/uji_core.js     uji otomatis mesin analisis (node tests/uji_core.js)
```

## 2. Menjalankan secara lokal

Peramban tidak mengizinkan halaman yang dibuka langsung dari berkas (`file://`) membaca isi folder `data/`. Jadi WebGIS harus dibuka lewat server lokal. Pilih salah satu cara berikut.

**VS Code + Live Server.** Buka folder `webgis-karhutla` di VS Code, pasang ekstensi *Live Server*, klik kanan `index.html` → *Open with Live Server*.

**Python.** Dari terminal di dalam folder `webgis-karhutla`:

```bash
python -m http.server 8000
```

lalu buka `http://localhost:8000`.

**Node.js.** `npx serve .` lalu buka alamat yang ditampilkan.

Koneksi internet diperlukan untuk memuat pustaka dari CDN (Leaflet 1.9.4, Leaflet.markercluster 1.5.3, Chart.js 4.4.1, geotiff.js 2.1.3, shpjs 4.0.4, html2canvas 1.4.1, jsPDF 2.5.1) dan basemap. Pustaka GeoTIFF, shapefile, PNG, dan PDF baru dimuat ketika dibutuhkan.

Saat dibuka, WebGIS memuat seluruh berkas yang tercantum di `js/config.js`, menghitung model, lalu menampilkan notifikasi berapa data yang berhasil dimuat. Status tiap berkas ada di tab **Data**.

## 3. Menyiapkan data

Salin data kelompok ke folder `data/` dengan nama yang sama seperti di WebGIS lama. Daftar lengkapnya ada di `data/BACA_SAYA.md`. Jika nama berkas atau nama atribut berbeda, ubah di `js/config.js` bagian `data`. Contohnya:

```js
gambut: { label: 'Lahan gambut / KHG', jenis: 'vektor', file: 'data/KHG_Kaltim.geojson', field: 'KEDALAMAN' },
```

`field: 'auto'` berarti atribut dideteksi otomatis dari daftar nama umum (skor, kelas, gridcode, DN, FUNGSIKWS, WADMKK, dan seterusnya). Atribut juga bisa dipilih langsung di tab Data tanpa mengedit kode.

Ketentuan format:

* **GeoTIFF** satu band, EPSG:4326, EPSG:3857, atau UTM WGS 84 (zona 49/50/51 N/S). Nilai noData sebaiknya diset (GDAL_NODATA). Raster besar tidak dibaca penuh: hanya jendela wilayah studi pada ±2 piksel per sel grid.
* **GeoJSON** EPSG:4326 (atau UTM/3857 bila properti `crs` tercantum; akan diproyeksikan ulang).
* **CSV titik** berkolom `latitude` dan `longitude` (atau lat/lon, y/x). CSV arsip NASA FIRMS dapat dipakai langsung, dengan kolom `acq_date`, `acq_time`, `confidence`, `frp`, `bright_ti4`, `bright_ti5`, `satellite`, `instrument`, dan `daynight` dibaca otomatis.
* **Shapefile** dikemas sebagai satu berkas `.zip` (berisi .shp, .shx, .dbf, .prj).

Berkas yang diunggah lewat tab Data hanya tersimpan selama halaman terbuka. Untuk dipakai permanen, salin ke `data/` dan isi namanya di `config.js`.

## 4. Data yang sudah terintegrasi dan yang masih dibutuhkan

Tabel ini disusun dari nama berkas pada WebGIS lama kelompok. Status sesungguhnya baru diketahui setelah berkas disalin ke `data/` dan WebGIS dijalankan (tab Data).

| Slot | Berkas | Status | Catatan |
|---|---|---|---|
| Batas kab/kota | `AOI_Kaltim_PL_Kota.geojson` | ada di kelompok | dipakai sebagai mask dan zona statistik |
| Titik api VIIRS | `titik_api_firms.geojson` | ada di kelompok | **cek rentang tahunnya**: validasi butuh 2023–2025, model butuh 2015–2022 |
| Cuaca (KBDI/SPI/HTH/DC) | `PARAMETER CUACA 2015-20221.tif` | ada di kelompok | arah skor diasumsikan "nilai tinggi = bahaya tinggi" [ASUMSI] |
| Curah hujan | `Curah Hujan 2015-20221.tif` | ada di kelompok | bobot 0 bawaan agar tidak dihitung ganda dengan SPI/HTH |
| NDVI | `ndvi.tif` | ada di kelompok | |
| NDMI | `param_ndmi.geojson` | ada di kelompok | |
| LST | `LST_Gabungan_Kaltim_2015_2022.tif` | ada di kelompok | skor ambang 20/25/30/35 °C (Simarmata dkk., 2025) |
| Tutupan lahan | `tutupan_lahan.tif` | ada di kelompok | **kode kelas dan skor masih [ASUMSI]**: sesuaikan `label` dan `peta` di config |
| Gambut | `parameter_gambut.geojson` | ada di kelompok | |
| Lereng | `param_slope.geojson` | ada di kelompok | |
| Aksesibilitas | `aksesibilitas.tif` | ada di kelompok | diasumsikan berisi jarak (makin dekat makin bahaya) [ASUMSI] |
| Kawasan hutan/konsesi | `param_kawasan_hutan.geojson` | ada di kelompok | skor per fungsi kawasan [ASUMSI] |
| Kerapatan titik api (berkas) | `kerapatan_KDE.tif` | ada di kelompok | **tidak dipakai bawaan**; model menghitung KDE sendiri dari titik api 2015–2022 agar validasi independen |
| Fasilitas/permukiman | `dampak_fasilitas.geojson` | ada di kelompok | analisis dampak |
| Model poligon lama | `model_bahaya_api.geojson` | ada di kelompok | hanya pembanding, bukan hasil model WebGIS |
| **Kanal/drainase** | – | **belum ada** | OSM `waterway=canal/ditch/drain` atau data BRGM; garis diubah jadi jarak |
| **Penduduk** | – | **belum ada** | WorldPop 100 m (skrip `docs/GEE_data_tambahan.js`) |
| **Area bekas terbakar** | – | **belum ada** | MCD64A1 (skrip GEE) atau peta luas kebakaran KLHK/SiPongi; untuk validasi tambahan dan emisi |
| **Faktor emisi** | – | **belum ada** | isi dari IPCC 2006 Vol. 4 Bab 2 Tabel 2.4–2.5 / IPCC 2013 Wetlands Supplement di tab Dampak |

Cara memperoleh tiap data yang belum ada dijelaskan di `docs/SUMBER_DATA.md`.

## 5. Ringkasan cara kerja model

```
Bahaya = Σ_k  W_k · S_k ,   S_k = Σ_i (w_i · s_i) / Σ_i w_i
```

`W_k` adalah bobot kelompok dari AHP keseluruhan kelompok, yaitu Cuaca 38,6; Tutupan lahan & fisik 22,5; Kerapatan titik api 22,5; Indeks vegetasi 8,2; LST 8,2 (CR = 0,006). `w_i` adalah bobot parameter di dalam kelompok, dan `s_i` adalah skor 1–5. Jika suatu parameter tidak bernilai di sebuah sel, bobotnya dikeluarkan dari penyebut. Jika satu kelompok tidak punya data sama sekali, bobot kelompok lain dinormalisasi ulang, dan hal ini ditampilkan di Ringkasan.

Indeks dikelompokkan menjadi lima kelas: interval sama (bawaan), kuantil, atau batas manual. Kelas Tinggi dan Sangat Tinggi dipakai sebagai "bahaya tinggi" pada analisis dampak, dan ambang ini bisa diubah.

Validasi menggunakan titik api 2023–2025 yang **tidak** dipakai membangun model. Kerapatan titik api (salah satu parameter) dihitung dari titik api 2015–2022 saja. Ukuran yang dilaporkan: ROC/AUC berbasis sel, kurva laju prediksi, persentase titik api uji yang jatuh di kelas tinggi, dan rasio frekuensi per kelas.

Grid analisis berupa geografis 0,01° (±1,1 km). Overlay raster ditampilkan sebagai gambar di atas peta Web Mercator. Pada lintang Kalimantan Timur (±2,6°), perbedaan skala lintang Mercator kurang dari 0,1%, sehingga pergeseran tampilan dapat diabaikan.

## 6. Deployment agar dapat diakses melalui URL stabil

### GitHub Pages (disarankan)

1. Buat repositori baru di GitHub, misalnya `webgis-karhutla-kaltim`, lalu unggah seluruh isi folder ini (termasuk `data/`).
2. Buka *Settings → Pages → Build and deployment → Source: Deploy from a branch*, pilih branch `main` dan folder `/ (root)`, lalu *Save*.
3. Setelah 1–2 menit, situs tersedia di `https://<nama-akun>.github.io/webgis-karhutla-kaltim/`.

Batasannya: GitHub menolak berkas lebih dari 100 MB, dan situs Pages dianjurkan di bawah 1 GB. Titik api GeoJSON 2012–2025 bisa sangat besar. Simpan sebagai CSV (lebih kecil sekitar 3–5×) lalu ubah `hotspot.file` di config menjadi `data/titik_api_firms.csv`. Berkas yang disimpan dengan Git LFS **tidak** disajikan oleh GitHub Pages.

### Netlify (alternatif tanpa Git)

Masuk ke <https://app.netlify.com/drop>, lalu seret folder `webgis-karhutla` ke halaman itu. Netlify langsung memberi URL `https://<nama-acak>.netlify.app`, yang bisa diganti di *Site configuration → Change site name*.

Kedua layanan menyajikan HTTPS, sehingga tidak ada masalah *mixed content* dengan CDN dan basemap.

## 7. Pengujian

`node tests/uji_core.js` menjalankan 67 uji mesin analisis: grid, transformasi UTM bolak-balik, rasterisasi, resampling, skoring, weighted overlay, klasifikasi, AHP (contoh Saaty), ROC/AUC, KDE, dampak, CSV, dan GeoTIFF yang diverifikasi dengan pustaka `tifffile`. Semuanya lulus.

Antarmuka sudah diuji otomatis di Chrome *headless* menggunakan data **sintetis** (bukan data Kaltim) dan pustaka pengganti (Leaflet tiruan), karena lingkungan pengembangan tidak memiliki akses internet. Yang diperiksa:

* semua layer dinyalakan dan dimatikan, termasuk opasitas, mode nilai/skor, dan saring kelas;
* klik peta dan pop-up sel, titik api, serta kab/kota;
* pencarian nama dan koordinat, tombol home, dan lipat legenda;
* empat preset periode, slider tahun/bulan, dan animasi;
* seluruh kendali tab Model: bobot, normalisasi, AHP, skoring, kelas, periode, KDE, *confidence*, hitung ulang, reset, simpan/muat JSON;
* unggahan GeoJSON garis dan poligon, serta penolakan format yang salah;
* pemilihan atribut;
* kesepuluh tombol unduhan, dengan GeoTIFF diverifikasi terbaca;
* kalkulator emisi;
* panel buka-tutup dan layar 1100 px.

Tidak ada galat JavaScript pada pengujian terakhir.

**Yang belum teruji:** tampilan dengan Leaflet, markercluster, html2canvas, dan jsPDF asli, serta pembacaan GeoTIFF dan data asli kelompok. Jalankan lokal dengan data kelompok, buka setiap tab, dan periksa tab Data. Jika ada berkas berstatus "gagal", pesan galatnya tertulis di bawah nama berkas.

## 8. Hal yang wajib dicek kelompok sebelum dipresentasikan

Nilai bertanda `[ASUMSI]` di `js/config.js` adalah nilai awal dari pengembang, bukan dari penelitian kelompok:

* kode kelas dan skor tutupan lahan;
* arah skor parameter cuaca dan aksesibilitas;
* skor fungsi kawasan hutan;
* bobot parameter di dalam kelompok (bawaan sama rata);
* bandwidth KDE 5 km.

Ganti nilai-nilai ini dengan tabel skor kelompok. Semuanya dapat diubah di tab Model lalu disimpan sebagai JSON.
