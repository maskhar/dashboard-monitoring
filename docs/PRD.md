# PRD: Dashboard Monitoring Utero

**Status**: Draft  
**Author**: Product Team Utero  
**Last Updated**: 5 November 2026  
**Version**: 1.0  
**Target Release**: MVP  
**Stakeholders**: Manajemen Utero, Admin Operasional, Tim Desain, Engineering, Finance/Operations

---

## 0. Ringkasan Eksekutif

Dashboard Monitoring Utero adalah satu aplikasi web untuk memantau pekerjaan operasional dan proyek desain secara terpusat. Produk menggantikan dua dashboard HTML lokal yang menyimpan perubahan di browser dengan sistem multi-user berbasis PostgreSQL, kontrol akses Admin dan Staff, alur persetujuan, bukti kerja, audit log, laporan, dan notifikasi.

MVP harus memberi manajemen satu sumber data yang dapat dipercaya untuk menjawab: pekerjaan apa yang berjalan, siapa PIC-nya, apakah target tercapai, apa yang terlambat, bukti apa yang tersedia, dan perubahan mana yang sudah disetujui. Staff memperbarui pekerjaan dan mengunggah bukti; Admin mengelola data, pengguna, target, penugasan, persetujuan, laporan, dan konfigurasi notifikasi.

### Keputusan Produk yang Sudah Tetap

| Area | Keputusan |
|---|---|
| Struktur produk | Satu dashboard, bukan aplikasi terpisah per fungsi |
| Role | Admin dan Staff; banyak user dapat memiliki role yang sama |
| Database | PostgreSQL mandiri |
| Timezone bisnis | `Asia/Jakarta` |
| Development auth | Email/password dan tombol demo login |
| Production auth | Google OAuth |
| Runtime lokal | Docker; aplikasi port `3010`, PostgreSQL host port `5433` |
| Cakupan MVP | Upload bukti, audit log, import/export Excel, PDF report, notifikasi email/WhatsApp, approval Admin, dark mode, responsive mobile |
| Referensi UI/domain | `dashboard-monitoring-admin.html` dan `dashboard-monitoring-design.html` |

---

## 1. Press Release Internal

### Utero Meluncurkan Satu Dashboard untuk Memantau Target, Proyek, Beban Kerja, dan Bukti Eksekusi

Utero menghadirkan Dashboard Monitoring Utero, satu ruang kerja bagi Admin dan Staff untuk melihat target operasional, proyek desain, progres, deadline, PIC, bukti pekerjaan, dan status persetujuan secara real time. Staff tidak lagi mencatat pembaruan di file atau browser masing-masing, sementara Admin dapat meninjau perubahan, mendeteksi keterlambatan, mengirim pengingat, dan menghasilkan laporan Excel atau PDF dari sumber data yang sama. Dengan riwayat perubahan yang dapat diaudit dan akses yang sesuai role, manajemen memperoleh data yang lebih cepat, konsisten, dan dapat dipertanggungjawabkan.

---

## 2. Latar Belakang dan Problem Statement

### 2.1 Kondisi Saat Ini

Dua template saat ini menggambarkan kebutuhan nyata namun berjalan sebagai prototipe mandiri:

1. `dashboard-monitoring-admin.html` memantau KPI bulanan, Program 3 Bulan dengan 13 rencana mingguan, 14 Hari Pertama, syarat kelulusan fase, bukti/evaluasi, dan review manajer.
2. `dashboard-monitoring-design.html` memantau 65 proyek, status proyek, progres, deadline, program, kategori, PIC desainer, keterlambatan, konsistensi status/progres, dan beban kerja per desainer.
3. Kedua template menyimpan perubahan di `localStorage`, sehingga data hanya tersedia pada browser/perangkat yang sama, tidak memiliki histori terpercaya, tidak mendukung approval, dan tidak cocok untuk kolaborasi banyak user.

### 2.2 Masalah Pengguna

Admin dan Staff tidak memiliki satu sumber data bersama untuk memperbarui dan meninjau pekerjaan. Akibatnya:

- Data progres, status, PIC, dan bukti dapat berbeda antarfile atau perangkat.
- Manajemen sulit mengetahui data mana yang terbaru dan siapa yang mengubahnya.
- Keterlambatan dan beban kerja berlebih terlambat terdeteksi.
- Bukti kerja tersebar sebagai tautan, chat, file, atau catatan tanpa struktur.
- Perubahan penting dapat dianggap final tanpa tinjauan Admin.
- Pembuatan laporan membutuhkan rekap manual.
- Pengingat melalui email atau WhatsApp bergantung pada tindakan manual.

### 2.3 Dampak Jika Tidak Diselesaikan

- Waktu operasional terbuang untuk rekonsiliasi dan pengejaran update.
- Risiko keputusan salah meningkat karena data usang atau tidak lengkap.
- Akuntabilitas rendah karena tidak ada audit trail.
- Deadline terlewat dan beban kerja tidak merata.
- Pelaporan ke manajemen tidak konsisten dan sulit diverifikasi.

### 2.4 Bukti Awal

- Kedua template secara eksplisit menyatakan perubahan hanya tersimpan di browser.
- Template desain membutuhkan indikator proyek terlambat, belum memiliki PIC, data status/progres tidak konsisten, serta batas wajar lima proyek aktif per orang.
- Template admin membutuhkan bukti/evaluasi, catatan mentor/manajer, target bulanan, dan status timeline.
- Validasi kuantitatif masih diperlukan sebelum development lock: minimal lima wawancara pengguna dan baseline waktu rekap, kelengkapan bukti, serta keterlambatan update.

---

## 3. Tujuan dan Success Metrics

### 3.1 Tujuan MVP

1. Menjadikan PostgreSQL sebagai sumber data bersama untuk monitoring operasional dan proyek desain.
2. Memungkinkan Staff melaporkan progres dan bukti dengan alur persetujuan yang jelas.
3. Memberi Admin visibilitas lintas pekerjaan, pengguna, keterlambatan, beban kerja, dan kualitas data.
4. Mengurangi pekerjaan rekap manual melalui import/export Excel dan PDF report.
5. Mendorong update tepat waktu melalui notifikasi email dan WhatsApp.

### 3.2 North Star Metric

**Persentase item aktif yang memiliki update valid dan disetujui dalam tujuh hari terakhir.**

Update valid berarti status/progres tersimpan, memiliki PIC, tidak melanggar aturan konsistensi, dan telah disetujui Admin bila perubahan memerlukan approval.

### 3.3 Success Metrics

| Goal | Metric | Baseline | Target MVP | Measurement Window |
|---|---|---:|---:|---|
| Data selalu mutakhir | Item aktif dengan update valid dalam 7 hari | Diukur saat discovery | >= 90% | 30 hari setelah GA |
| Bukti kerja lengkap | Item selesai dengan minimal 1 bukti | Diukur saat discovery | >= 95% | 30 hari setelah GA |
| Approval cepat | Median waktu submit hingga keputusan Admin | Belum tersedia | < 24 jam kerja | 30 hari setelah GA |
| Kurangi rekap manual | Waktu membuat laporan periodik | Diukur saat discovery | Turun >= 70% | 60 hari setelah GA |
| Tingkatkan akuntabilitas | Perubahan data utama tercatat di audit log | 0% terpusat | 100% | Sejak hari pertama GA |
| Tingkatkan adopsi | User aktif mingguan / user terdaftar | 0% | >= 80% | 30 hari setelah GA |
| Kurangi keterlambatan tanpa respons | Item overdue tanpa next action | Diukur saat discovery | Turun >= 40% | 60 hari setelah GA |
| Keandalan sistem | Availability aplikasi pada jam kerja | N/A | >= 99,5% | Bulanan |

### 3.4 Guardrail Metrics

- Error rate request aplikasi < 1% per hari.
- Kegagalan pengiriman notifikasi < 5%, di luar gangguan provider.
- Import gagal tanpa laporan baris/error: 0 kasus.
- Kehilangan file bukti yang sudah dikonfirmasi upload: 0 kasus.
- Perubahan tanpa actor atau timestamp di audit log: 0 kasus.

---

## 4. Non-Goals MVP

- Aplikasi native Android/iOS; MVP berupa web responsif.
- Integrasi dua arah dengan Google Sheets, ERP, CRM, payroll, atau accounting.
- Workflow approval bertingkat lebih dari satu tahap.
- Role kustom dan permission builder; hanya Admin dan Staff.
- Editor dokumen atau gambar di dalam aplikasi.
- Chat internal real-time.
- Perhitungan payroll, komisi, invoice, atau rekonsiliasi bank.
- WhatsApp chatbot interaktif; MVP hanya notifikasi outbound melalui provider.
- Penyimpanan file skala enterprise atau document management penuh.
- Kustomisasi dashboard per user di luar filter dan preferensi tampilan.

---

## 5. Persona dan Hak Akses

### 5.1 Admin

Manajer atau petugas operasional yang bertanggung jawab atas kualitas data, penugasan, target, approval, pengguna, dan laporan.

**Kebutuhan utama:** melihat kondisi keseluruhan, menindak keterlambatan, menyeimbangkan beban kerja, menyetujui update, dan menghasilkan laporan yang dapat dipertanggungjawabkan.

### 5.2 Staff

Anggota tim operasional atau desain yang menjalankan pekerjaan, memperbarui progres, mengunggah bukti, dan menanggapi review Admin.

**Kebutuhan utama:** melihat pekerjaan sendiri, memahami prioritas/deadline, mengirim update dengan cepat, dan mengetahui keputusan atau revisi yang diminta.

### 5.3 Matriks Permission

| Kapabilitas | Admin | Staff |
|---|:---:|:---:|
| Melihat ringkasan seluruh dashboard | Ya | Terbatas ke item sendiri; agregat tim bila diizinkan konfigurasi |
| Melihat semua item operasional/proyek | Ya | Hanya item yang ditugaskan atau diizinkan |
| Membuat item | Ya | Tidak pada MVP, kecuali draft update pada item yang ditugaskan |
| Mengubah master item, target, deadline, PIC | Ya | Tidak |
| Mengubah progres/status item sendiri | Ya | Ya, masuk approval bila termasuk perubahan terkontrol |
| Upload/unduh bukti | Ya | Ya pada item sendiri |
| Menghapus bukti | Ya | Hanya bukti sendiri sebelum approval |
| Approve/reject/request revision | Ya | Tidak |
| Import Excel | Ya | Tidak |
| Export Excel/PDF | Ya | Ya untuk data yang dapat dilihat |
| Mengelola user dan role | Ya | Tidak |
| Melihat audit log | Ya | Riwayat item sendiri tanpa data sensitif actor lain bila dibatasi |
| Mengelola template dan kanal notifikasi | Ya | Preferensi notifikasi pribadi saja |

Prinsip akses: deny by default, pemeriksaan permission dilakukan di server, bukan hanya menyembunyikan tombol di UI.

---

## 6. Ruang Lingkup Fungsional

### 6.1 Navigasi Utama

Satu aplikasi menggunakan modul berikut:

1. **Ringkasan**: KPI lintas modul, tren, item overdue, approval tertunda, dan aktivitas terbaru.
2. **Operasional**: KPI bulanan, timeline mingguan, checklist harian/fase awal, dan syarat kelulusan.
3. **Proyek Desain**: daftar proyek, status, progres, program, kategori, deadline, PIC, dan catatan.
4. **Beban Kerja**: beban aktif per Staff, rata-rata progres, overdue, dan indikator overload.
5. **Approval**: antrean submission Staff dan keputusan Admin.
6. **Laporan**: filter, export Excel, dan generate PDF.
7. **Audit Log**: riwayat perubahan terstruktur.
8. **Pengguna**: user, role, status akun, dan penugasan; Admin only.
9. **Pengaturan**: notifikasi, preferensi tema, dan konfigurasi sistem yang diizinkan.

### 6.2 Ringkasan Dashboard

Dashboard menampilkan kartu dan visual yang dapat difilter berdasarkan rentang tanggal, modul, status, program, kategori, dan PIC:

- Total item aktif.
- Item `Belum Mulai/Backlog`, `Berjalan/In Progress`, `Review`, `Selesai/Published`.
- Item terlambat.
- Item tanpa PIC.
- Item dengan data tidak konsisten.
- Approval pending dan melewati SLA.
- Capaian KPI operasional per bulan.
- Distribusi status.
- Beban kerja per Staff.
- Aktivitas terbaru.

Klik kartu membuka daftar yang sudah terfilter. Filter aktif harus terlihat dan dapat dihapus satu per satu atau sekaligus.

### 6.3 Modul Operasional

MVP mempertahankan konsep dari template Admin:

- KPI bulanan dengan indikator, target, aktual, satuan, capaian persen, bukti, dan evaluasi.
- Timeline mingguan dengan ID, periode, fokus, deliverable, progres, status, review Admin, dan next action.
- Checklist kegiatan awal dengan hari/tanggal, fokus, hasil yang diharapkan, bukti, dan catatan mentor/Admin.
- Syarat kelulusan fase dengan status dan bukti.
- Nilai kosong berarti belum dilaporkan, bukan nol.
- Nilai uang menggunakan Rupiah dan disimpan sebagai angka desimal aman, bukan floating point.

Status default operasional: `NOT_STARTED`, `IN_PROGRESS`, `IN_REVIEW`, `COMPLETED`, `OVERDUE`. `OVERDUE` dihitung sistem berdasarkan deadline dan status final, bukan dipilih manual.

### 6.4 Modul Proyek Desain

MVP mempertahankan konsep dari template desain:

- Identitas proyek, brand, program, kategori, tanggal mulai, deadline, progres, status, PIC, catatan, dan bukti.
- Program awal: Brand Birth, Rebranding, Brand+ing; Admin dapat mengelola nilai master bila dibutuhkan.
- Status default: `BACKLOG`, `IN_PROGRESS`, `REVIEW`, `PUBLISHED`.
- Pencarian berdasarkan ID atau brand.
- Filter status, program, kategori, PIC, deadline, dan kondisi data.
- Deteksi proyek terlambat.
- Deteksi inkonsistensi, termasuk progres 100% tetapi masih Backlog atau progres <100% tetapi Published.
- Beban kerja aktif per Staff; ambang awal lima proyek aktif per orang, dapat dikonfigurasi Admin.
- Penghapusan Staff dari assignment tidak menghapus user atau histori; assignment harus dipindahkan atau dikosongkan secara eksplisit.

### 6.5 Upload Bukti

Staff dan Admin dapat mengunggah bukti pada item atau submission:

- Format MVP: PDF, JPG/JPEG, PNG, WEBP, XLSX, XLS, CSV, DOCX, dan ZIP bila diaktifkan Admin.
- Batas default 10 MB per file dan maksimal 10 file per submission; nilai dapat dikonfigurasi.
- File memiliki nama asli, ukuran, MIME type, uploader, timestamp, checksum, dan hubungan ke item/submission.
- Upload menampilkan progres, sukses, dan error yang dapat ditindaklanjuti.
- Preview tersedia untuk gambar dan PDF bila browser mendukung; format lain diunduh.
- File tidak boleh dieksekusi dari domain aplikasi.
- Validasi menggunakan ekstensi, MIME type, dan magic bytes bila tersedia.
- Penghapusan setelah approval hanya dapat dilakukan Admin dan tetap tercatat di audit log.

Penyimpanan MVP dapat memakai volume lokal Docker atau object storage kompatibel S3. Metadata wajib berada di PostgreSQL. Production direkomendasikan memakai object storage agar deployment aplikasi tetap stateless.

### 6.6 Approval Admin

Perubahan Staff terhadap progres, status, aktual KPI, catatan evaluasi, dan bukti dikirim sebagai submission.

Status submission:

- `DRAFT`: belum dikirim.
- `PENDING`: menunggu review Admin.
- `APPROVED`: diterapkan sebagai data resmi.
- `REJECTED`: ditolak dengan alasan.
- `REVISION_REQUESTED`: dikembalikan untuk diperbaiki.
- `CANCELLED`: dibatalkan Staff sebelum keputusan.

Aturan:

1. Staff melihat nilai resmi dan draft/perubahan tertunda secara terpisah.
2. Satu item dapat memiliki maksimal satu submission aktif per Staff untuk mencegah konflik yang tidak jelas.
3. Admin melihat perbandingan nilai lama dan nilai baru, bukti, catatan Staff, serta histori keputusan.
4. Approve menerapkan perubahan dalam satu transaksi database dan menulis audit log.
5. Reject dan request revision wajib menyertakan alasan.
6. Staff menerima notifikasi setelah keputusan.
7. Perubahan langsung oleh Admin berlaku segera tetapi tetap tercatat di audit log.
8. Bila data resmi berubah setelah submission dibuat, sistem menandai konflik dan meminta Admin meninjau versi terbaru sebelum approve.

### 6.7 Audit Log

Audit log bersifat append-only pada level aplikasi dan mencatat:

- Actor user ID, nama tampilan, dan role saat aksi.
- Aksi: create, update, delete/archive, assign, upload, download sensitif bila diperlukan, submit, approve, reject, login, import, export, dan perubahan konfigurasi.
- Entity type dan entity ID.
- Timestamp UTC dan representasi `Asia/Jakarta` di UI.
- Nilai sebelum/sesudah untuk field yang berubah; secret, token, dan password tidak pernah dicatat.
- Request/correlation ID, sumber IP yang diproteksi sesuai kebijakan privasi, dan user agent bila dibutuhkan investigasi.
- Metadata alasan keputusan atau sumber import.

Admin dapat mencari dan memfilter log berdasarkan tanggal, user, aksi, entity, dan modul. Audit log tidak dapat diedit atau dihapus melalui UI.

### 6.8 Import Excel

Admin dapat mengimpor proyek desain, KPI, timeline, atau assignment melalui template Excel resmi.

Alur:

1. Pilih tipe data dan unggah `.xlsx`/`.xls`.
2. Sistem membaca header, melakukan mapping kolom, dan menampilkan preview.
3. Sistem memvalidasi required field, tipe data, nilai enum, duplikasi, referensi user, tanggal, dan progres 0-100.
4. Admin memilih mode `Create only` atau `Upsert by ID`.
5. Sistem menampilkan jumlah valid, warning, dan error per baris.
6. Import hanya dijalankan setelah konfirmasi.
7. Baris invalid tidak boleh diam-diam dilewati. Untuk MVP, import bersifat atomic per file: bila ada error blocking, tidak ada data yang diterapkan.
8. Hasil import menghasilkan ringkasan dan file error yang dapat diunduh.
9. Setiap batch memiliki import ID dan tercatat di audit log.

Tanggal Excel ditafsirkan pada timezone `Asia/Jakarta`. Sistem harus menangani serial date Excel dan teks tanggal yang sesuai template.

### 6.9 Export Excel

User dapat mengekspor data sesuai permission dan filter aktif. Workbook mencakup:

- Sheet ringkasan.
- Sheet data detail.
- Sheet bukti berupa metadata dan URL aman, bukan file biner.
- Sheet histori approval bila dipilih dan diizinkan.
- Waktu pembuatan, pembuat, timezone, dan filter pada metadata laporan.

Nilai tanggal ditulis sebagai tanggal Excel, angka tetap numerik, dan identifier dipertahankan sebagai teks bila perlu. Export besar diproses sebagai job asynchronous dan memberi notifikasi saat siap.

### 6.10 PDF Report

Admin dan Staff sesuai scope akses dapat membuat PDF dengan pilihan:

- Ringkasan eksekutif.
- KPI operasional per periode.
- Status dan progres proyek.
- Daftar overdue.
- Beban kerja per Staff.
- Approval dan bukti terpilih.

PDF wajib memuat logo/nama Utero, periode, timestamp `Asia/Jakarta`, filter, pembuat laporan, nomor halaman, dan disclaimer bahwa laporan merepresentasikan data saat dibuat. Layout harus dapat dicetak pada A4 dan tabel panjang harus memiliki header berulang.

### 6.11 Notifikasi Email dan WhatsApp

Event MVP:

- Assignment baru atau berubah.
- Deadline mendekat: default H-3 dan H-1.
- Item terlambat: saat pertama overdue dan digest harian sampai ada update/penyelesaian.
- Submission baru untuk Admin.
- Approval, rejection, atau revision requested untuk Staff.
- Export/report asynchronous siap diunduh.

Aturan:

- Email dan WhatsApp dikirim melalui adapter/provider terpisah agar provider dapat diganti.
- WhatsApp hanya dikirim ke nomor yang valid dan memiliki consent sesuai kebijakan Utero/provider.
- User dapat mengatur kanal pribadi, kecuali notifikasi wajib sistem yang ditetapkan Admin.
- Quiet hours default 21:00-07:00 `Asia/Jakarta`; notifikasi non-kritis ditunda.
- Sistem mencegah duplikasi melalui idempotency key.
- Delivery status, retry count, provider message ID, dan error disimpan.
- Maksimal tiga retry dengan exponential backoff untuk kegagalan sementara.
- Kegagalan satu kanal tidak menggagalkan transaksi utama atau kanal lain.

### 6.12 Dark Mode dan Responsiveness

- Tema `Light`, `Dark`, dan `System`.
- Preferensi disimpan per user; fallback awal mengikuti `prefers-color-scheme`.
- Warna status tidak menjadi satu-satunya pembeda; gunakan label/icon dan kontras WCAG AA.
- Desktop menggunakan sidebar/top navigation dan tabel lengkap.
- Mobile menggunakan navigasi ringkas, kartu atau tabel responsif, filter drawer, dan aksi utama yang mudah dijangkau.
- Target viewport minimum 360 px tanpa horizontal overflow pada halaman utama. Tabel kompleks boleh memakai scroll horizontal dengan kolom identitas tetap terlihat bila layak.
- Target sentuh minimal 44x44 px.

---

## 7. User Stories dan Acceptance Criteria

### Story 1: Login Development

Sebagai developer atau tester, saya ingin login dengan email/password atau tombol demo agar dapat menguji role tanpa Google OAuth.

**Acceptance Criteria:**

- [ ] Pada environment development, form email/password dan tombol demo terlihat.
- [ ] Tombol demo menawarkan sesi Admin dan Staff yang jelas, tanpa menampilkan password di UI.
- [ ] Kredensial demo berasal dari seed/config development dan tidak tersedia di production.
- [ ] Login gagal menampilkan pesan generik tanpa membocorkan apakah email terdaftar.
- [ ] Session aman dibuat setelah autentikasi berhasil.

### Story 2: Login Production

Sebagai user production, saya ingin login dengan akun Google yang diizinkan agar akses mudah dan terkontrol.

**Acceptance Criteria:**

- [ ] Production hanya menampilkan Google OAuth.
- [ ] User yang belum terdaftar/diundang ditolak atau masuk status pending sesuai konfigurasi Admin.
- [ ] Domain Google dapat dibatasi melalui konfigurasi.
- [ ] Role berasal dari database aplikasi, bukan klaim yang dapat diubah client.
- [ ] Logout mengakhiri session aplikasi.

### Story 3: Melihat Pekerjaan

Sebagai Staff, saya ingin melihat pekerjaan saya berdasarkan prioritas dan deadline agar tahu tindakan berikutnya.

**Acceptance Criteria:**

- [ ] Default menampilkan item aktif milik user.
- [ ] Item overdue dan mendekati deadline terlihat jelas.
- [ ] Search dan filter bekerja pada data yang diizinkan.
- [ ] Klik item membuka detail, bukti, histori update, dan status approval.
- [ ] Waktu ditampilkan dalam `Asia/Jakarta`.

### Story 4: Mengirim Update dan Bukti

Sebagai Staff, saya ingin memperbarui progres/status serta mengunggah bukti agar Admin dapat memverifikasi pekerjaan.

**Acceptance Criteria:**

- [ ] Progres hanya menerima nilai 0-100.
- [ ] Status final memerlukan bukti minimal satu file atau alasan pengecualian yang dapat dikonfigurasi.
- [ ] Validasi inkonsistensi status/progres muncul sebelum submit.
- [ ] Submission pending tidak langsung menimpa nilai resmi.
- [ ] Setelah submit, Staff melihat timestamp dan status approval.

### Story 5: Menyetujui Update

Sebagai Admin, saya ingin membandingkan update dengan nilai sebelumnya agar dapat approve, reject, atau meminta revisi.

**Acceptance Criteria:**

- [ ] Antrean dapat difilter berdasarkan Staff, modul, umur submission, dan status.
- [ ] Perubahan field ditampilkan side-by-side.
- [ ] Bukti dapat dilihat atau diunduh secara aman.
- [ ] Approve menerapkan semua perubahan secara atomic.
- [ ] Reject/revision memerlukan alasan dan mengirim notifikasi.
- [ ] Keputusan tercatat di audit log.

### Story 6: Memantau Beban Kerja

Sebagai Admin, saya ingin melihat jumlah item aktif per Staff agar dapat menghindari overload.

**Acceptance Criteria:**

- [ ] Kartu Staff menampilkan aktif, total, rata-rata progres, dan overdue.
- [ ] Beban di atas ambang konfigurasi ditandai.
- [ ] Klik Staff membuka daftar item terkait.
- [ ] Reassignment hanya dapat dilakukan Admin dan tercatat.

### Story 7: Import Excel

Sebagai Admin, saya ingin mengimpor data massal dengan validasi agar migrasi dan update periodik tidak memerlukan input satu per satu.

**Acceptance Criteria:**

- [ ] Template resmi dapat diunduh.
- [ ] Preview menunjukkan data valid, warning, dan error per baris.
- [ ] Tidak ada perubahan database bila ada error blocking.
- [ ] Upsert menggunakan ID stabil dan tidak membuat duplikasi.
- [ ] Hasil import dan actor tercatat di audit log.

### Story 8: Export dan PDF

Sebagai Admin, saya ingin mengekspor laporan sesuai filter agar dapat membagikan status yang konsisten.

**Acceptance Criteria:**

- [ ] Export menghormati filter dan permission.
- [ ] Excel mempertahankan tipe data penting.
- [ ] PDF layak cetak A4 dan memiliki metadata laporan.
- [ ] Report besar tidak memblokir UI dan user diberi status job.

### Story 9: Audit Perubahan

Sebagai Admin, saya ingin mengetahui siapa mengubah apa dan kapan agar masalah data dapat ditelusuri.

**Acceptance Criteria:**

- [ ] Semua mutasi entity utama menghasilkan audit event.
- [ ] Filter tanggal, actor, aksi, dan entity tersedia.
- [ ] Secret dan password tidak masuk log.
- [ ] Audit event tidak dapat diedit melalui aplikasi.

### Story 10: Mobile dan Dark Mode

Sebagai user, saya ingin menggunakan dashboard melalui ponsel dan tema gelap agar update tetap nyaman di berbagai kondisi.

**Acceptance Criteria:**

- [ ] Core flow login, melihat item, submit update, upload bukti, dan approval dapat diselesaikan pada viewport 360 px.
- [ ] Tidak ada kontrol penting yang hanya bergantung pada hover.
- [ ] Tema tersimpan dan tidak berkedip berlebihan saat load.
- [ ] Kontras teks dan kontrol memenuhi WCAG AA.

---

## 8. Aturan Bisnis

1. Semua timestamp disimpan dalam UTC; input dan tampilan bisnis menggunakan `Asia/Jakarta`.
2. Deadline berbasis tanggal dianggap berakhir pukul 23:59:59 `Asia/Jakarta`, kecuali waktu spesifik ditentukan.
3. `OVERDUE` merupakan kondisi turunan: deadline lewat dan item belum final.
4. Progres valid 0-100. Nilai kosong berbeda dari 0.
5. Status final proyek desain adalah `PUBLISHED`; status final operasional adalah `COMPLETED`.
6. Item final dengan progres <100% ditandai inkonsisten dan memerlukan koreksi atau alasan Admin.
7. Progres 100% pada status awal ditandai inkonsisten.
8. User dinonaktifkan tidak dapat login, tetapi histori, assignment, dan audit actor tetap dipertahankan.
9. Entity utama diarsipkan/soft delete; hard delete hanya melalui prosedur administratif terbatas.
10. Approval menggunakan optimistic locking/version number untuk mencegah overwrite perubahan lebih baru.
11. Import dan approval harus atomic pada unit transaksi yang ditentukan.
12. Hak akses export sama dengan hak akses melihat data sumber.

---

## 9. Model Data Konseptual

| Entity | Field Utama | Catatan |
|---|---|---|
| `users` | id, email, name, role, status, phone, google_subject, preferences | Role `ADMIN`/`STAFF`; email unik |
| `sessions/accounts` | user_id, provider, token metadata/session | Token sensitif dienkripsi atau dikelola library auth |
| `work_items` | id, code, module, title, description, status, progress, start_at, due_at, assignee_id, version | Basis bersama item operasional/proyek bila arsitektur memilih model terpadu |
| `design_projects` | work_item_id, brand, program_id, category_id | Detail khusus proyek desain |
| `operational_kpis` | id, period, indicator, target, actual, unit, owner_id | Aktual dapat nullable |
| `operational_milestones` | work_item_id, week/day, focus, deliverable, review_note, next_action | Timeline dan checklist |
| `phase_gates` | id, title, status, evidence_required | Syarat kelulusan fase |
| `assignments` | id, work_item_id, user_id, assigned_by, active_from, active_to | Mendukung histori PIC |
| `submissions` | id, entity_type, entity_id, author_id, status, base_version, proposed_changes, submitted_at, decided_at, decided_by, decision_note | `proposed_changes` dapat JSONB dengan validasi schema |
| `evidence_files` | id, entity_type, entity_id, submission_id, storage_key, original_name, mime_type, size, checksum, uploaded_by | File fisik di storage |
| `comments/notes` | id, entity_type, entity_id, author_id, body, visibility | Catatan review terstruktur |
| `audit_logs` | id, actor_id, action, entity_type, entity_id, before_data, after_data, request_id, created_at | Append-only; JSONB untuk diff |
| `import_jobs` | id, type, mode, file_id, status, summary, created_by | Menyimpan hasil validasi/import |
| `report_jobs` | id, type, filters, status, output_file_id, created_by, expires_at | Excel/PDF asynchronous |
| `notification_jobs` | id, event_type, channel, recipient, payload, status, attempts, provider_id, scheduled_at, sent_at | Idempotency key unik |
| `notification_preferences` | user_id, channel, event_type, enabled, quiet_hours | Per user |
| `master_values` | id, type, code, label, active, sort_order | Program, kategori, dan opsi konfigurabel |

Semua tabel utama memiliki `created_at`, `updated_at`, dan actor field bila relevan. Primary key direkomendasikan UUID. Kode bisnis seperti `DP-001` tetap unik dan mudah dibaca.

---

## 10. Arsitektur dan Kebutuhan Teknis

### 10.1 Topologi Lokal

Docker Compose minimum:

| Service | Container Port | Host Port | Catatan |
|---|---:|---:|---|
| Web application | 3010 | `3010` | UI dan API, atau gateway aplikasi |
| PostgreSQL | 5432 | `5433` | PostgreSQL mandiri pada host port non-default |
| Worker | Internal | Tidak wajib diekspos | Report dan notifikasi async; dapat menyatu pada proses app untuk dev |
| File storage | Internal/volume | Tidak wajib diekspos | Volume lokal dev atau S3-compatible storage |

Aplikasi lokal tersedia di `http://localhost:3010`. Koneksi database dari host memakai port `5433`; koneksi antar-container memakai nama service dan port `5432`.

### 10.2 Environment

- `development`: email/password aktif, demo login aktif, Google OAuth opsional.
- `test`: auth deterministic, provider eksternal dimock.
- `production`: Google OAuth aktif; email/password dan demo login wajib nonaktif.
- Secret hanya melalui environment/secret manager dan tidak masuk repository.
- Startup production gagal cepat bila secret/auth config wajib tidak tersedia.

### 10.3 API dan Transaksi

- Semua endpoint mutasi memvalidasi session, role, ownership, input, dan version.
- Upload menggunakan signed URL atau endpoint streaming; file besar tidak dimuat seluruhnya ke memory.
- Approval memakai database transaction untuk perubahan entity, status submission, dan audit log.
- Endpoint import/export/report memakai job ID untuk operasi yang dapat berlangsung lama.
- Pagination server-side wajib untuk daftar proyek, approval, audit, dan notifikasi.
- API mengembalikan error code stabil dan pesan ramah pengguna.

### 10.4 Background Jobs

Worker menangani:

- Pengiriman email/WhatsApp dan retry.
- Reminder deadline/overdue berdasarkan `Asia/Jakarta`.
- Pembuatan Excel/PDF besar.
- Cleanup report sementara yang kedaluwarsa.
- Rekonsiliasi status delivery provider.

MVP dapat memakai job table PostgreSQL dengan locking yang aman. Message broker terpisah bukan kewajiban awal bila volume belum membutuhkannya.

### 10.5 Observability

- Structured logs dengan request ID, tanpa secret atau isi file.
- Health check aplikasi, database, worker, dan storage.
- Metrics minimum: request count/latency/error, job queue depth, job failure, notification delivery, login failure, upload failure, dan report duration.
- Alert untuk error rate tinggi, database unavailable, queue tertahan, storage gagal, dan notification failure spike.

---

## 11. Autentikasi dan Keamanan

### 11.1 Development Authentication

- Email/password hanya untuk development dan test.
- Password di-hash dengan Argon2id atau bcrypt cost yang sesuai.
- Demo login membuat session user seed sesuai role tanpa mengekspos credential.
- Akun demo memakai data non-production dan di-reset melalui seed bila diperlukan.

### 11.2 Production Authentication

- Google OAuth/OIDC dengan Authorization Code flow dan PKCE bila relevan.
- Validasi issuer, audience, nonce, state, redirect URI, dan email verification.
- Allowlist domain/email dapat dikonfigurasi.
- Mapping Google identity ke `users.google_subject`; email bukan satu-satunya identifier permanen.

### 11.3 Session dan Proteksi Aplikasi

- Session memakai cookie `HttpOnly`, `Secure` di production, dan `SameSite=Lax` atau lebih ketat sesuai flow OAuth.
- Proteksi CSRF pada request state-changing bila memakai cookie session.
- Rate limit login, upload, import, export, dan report generation.
- Security headers: CSP, HSTS di production, frame protection, content type options, dan referrer policy.
- Input output di-escape untuk mencegah XSS; query database selalu parameterized.
- Download file melalui authorization check dan URL berumur pendek.
- Backup PostgreSQL dan storage diuji restore secara berkala.

---

## 12. UX dan Desain

### 12.1 Prinsip

- Satu dashboard, dua konteks kerja, navigasi konsisten.
- Informasi kritis terlihat sebelum detail: overdue, pending approval, missing PIC, dan data invalid.
- Empty state menjelaskan tindakan berikutnya.
- Nilai belum dilaporkan tidak ditampilkan sebagai nol.
- Perubahan pending terlihat berbeda dari nilai resmi.
- Aksi berisiko seperti reject, archive, atau bulk update memerlukan konfirmasi yang jelas.

### 12.2 Adaptasi dari Template

Elemen yang dipertahankan:

- Kartu KPI dan progress bar.
- Distribusi status.
- Tabel proyek dengan search/filter.
- Kartu beban kerja per Staff.
- Tab/rute KPI bulanan, timeline mingguan, checklist awal, dan phase gate.
- Warna semantik success, warning, danger, dan accent Utero.

Elemen yang diganti:

- `localStorage` menjadi PostgreSQL melalui API.
- Input langsung yang otomatis final menjadi draft/submission untuk Staff.
- Nama desainer lokal menjadi user dan assignment terkelola.
- Catatan/tautan bukti bebas menjadi attachment dan catatan terstruktur.
- Tanggal browser lokal menjadi timezone bisnis `Asia/Jakarta`.

### 12.3 Accessibility

- Navigasi keyboard penuh.
- Focus state terlihat.
- Label form terhubung ke input.
- Error form terkait field dan diumumkan ke screen reader.
- Tabel memiliki header semantik; versi mobile tetap mempertahankan konteks label.
- Grafik memiliki ringkasan tekstual.

---

## 13. Kebutuhan Non-Fungsional

| Area | Requirement MVP |
|---|---|
| Performance | P95 halaman utama < 2,5 detik pada koneksi kantor normal; P95 API read < 500 ms untuk query umum |
| Scalability | Mendukung minimal 200 user, 100 concurrent session, 100.000 item, dan 1 juta audit event tanpa redesign mendasar |
| Availability | >= 99,5% bulanan pada jam operasional, di luar maintenance terjadwal |
| Data integrity | Constraint database, transaction, foreign key, versioning, dan migration terkontrol |
| Backup | Backup PostgreSQL harian; target RPO 24 jam dan RTO 8 jam untuk MVP |
| Browser | Dua versi terbaru Chrome, Edge, Firefox, dan Safari; mobile Chrome/Safari modern |
| Localization | Bahasa Indonesia; format tanggal/angka `id-ID`; timezone `Asia/Jakarta` |
| Privacy | Data pribadi minimum; nomor WhatsApp dan email hanya digunakan untuk fungsi resmi |
| Retention | Audit log minimal 2 tahun atau mengikuti kebijakan perusahaan; report sementara memiliki masa berlaku |

---

## 14. Analytics dan Event Tracking

Event minimum:

- `login_succeeded`, `login_failed`, `logout`.
- `dashboard_viewed`, `filter_applied`.
- `work_item_viewed`, `work_item_updated`.
- `submission_created`, `submission_submitted`, `submission_decided`.
- `evidence_upload_started`, `evidence_upload_succeeded`, `evidence_upload_failed`.
- `import_validated`, `import_completed`, `import_failed`.
- `export_requested`, `report_generated`, `report_failed`.
- `notification_sent`, `notification_failed`.

Event analytics tidak boleh memuat isi bukti, password, token, atau catatan sensitif. Dashboard analytics internal harus dapat menghitung success metrics pada Bagian 3.

---

## 15. Migrasi dan Data Awal

1. Data awal dari dua template dipetakan ke model final.
2. Proyek `DP-001` sampai `DP-065`, program, kategori, progres, status, dan deadline diimpor sebagai seed/migration terverifikasi.
3. Item operasional dari template Admin dipetakan ke KPI, milestone mingguan, checklist, dan phase gate.
4. Nilai yang sebelumnya hanya tersimpan di browser tidak dianggap sumber resmi kecuali diekspor dan divalidasi oleh pemilik data.
5. Status/progres yang tidak konsisten masuk daftar review, bukan diperbaiki diam-diam.
6. User dan PIC dimigrasikan setelah daftar email, role, dan ownership disetujui Admin.
7. Dry run menghasilkan reconciliation report: jumlah sumber, jumlah berhasil, warning, error, dan checksum file sumber.

---

## 16. Launch Plan

| Phase | Audience | Durasi | Success Gate |
|---|---|---:|---|
| Internal alpha | Engineering, PM, 2 Admin | 1 minggu | Core flow berfungsi; tidak ada P0/P1; restore backup diuji |
| Closed beta | 2 Admin, 5-10 Staff lintas fungsi | 2 minggu | >= 90% task flow selesai; upload/approval stabil; feedback blocker selesai |
| Pilot | Satu tim operasional dan satu tim desain | 2-4 minggu | >= 80% WAU; >= 90% item aktif ter-update; error rate <1% |
| GA | Seluruh user Utero yang disetujui | Bertahap | Support siap; monitoring aktif; rollback runbook disetujui |

### 16.1 Feature Flags

- `approval_workflow`
- `excel_import`
- `pdf_reports`
- `email_notifications`
- `whatsapp_notifications`
- `google_oauth`

### 16.2 Rollback Criteria

Rollback atau nonaktifkan feature terkait bila:

- Terjadi kehilangan atau korupsi data.
- Error rate core flow >5% selama 15 menit.
- Approval menerapkan nilai yang salah atau ganda.
- User dapat mengakses data di luar permission.
- Upload menyajikan file tanpa authorization.
- Notifikasi berulang terkirim massal akibat deduplication gagal.

Rollback aplikasi tidak boleh menurunkan schema secara destruktif. Migration harus backward-compatible selama rollout.

---

## 17. QA dan Test Plan

### 17.1 Automated Tests

- Unit test aturan status, overdue, progres, permission, timezone, dan mapping import.
- Integration test database transaction, optimistic locking, audit log, upload metadata, dan job queue.
- API authorization test untuk setiap kombinasi role/ownership.
- E2E test login dev, Google OAuth mock, submit update, approval, reject/revision, import, export, PDF, dan notifikasi mock.
- Snapshot/visual test light/dark dan viewport desktop/mobile untuk halaman kritis.

### 17.2 Manual/UAT

- Uji dengan file Excel valid, invalid, duplikat, formula, serial date, dan ukuran besar.
- Uji file upload dengan MIME salah, file terlalu besar, nama Unicode, dan koneksi terputus.
- Uji pergantian hari dan DST tidak relevan namun konversi UTC/Jakarta wajib tepat.
- Uji konflik dua Admin dan submission berbasis versi lama.
- Uji screen reader dasar, keyboard-only, contrast, dan touch target.
- Uji kegagalan provider email/WhatsApp tanpa menggagalkan update utama.

### 17.3 Definition of Done MVP

- Semua acceptance criteria P0/P1 lulus.
- Tidak ada vulnerability critical/high yang belum dimitigasi.
- Migration dan rollback runbook diuji.
- Backup dan restore diuji pada environment non-production.
- Dashboard monitoring teknis dan alert aktif.
- Admin/Staff guide tersedia.
- Support owner dan escalation path ditentukan.

---

## 18. Risiko dan Mitigasi

| Risiko | Likelihood | Impact | Mitigasi |
|---|---|---|---|
| Scope MVP terlalu besar | Tinggi | Tinggi | Bangun vertical slice; feature flag; urutkan auth, data inti, approval, bukti, report, notifikasi |
| Data sumber tidak konsisten | Tinggi | Tinggi | Dry run, validation report, manual sign-off, jangan auto-correct diam-diam |
| WhatsApp provider/consent terlambat | Sedang | Tinggi | Adapter provider, mulai email, feature flag WhatsApp, siapkan template approval provider lebih awal |
| File storage lokal sulit diskalakan | Sedang | Sedang | Abstraksi storage dan rencana object storage production |
| Approval memperlambat update | Sedang | Sedang | SLA, antrean prioritas, bulk approve aman, notifikasi Admin |
| Audit log tumbuh cepat | Sedang | Sedang | Index, partition/retention plan, pagination, archive policy |
| OAuth salah konfigurasi | Sedang | Tinggi | Environment validation, allowlist redirect URI, test tenant, runbook |
| Laporan PDF berbeda antarbrowser | Sedang | Sedang | Server-side renderer dan visual regression test |
| Notifikasi menjadi spam | Sedang | Tinggi | Quiet hours, digest, deduplication, preference, rate limit |
| Role leakage | Rendah | Sangat Tinggi | Server-side authorization tests, deny by default, security review |

---

## 19. Prioritas Delivery

### P0 - Wajib Sebelum Pilot

- PostgreSQL schema dan migration.
- Auth development dan production sesuai environment.
- User/role Admin dan Staff.
- Ringkasan, modul operasional, proyek desain, assignment, search/filter.
- Update Staff, approval Admin, bukti, audit log.
- Responsive mobile dan dark mode.
- Import Excel dasar dan export Excel.
- PDF report dasar.
- Email notification dasar.
- Docker lokal port app `3010` dan DB `5433`.

### P1 - Wajib Sebelum GA

- WhatsApp notification.
- Job async/retry/deduplication lengkap.
- Report/filter lanjutan.
- Bulk approval yang aman.
- Observability, backup/restore, retention, dan hardening keamanan.

### P2 - Setelah Validasi MVP

- Dashboard yang dapat dikustomisasi.
- Approval bertingkat.
- Integrasi Google Sheets/CRM/ERP.
- Komentar mention dan kolaborasi real-time.
- Forecast kapasitas dan prediksi keterlambatan.

---

## 20. Open Questions Sebelum Development Lock

| Pertanyaan | Owner | Deadline | Dampak Jika Belum Dijawab |
|---|---|---|---|
| Siapa user pilot, email, role, dan mapping PIC awal? | Product/Admin | Sebelum seed data | Auth dan assignment tidak dapat difinalkan |
| Apakah Staff boleh melihat agregat seluruh tim atau hanya data sendiri? | Manajemen | Sebelum desain UI final | Permission dan dashboard berbeda |
| Perubahan field mana yang wajib approval dan mana yang langsung berlaku? | Product/Admin | Sebelum API approval | Scope workflow tidak jelas |
| Provider email dan WhatsApp apa yang digunakan? | Engineering/Operations | Sebelum integrasi notifikasi | Estimasi dan template berbeda |
| Object storage production tersedia atau memakai volume terkelola? | Engineering | Sebelum deployment design | Durability dan backup file |
| Berapa batas file, retention, dan format ZIP diperbolehkan? | Security/Operations | Sebelum upload final | Keamanan dan biaya storage |
| Apakah laporan memerlukan logo, tanda tangan, nomor dokumen, atau format legal tertentu? | Management | Sebelum PDF design | Template PDF berpotensi diulang |
| Apakah KPI/phase gate tetap hard-coded untuk periode ini atau harus dapat dibuat Admin? | Product | Sebelum schema lock | Model data dan UI konfigurasi |
| Kebijakan domain Google dan user invitation? | Admin/IT | Sebelum OAuth production | Risiko akses tidak sah |
| SLA approval dan jam kerja resmi? | Management | Sebelum notifikasi/SLA | Reminder dan metric tidak akurat |

---

## 21. Keputusan dan Trade-off

| Keputusan | Alasan | Trade-off |
|---|---|---|
| Satu dashboard dengan modul | User dan manajemen memakai sumber data serta navigasi yang sama | Navigasi dan permission lebih kompleks daripada dua aplikasi kecil |
| PostgreSQL mandiri | Transaksi, relasi, audit, JSONB, dan reporting sesuai kebutuhan | Perlu operasi database, backup, dan migration discipline |
| Staff submit, Admin approve | Menjaga kualitas dan akuntabilitas data resmi | Menambah waktu dan antrean review |
| UTC di storage, Jakarta di bisnis/UI | Aman untuk integrasi dan konsisten bagi user | Membutuhkan disiplin konversi timezone |
| Google OAuth production | Mengurangi pengelolaan password production | Bergantung pada konfigurasi/availability Google dan akun organisasi |
| Dev email/password + demo | Pengujian cepat dan deterministic | Wajib dipisahkan ketat agar tidak bocor ke production |
| Adapter notifikasi | Provider email/WhatsApp dapat diganti | Menambah abstraction dan pekerjaan awal |
| Report server-side | Hasil PDF konsisten dan dapat diaudit | Membutuhkan worker/rendering dependency |

---

## 22. Appendix

### 22.1 Sumber Referensi

- `dashboard-monitoring-admin.html`: KPI bulanan, Program 3 Bulan dengan 13 rencana mingguan, 14 Hari Pertama, phase gate, bukti/evaluasi, dan review manajer.
- `dashboard-monitoring-design.html`: 65 proyek, distribusi status, beban kerja, search/filter, progres, PIC, deadline, overdue, dan validasi konsistensi.

### 22.2 Glosarium

| Istilah | Definisi |
|---|---|
| Item | Unit pekerjaan umum berupa proyek, milestone, checklist, atau target terkait |
| PIC | User utama yang bertanggung jawab atas item |
| Submission | Usulan perubahan Staff yang menunggu keputusan Admin |
| Bukti | File atau artefak pendukung pelaksanaan pekerjaan |
| Data resmi | Nilai terakhir yang berlaku setelah perubahan Admin atau approval submission |
| Overdue | Deadline telah lewat dan item belum berada pada status final |
| Audit log | Catatan append-only tentang actor, aksi, waktu, dan perubahan data |

### 22.3 Rekomendasi Urutan Implementasi

1. Schema, seed, timezone, user/role, dan auth environment.
2. Read-only dashboard terpadu dari data PostgreSQL.
3. Assignment, update Staff, approval Admin, dan audit log.
4. Upload bukti dan storage abstraction.
5. Import/export Excel dan PDF report.
6. Email lalu WhatsApp notification.
7. Hardening mobile, dark mode, accessibility, observability, backup, dan launch readiness.



