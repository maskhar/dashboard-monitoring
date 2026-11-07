# Panduan Pengguna Dashboard Monitoring Utero

Panduan ini menjelaskan alur kerja target MVP untuk Admin dan Staff. Nama menu dapat berubah selama implementasi, tetapi aturan role, approval, dan akses tetap mengikuti PRD.

## 1. Masuk ke Aplikasi

### Development

1. Buka `http://localhost:3010`.
2. Pilih login email/password lokal atau tombol demo.
3. Untuk tombol demo, pilih `Admin` atau `Staff`. Password demo tidak ditampilkan di UI.
4. Pastikan banner environment menunjukkan development dan data non-production.

Login development tersedia saat `AUTH_MODE=development`. Tombol demo juga memerlukan `AUTH_DEMO_ENABLED=true`.

### Production

1. Buka URL production melalui HTTPS.
2. Pilih **Masuk dengan Google**.
3. Gunakan akun Google yang diundang atau masuk allowlist organisasi.
4. Jika akses ditolak, hubungi Admin untuk memeriksa status akun, domain, email, dan role.

Production tidak menyediakan email/password atau tombol demo.

## 2. Hak Akses

| Aktivitas | Admin | Staff |
|---|:---:|:---:|
| Melihat seluruh data organisasi | Ya | Tidak; hanya scope yang diizinkan |
| Mengelola pengguna, role, dan master data | Ya | Tidak |
| Mengelola target, deadline, dan PIC | Ya | Tidak |
| Memperbarui item sendiri | Ya | Ya, melalui approval bila terkontrol |
| Mengunggah bukti | Ya | Ya, pada item sendiri |
| Memutuskan approval | Ya | Tidak |
| Import Excel | Ya | Tidak |
| Export Excel/PDF | Ya | Ya, sesuai scope data |
| Melihat audit | Ya | Riwayat item sendiri bila diizinkan |

## 3. Navigasi Utama

- **Ringkasan:** KPI, proyek aktif, overdue, approval tertunda, dan aktivitas terbaru.
- **Operasional:** KPI bulanan, timeline, checklist awal, dan syarat kelulusan fase.
- **Proyek Desain:** proyek, program, kategori, progres, status, deadline, PIC, dan bukti.
- **Onboarding:** template, peserta, item pembelajaran, progres, mentor, dan evidence.
- **Beban Kerja:** jumlah proyek aktif, rata-rata progres, dan indikator overload.
- **Approval:** submission yang menunggu keputusan atau revisi.
- **Laporan:** export Excel dan PDF berdasarkan filter.
- **Audit Log:** histori aksi terstruktur; Admin only atau dibatasi sesuai scope.
- **Pengguna/Pengaturan:** user, role, preferensi tema, dan kanal notifikasi.

## 4. Memakai Ringkasan dan Filter

1. Pilih periode, modul, status, program, kategori, atau PIC.
2. Periksa filter aktif sebelum membaca angka ringkasan.
3. Pilih kartu seperti **Overdue** atau **Pending Approval** untuk membuka daftar terfilter.
4. Hapus satu filter atau gunakan **Reset filter** untuk kembali ke cakupan awal.

`OVERDUE` dihitung sistem dari deadline dan status final. Jangan mengubahnya secara manual.

## 5. Proyek Desain

### Admin: membuat dan menugaskan proyek

1. Buka **Proyek Desain** lalu pilih **Tambah proyek**.
2. Isi ID, brand, program, kategori, tanggal mulai, deadline, status, progres, dan catatan.
3. Tetapkan PIC atau tandai belum memiliki PIC untuk ditindaklanjuti.
4. Simpan. Perubahan langsung Admin menjadi data resmi dan masuk audit log.

Status default: `BACKLOG`, `IN_PROGRESS`, `REVIEW`, dan `PUBLISHED`.

### Staff: memperbarui proyek

1. Buka proyek yang ditugaskan kepada Anda.
2. Pilih **Buat pembaruan**.
3. Isi progres 0-100, status, catatan, dan next action.
4. Tambahkan bukti bila diperlukan.
5. Simpan sebagai draft atau kirim untuk approval.

Sistem menandai data tidak konsisten, misalnya progres 100% dengan status `BACKLOG` atau progres di bawah 100% dengan status `PUBLISHED`.

### Beban kerja

Admin melihat jumlah proyek aktif per Staff. Ambang awal overload adalah lima proyek aktif per orang dan dapat dikonfigurasi. Gunakan indikator ini untuk redistribusi assignment, bukan sebagai penilaian tunggal kinerja.

## 6. KPI Operasional

### Admin

1. Buat atau pilih periode KPI.
2. Tentukan indikator, target, satuan, owner, dan periode.
3. Tinjau aktual, capaian, evidence, dan evaluasi.
4. Putuskan submission Staff atau perbarui data resmi bila berwenang.

### Staff

1. Buka KPI yang ditugaskan.
2. Isi nilai aktual dan evaluasi.
3. Tambahkan evidence pendukung.
4. Kirim pembaruan untuk approval.

Nilai kosong berarti belum dilaporkan, bukan nol. Nilai uang menggunakan Rupiah dan harus dimasukkan sebagai angka, bukan teks berformat.

## 7. Onboarding

### Admin atau mentor

1. Pilih template onboarding dan daftarkan Staff.
2. Tetapkan tanggal mulai, mentor, dan target selesai.
3. Pantau setiap item, bukti yang diharapkan, catatan mentor, dan status enrollment.
4. Ajukan atau putuskan kelulusan fase sesuai policy organisasi.

### Staff

1. Buka **Onboarding Saya**.
2. Pilih item yang sedang dikerjakan.
3. Isi progres, hasil, catatan, dan evidence.
4. Kirim item atau fase untuk review bila semua syarat terpenuhi.

## 8. Bukti Kerja

Format target MVP: PDF, JPG/JPEG, PNG, WEBP, XLSX, XLS, CSV, DOCX, dan ZIP bila Admin mengaktifkannya. Batas default 10 MB per file dan 10 file per submission.

### Mengunggah

1. Buka item atau draft submission.
2. Pilih **Tambah bukti**.
3. Pilih file atau tambahkan tautan yang diizinkan.
4. Tunggu status upload sukses sebelum mengirim submission.
5. Periksa nama, ukuran, dan preview bila tersedia.

Jangan unggah password, token, data pribadi yang tidak diperlukan, atau file executable. Setelah approval, hanya Admin dapat menghapus evidence sesuai kebijakan; aksi tetap diaudit.

### Mengunduh

Unduh selalu melalui aplikasi. Tautan dapat berumur pendek dan tetap memerlukan autentikasi. Jangan membagikan URL evidence sebagai tautan publik.

## 9. Approval

### Staff: mengirim pembaruan

1. Pastikan nilai resmi dan perubahan draft sudah benar.
2. Tambahkan catatan yang menjelaskan perubahan.
3. Lampirkan evidence wajib.
4. Pilih **Kirim untuk approval**.

Satu item hanya boleh memiliki satu submission aktif per Staff. Submission dapat dibatalkan sebelum keputusan bila policy mengizinkan.

### Admin: memutuskan submission

1. Buka **Approval** dan pilih submission.
2. Bandingkan nilai resmi dengan perubahan yang diajukan.
3. Periksa evidence, catatan, author, waktu, dan versi data.
4. Pilih **Approve**, **Reject**, atau **Minta revisi**.
5. Isi alasan untuk reject atau revisi.

Approve menerapkan perubahan, menulis keputusan, audit event, dan intent notifikasi dalam satu transaksi. Jika data resmi berubah sejak submission dibuat, muat data terbaru dan tinjau konflik sebelum memutuskan.

## 10. Import Excel

Import hanya tersedia untuk Admin.

1. Buka **Laporan > Import**.
2. Pilih tipe data: proyek, KPI, timeline, onboarding/assignment sesuai fitur aktif.
3. Unduh dan isi template resmi tanpa mengganti header wajib.
4. Unggah `.xlsx` atau `.xls`.
5. Periksa mapping, preview, warning, dan error per baris.
6. Pilih `Create only` atau `Upsert by ID`.
7. Konfirmasi import jika seluruh error blocking sudah selesai.

Import bersifat atomik per file: satu error blocking membatalkan seluruh penerapan data. Unduh file error, perbaiki sumber, lalu unggah ulang. Tanggal ditafsirkan dalam `Asia/Jakarta`; serial date Excel didukung sesuai template.

## 11. Export Excel dan PDF

1. Terapkan filter pada daftar atau halaman laporan.
2. Pilih **Export Excel** atau **Buat PDF**.
3. Konfirmasi periode, kolom/bagian laporan, dan scope data.
4. Unduh langsung untuk data kecil atau tunggu notifikasi job selesai untuk data besar.

Excel memuat ringkasan, detail, metadata evidence, dan histori approval bila diizinkan. PDF memakai format A4, nama/logo Utero, periode, pembuat, waktu `Asia/Jakarta`, filter, nomor halaman, dan disclaimer snapshot data.

Hak export sama dengan hak melihat data. Artefak dapat kedaluwarsa; buat ulang laporan bila tautan tidak berlaku.

## 12. Notifikasi

Event target:

- assignment baru atau berubah;
- deadline H-3 dan H-1;
- item pertama kali overdue dan digest harian;
- submission baru untuk Admin;
- approval, reject, atau revision requested untuk Staff;
- export/report siap diunduh.

Atur email dan WhatsApp di **Pengaturan > Notifikasi**. WhatsApp memerlukan nomor valid dan consent. Quiet hours default 21:00-07:00 `Asia/Jakarta`; pesan non-kritis ditunda. Kegagalan notifikasi tidak membatalkan perubahan bisnis yang sudah sukses.

## 13. Audit Log

Admin dapat memfilter audit berdasarkan tanggal, user, aksi, entity, dan modul. Audit mencatat actor, role, aksi, target, hasil, waktu, correlation ID, dan perubahan field yang aman.

Audit tidak dapat diedit atau dihapus melalui UI. Secret, password, token, cookie, dan isi file tidak boleh muncul dalam audit.

## 14. Tema, Mobile, dan Aksesibilitas

- Pilih tema `Light`, `Dark`, atau `System`.
- Pada mobile, gunakan filter drawer dan kartu/tabel responsif.
- Tabel kompleks dapat digeser horizontal; identitas item tetap harus mudah ditemukan.
- Status selalu memiliki label atau ikon, bukan warna saja.
- Semua alur utama ditargetkan bekerja pada viewport minimum 360 px dan navigasi keyboard.

## 15. Pemecahan Masalah

| Masalah | Tindakan |
|---|---|
| Login production ditolak | Pastikan akun Google terverifikasi, diundang, dan masuk allowlist. Hubungi Admin. |
| Tombol demo tidak terlihat | Pastikan environment development serta kedua flag dev/demo aktif. |
| Tidak dapat melihat item | Periksa assignment, organisasi aktif, status akun, dan scope role. |
| Upload ditolak | Periksa ukuran, tipe file, MIME, jumlah file, dan koneksi. |
| Submission konflik | Muat data terbaru, bandingkan perubahan, lalu kirim atau putuskan ulang. |
| Import gagal | Unduh laporan error; perbaiki seluruh baris blocking sebelum retry. |
| Export belum tersedia | Periksa status job dan notifikasi; data besar diproses asynchronous. |
| Notifikasi tidak masuk | Periksa preferensi, quiet hours, alamat/nomor, spam, dan status provider. |
| Waktu terlihat salah | Laporkan timestamp dan halaman; UI bisnis harus memakai `Asia/Jakarta`. |



## Lampiran Proyek dan Tugas

- Buka **Detail** pada proyek atau tugas.
- Gunakan **Unggah file** untuk PDF, PNG, JPG, atau XLSX. File dipindai malware sebelum tersedia di production.
- Gunakan **Tambah link** untuk Google Drive atau URL eksternal berprotokol `http`/`https`.
- Staff hanya dapat melihat dan menambah lampiran pada item yang ditugaskan kepadanya. Admin mengikuti scope penuh.
- Daftar lampiran menampilkan nama, ukuran, pembuat, waktu, dan tautan unduh.

## Monitoring Operasional

- **Program 3 Bulan** berisi 13 rencana mingguan lintas periode.
- **14 Hari Pertama** hanya menerima hari 1 sampai 14; API menolak nomor hari di atas 14.
- Bukti operasional menampilkan status unggah, pesan kegagalan, dan daftar file yang sudah tersimpan.
