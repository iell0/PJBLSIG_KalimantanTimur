/* =============================================================================
 * KONFIGURASI WEBGIS BAHAYA DAN DAMPAK KARHUTLA KALIMANTAN TIMUR
 * GD4103 Sistem Informasi Geografis · Kelompok 2 | K-02 · ITB
 *
 * File ini adalah satu-satunya tempat yang perlu diubah ketika:
 *   - nama/lokasi file data berubah,
 *   - nama atribut pada data berbeda dari yang terdeteksi otomatis,
 *   - bobot AHP, aturan skoring, batas kelas, atau periode analisis diperbarui.
 *
 * Semua nilai di bawah dapat juga diubah langsung dari antarmuka WebGIS
 * (tab Model), lalu disimpan sebagai file JSON pengaturan.
 *
 * Penandaan sumber:
 *   [PROPOSAL]  = tercantum di proposal Kelompok 2
 *   [KELOMPOK]  = hasil kerja kelompok (slide pembobotan AHP keseluruhan, CR = 0,006)
 *   [LITERATUR] = dari rujukan yang disebutkan
 *   [ASUMSI]    = nilai awal usulan pengembang; WAJIB dicek/diganti kelompok
 * ===========================================================================*/

window.KARHUTLA_CONFIG = {

  aplikasi: {
    nama: 'WEBGIS KERAWANAN DAN DAMPAK KARHUTLA DI KALIMANTAN TIMUR',
    subjudul: 'Sistem Informasi Geografis untuk Pemodelan Bahaya Kebakaran Hutan dan Lahan',
    identitas: ['GD4103 Sistem Informasi Geografis', 'Kelompok 2 | K-02', 'Institut Teknologi Bandung']
  },

  /* Wilayah studi [PROPOSAL]: 7 kabupaten + 3 kota, luas 126.951,76 km² (BPS Kaltim, 2025) */
  wilayah: {
    nama: 'Provinsi Kalimantan Timur',
    luasResmiKm2: 126951.76,
    kabKota: ['Paser', 'Kutai Barat', 'Kutai Kartanegara', 'Kutai Timur', 'Berau',
      'Penajam Paser Utara', 'Mahakam Ulu', 'Balikpapan', 'Samarinda', 'Bontang'],
    // Dipakai hanya bila file batas wilayah belum tersedia
    bboxCadangan: [113.75, -2.65, 119.15, 2.65],
    pusatPeta: [0.45, 116.4],
    zoomAwal: 7
  },

  /* Grid analisis: semua parameter diresampling ke grid geografis yang sama.
   * 0,01° ≈ 1,1 km di ekuator, sesuai resolusi parameter tersedia (MODIS LST 1 km,
   * ERA5-Land ±9 km, CHIRPS ±5,6 km) dan skala provinsi. */
  grid: {
    resolusiDerajat: 0.01,
    maksDimensiBacaRaster: 2600   // raster besar dibaca dalam ukuran tereduksi (tidak dimuat penuh)
  },

  /* Pembagian temporal [PROPOSAL] */
  periode: {
    klimatologi: [1981, 2022],
    historis: [2012, 2014],
    pengembangan: [2015, 2022],
    pengujian: [2023, 2025],
    semuaHotspot: [2012, 2025]
  },

  hotspot: {
    // Tingkat kepercayaan minimum: 0 = semua, 1 = nominal ke atas, 2 = high saja
    // VIIRS: l/n/h; MODIS: 0–100 (<30 rendah, 30–79 nominal, ≥80 tinggi)
    confidenceMinimum: 1,
    bandwidthKdeKm: 5,             // bandwidth Gaussian untuk kerapatan titik api [ASUMSI]
    sumberKerapatanModel: 'hitung' // 'hitung' = dari hotspot periode pengembangan; 'file' = kerapatan_KDE.tif
  },

  /* ---------------------------------------------------------------------------
   * SLOT DATA
   * Nama file mengikuti file yang sudah dipakai kelompok di folder data/.
   * file: null berarti data belum tersedia -> unggah lewat tab Data.
   * jenis: 'raster' (GeoTIFF), 'vektor' (GeoJSON/SHP zip), 'titik' (GeoJSON/CSV)
   * ------------------------------------------------------------------------- */
  data: {
    batas:          { label: 'Batas administrasi kab/kota (AOI)', jenis: 'vektor', file: 'data/Batas_Kabkot_Kaltim.geojson',
                      fieldNama: 'auto' },
    hotspot:        { label: 'Titik api VIIRS SNPP (NASA FIRMS)', jenis: 'titik', file: 'data/Titik_Hotspot_Kaltim_2015_2022.geojson' },
    cuaca:          { label: 'Parameter cuaca & kekeringan (KBDI/SPI/HTH/DC)', jenis: 'raster', file: 'data/PARAMETER CUACA 2015-20221.tif' },
    curah_hujan:    { label: 'Curah hujan 2015–2022', jenis: 'raster', file: 'data/Curah Hujan 2015-20221.tif', satuan: 'mm' },
    ndvi:           { label: 'NDVI', jenis: 'raster', file: 'data/NDVI_1.tif', field: 'auto' },
    ndmi:           { label: 'NDMI', jenis: 'raster', file: 'data/NDMI_1.tif', field: 'auto' },
    lst:            { label: 'LST siang (MODIS Terra + Aqua)', jenis: 'raster', file: 'data/LST_Gabungan_Kaltim_2015_2022.tif', satuan: '°C' },
    tutupan_lahan:  { label: 'Tutupan lahan', jenis: 'raster', file: 'data/tutlah_2.tif', kategorikal: true },
    gambut:         { label: 'Lahan gambut / KHG', jenis: 'raster', file: 'data/gambut_2.tif', field: 'auto' },
    slope:          { label: 'Kemiringan lereng', jenis: 'raster', file: 'data/SLOPE_1.tif', field: 'auto' },
    aksesibilitas:  { label: 'Aksesibilitas (jarak jalan)', jenis: 'raster', file: 'data/comp_jln_new.tif' },
    kawasan_hutan:  { label: 'Kawasan hutan', jenis: 'raster', file: 'data/3_hutan.tif', field: 'auto' },
    kerapatan_kde:  { label: 'Kerapatan titik api (file KDE)', jenis: 'raster', file: 'data/KDE_fix.tif' },
    fasilitas:      { label: 'Permukiman & fasilitas', jenis: 'titik', file: 'data/dampak_fasilitas.geojson' },
    penduduk:       { label: 'Jumlah penduduk per piksel (mis. WorldPop)', jenis: 'raster', file: null, satuan: 'jiwa' },
    model_poligon:  { label: 'Model bahaya versi poligon (lama)', jenis: 'vektor', file: 'data/model_bahaya_api.geojson' }
  },

  /* ---------------------------------------------------------------------------
   * MODEL BAHAYA: WEIGHTED OVERLAY DUA TINGKAT
   *   Bahaya = Σ (bobot_kelompok × Σ(bobot_parameter × skor_parameter) / Σ bobot_parameter)
   * Skor setiap parameter 1–5 (1 = bahaya sangat rendah, 5 = sangat tinggi).
   *
   * Bobot kelompok [KELOMPOK]: slide "Keseluruhan Pembobotan" (AHP, λmax = 5,026,
   * CI = 0,0066, CR = 0,006). Rujukan yang dicantumkan kelompok: Tiwari dkk. (2026),
   * Farandika & Hartono.
   * Bobot parameter di dalam kelompok: [ASUMSI] sama rata, kecuali dinyatakan lain.
   *
   * Aturan skoring (aturan.metode):
   *   'otomatis' : nilai 1–5 dipakai langsung; selain itu kuantil 5 kelas
   *   'ambang'   : batas: [b1,b2,b3,b4]; arah 'naik' (nilai tinggi = bahaya tinggi) / 'turun'
   *   'kuantil'  : 5 kelas berjumlah piksel sama; arah naik/turun
   *   'langsung' : nilai sudah berupa skor 1–5
   *   'kategori' : peta: { nilaiKelas: skor }
   *   'keberadaan': skorAda / skorTidak (mis. ada gambut = 5)
   * Untuk data vektor, nilai diambil dari atribut 'field' (auto = deteksi otomatis);
   * piksel di luar poligon diberi 'skorDiLuar' (null = tidak ada data).
   * ------------------------------------------------------------------------- */
  model: {
    kelompok: [
      {
        id: 'cuaca', nama: 'Cuaca & kekeringan', bobot: 38.6,
        parameter: [
          { id: 'cuaca', nama: 'Parameter cuaca (KBDI/SPI/HTH/DC)', slot: 'cuaca', bobot: 1,
            aturan: { metode: 'otomatis', arah: 'naik' }, catatan: '[ASUMSI] arah naik: nilai indeks cuaca tinggi = lebih kering' },
          { id: 'curah_hujan', nama: 'Curah hujan', slot: 'curah_hujan', bobot: 0,
            aturan: { metode: 'kuantil', arah: 'turun' },
            catatan: 'Bobot 0 secara bawaan agar tidak dihitung ganda dengan SPI/HTH di parameter cuaca' }
        ]
      },
      {
        id: 'lahan', nama: 'Tutupan lahan & fisik wilayah', bobot: 22.5,
        parameter: [
          { id: 'tutupan_lahan', nama: 'Tutupan lahan', slot: 'tutupan_lahan', bobot: 1,
            aturan: { metode: 'kategori', peta: { 1: 2, 2: 5, 3: 4, 4: 2, 5: 1 } },
            label: { 1: 'Badan Air', 2: 'Area Non Vegetasi', 3: 'Hutan', 4: 'Pertanian', 5: 'Non Hutan' },
            catatan: '[ASUMSI] skor per kelas, ganti sesuai tabel skor kelompok' },
          { id: 'gambut', nama: 'Lahan gambut', slot: 'gambut', bobot: 1,
            aturan: { metode: 'otomatis', arah: 'naik', skorDiLuar: 1, skorAda: 5 },
            catatan: 'Atribut kedalaman/skor bila ada; bila tidak, ada gambut = 5, bukan gambut = 1 [ASUMSI]' },
          { id: 'slope', nama: 'Kemiringan lereng', slot: 'slope', bobot: 1,
            aturan: { metode: 'otomatis', arah: 'naik', skorDiLuar: null } },
          { id: 'aksesibilitas', nama: 'Aksesibilitas', slot: 'aksesibilitas', bobot: 1,
            aturan: { metode: 'otomatis', arah: 'turun' },
            catatan: '[ASUMSI] nilai = jarak; makin dekat jalan/sungai/permukiman makin bahaya (Frigia, 2024 di proposal)' },
          { id: 'kawasan_hutan', nama: 'Kawasan hutan / konsesi', slot: 'kawasan_hutan', bobot: 1,
            aturan: { metode: 'otomatis', arah: 'naik', skorDiLuar: null, skorKategoriLain: 3,
              // [ASUMSI] dipakai hanya bila atribut berupa teks fungsi kawasan; urutan pola menentukan
              kataKunci: [
                { pola: 'konservasi|suaka|taman nasional|cagar|\\bKSA\\b|\\bKPA\\b', skor: 2 },
                { pola: 'lindung|\\bHL\\b', skor: 2 },
                { pola: 'konversi|\\bHPK\\b', skor: 4 },
                { pola: 'terbatas|\\bHPT\\b', skor: 3 },
                { pola: 'produksi|\\bHP\\b', skor: 3 },
                { pola: 'konsesi|HGU|IUPHHK|\\bHTI\\b|perkebunan|sawit', skor: 4 },
                { pola: 'APL|penggunaan lain', skor: 4 }
              ] },
            catatan: '[ASUMSI] skor per fungsi kawasan; sesuaikan dengan tabel skor kelompok' }
        ]
      },
      {
        id: 'riwayat', nama: 'Kerapatan titik api', bobot: 22.5,
        parameter: [
          { id: 'kerapatan', nama: 'Kerapatan titik api (KDE)', slot: '_kerapatan', bobot: 1,
            aturan: { metode: 'kuantil', arah: 'naik' },
            catatan: 'Dihitung dari hotspot periode pengembangan saja agar pengujian 2023–2025 independen' }
        ]
      },
      {
        id: 'vegetasi', nama: 'Indeks vegetasi', bobot: 8.2,
        parameter: [
          { id: 'ndvi', nama: 'NDVI', slot: 'ndvi', bobot: 1,
            aturan: { metode: 'kuantil', arah: 'turun' }, catatan: '[ASUMSI] vegetasi jarang/kering = lebih bahaya' },
          { id: 'ndmi', nama: 'NDMI', slot: 'ndmi', bobot: 1,
            aturan: { metode: 'otomatis', arah: 'turun', skorDiLuar: null }, catatan: 'Kelembapan rendah = lebih bahaya' }
        ]
      },
      {
        id: 'lst', nama: 'Suhu permukaan (LST)', bobot: 8.2,
        parameter: [
          { id: 'lst', nama: 'LST siang', slot: 'lst', bobot: 1,
            aturan: { metode: 'ambang', arah: 'naik', batas: [20, 25, 30, 35] },
            catatan: '[LITERATUR] Simarmata dkk. (2025) JGEL 9(1):78–97, mengacu Jaiswal dkk. (2002)' }
        ]
      }
    ],

    /* Klasifikasi indeks bahaya (1–5) menjadi 5 kelas.
     * Bawaan: interval sama pada rentang teoretis 1–5 [ASUMSI, transparan]. */
    kelas: {
      metode: 'interval',              // 'interval' | 'kuantil' | 'manual'
      batas: [1.8, 2.6, 3.4, 4.2],
      nama: ['Sangat Rendah', 'Rendah', 'Sedang', 'Tinggi', 'Sangat Tinggi'],
      warna: ['#1a9850', '#91cf60', '#fee08b', '#fc8d59', '#d73027'],
      interpretasi: [
        'Kondisi lahan, cuaca, dan riwayat api tidak mendukung penyalaan; prioritas pemantauan rutin.',
        'Potensi penyalaan kecil; api yang muncul cenderung mudah dikendalikan.',
        'Sebagian faktor pendukung kebakaran terpenuhi; perlu kewaspadaan pada puncak kemarau.',
        'Banyak faktor pendukung terpenuhi (kering, panas, bahan bakar tersedia, dekat aktivitas manusia); prioritas patroli dan pencegahan.',
        'Hampir semua faktor pendukung terpenuhi dan/atau riwayat api tinggi; prioritas utama mitigasi dan kesiapsiagaan.'
      ],
      kelasTinggiMulai: 4               // kelas ≥ 4 dihitung sebagai "bahaya tinggi" untuk analisis dampak
    }
  },

  /* Faktor emisi TIDAK diisi bawaan agar tidak ada angka tanpa rujukan.
   * Isi di tab Dampak dari IPCC 2006 Vol. 4 Bab 2 (Tabel 2.4–2.5) atau
   * IPCC 2013 Wetlands Supplement untuk gambut, lengkap dengan sitasinya. */
  emisi: {
    rumus: 'L = A × MB × Cf × Gef × 10⁻³ (IPCC 2006, Vol. 4, Bab 2, Pers. 2.27)'
  }
};
