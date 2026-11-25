# Kesesuaian Fitur dengan Permintaan dan Proposal

Status ditulis apa adanya. "Ada" berarti fitur berjalan pada pengujian otomatis dengan data sintetis. "Butuh data" berarti kode sudah tersedia, tetapi hasil baru muncul setelah datanya dimuat.

| Kebutuhan | Status | Letak di WebGIS | Letak di kode |
|---|---|---|---|
| Judul, subjudul, identitas mata kuliah/kelompok/ITB | Ada | header | `index.html`, `config.js > aplikasi` |
| Antarmuka berbahasa Indonesia | Ada | seluruh halaman | – |
| Peta dominan, tidak kecil | Ada | peta mengisi sisa layar; panel bisa disembunyikan (tombol **Panel**) | `css/style.css .tata` |
| Dashboard ringkasan: jumlah titik api, luas bahaya tinggi, kab/kota tertinggi, area terbakar, validasi | Ada | tab Ringkasan | `panel.js > segarkanDashboard` |
| Grafik tren tahunan (diwarnai per periode), musiman, per kab/kota, distribusi kelas | Ada | tab Ringkasan | Chart.js |
| Layer parameter (cuaca, curah hujan, NDVI, NDMI, LST, tutupan lahan, gambut, lereng, kanal, aksesibilitas, kawasan hutan, kerapatan, fasilitas, titik api) | Ada / kanal butuh data | tab Layer, grup 1 | `peta.js > LAPISAN` |
| Layer hasil model (5 kelas, indeks kontinu, kerapatan titik api periode tampilan, FRP, model poligon lama) | Ada | tab Layer, grup 2 | `peta.js > renderKhusus` |
| Layer analisis dampak (gambut, hutan, permukiman/fasilitas, prioritas, area terbakar) | Ada / area terbakar butuh data | tab Layer, grup 3 | `peta.js > renderKhusus` |
| Tampilan nilai asli atau skor 1–5 per parameter | Ada | tab Layer, pilihan Nilai/Skor | `peta.js > renderGridSkor` |
| Transparansi per layer | Ada | penggeser di tiap layer | `KW.aturOpasitas` |
| Layer aktif terakhir tampil paling atas (tidak terkunci) | Ada | – | `peta.js > pane/keDepan` |
| Legenda dinamis | Ada | kanan bawah peta, bisa dilipat | `KW.segarkanLegenda` |
| Pop-up informatif (sel: nilai + skor semua parameter; titik api: tanggal, jam, satelit, confidence, FRP, brightness, kab/kota, kelas; kab/kota: luas per kelas dan dampak) | Ada | klik peta | `peta.js > klikPeta, popupHotspot, popupZona` |
| Pencarian kab/kota dan koordinat | Ada | kotak cari di atas peta | `pasangPencarian` |
| Tombol kembali ke extent | Ada | ikon rumah | `KW.keExtent` |
| Filter tahun, bulan, periode (preset historis/pengembangan/pengujian), animasi tahunan | Ada | panel periode di atas peta | `pasangKontrolPeriode` |
| Filter kelas bahaya | Ada | centang kelas di layer "Tingkat bahaya" | `S.filter.kelasTampil` |
| Pemodelan langsung: bobot kelompok, bobot parameter, aturan skor, batas kelas, periode | Ada | tab Model | `panel.js > bangunPanelModel` |
| Kalkulator AHP + uji konsistensi CR | Ada | tab Model | `core.js > ahp` |
| Simpan/muat pengaturan model | Ada | tab Model (JSON) | `ekspor.js > unduhPengaturan` |
| Pemisahan periode: pengembangan 2015–2022, pengujian 2023–2025 | Ada | tab Model > Periode | `app.js > siapkanKerapatanModel, hitungValidasi` |
| Validasi independen: ROC/AUC, kurva laju prediksi, % titik api di kelas tinggi, rasio frekuensi | Ada (butuh titik api 2023–2025) | tab Validasi | `core.js > rocAuc, kurvaLaju, tabelKelasKejadian` |
| Status "Belum divalidasi" bila data uji tidak ada | Ada | tab Validasi, KPI Ringkasan | `panel.js > bangunPanelValidasi` |
| Analisis dampak: gambut, kawasan hutan per fungsi, permukiman, fasilitas, penduduk | Ada / penduduk butuh data | tab Dampak | `core.js > analisisDampak` |
| Pembedaan "berpotensi terdampak" vs "sudah terbakar" | Ada | tab Dampak (dua blok terpisah), legenda | – |
| Estimasi emisi (bila data ada) | Ada, butuh area terbakar + faktor emisi | tab Dampak | `core.js > emisiKebakaran` |
| Prioritas mitigasi per kab/kota | Ada | tab Dampak, Ringkasan, layer prioritas | `core.js > indeksPrioritas` |
| Statistik dan metodologi | Ada | tab Dampak, Metodologi | `panel.js > bangunPanelMetodologi` |
| Unduh CSV, GeoJSON, GeoTIFF, PNG, PDF | Ada | tab Data | `ekspor.js` |
| Unggah GeoJSON, CSV, SHP (.zip), GeoTIFF | Ada | tab Data | `data.js` |
| Daftar data terintegrasi vs masih dibutuhkan | Ada | tab Data, `README.md` bagian 4 | – |
| Instruksi lokal dan deployment URL stabil | Ada | `README.md` bagian 2 dan 6 | – |
| Tidak ada data/hasil fiktif | Dipatuhi | angka hanya dihitung dari data yang dimuat; tanpa data ditulis "Belum ada data" | – |
| Tidak menjadikan HYSPLIT/PM2.5 produk utama | Dipatuhi | tidak ada modul dispersi asap | – |
