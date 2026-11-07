# Architecture Decision Records - Dashboard Monitoring Utero

Dokumen ini mencatat keputusan arsitektur dan alasan di baliknya. Perubahan keputusan dibuat dengan ADR baru yang menandai ADR lama sebagai superseded, bukan menghapus sejarah.

---

# ADR-001: Next.js Modular Monolith

## Status

Accepted

## Context

Dashboard membutuhkan UI responsif, server-side authorization, workflow approval, upload, reporting, dan integrasi provider. Tim memerlukan delivery cepat dan operasi sederhana. Batas domain tetap perlu dijaga agar sistem tidak menjadi monolith tanpa struktur.

Pilihan:

1. Modular monolith Next.js: satu unit deploy, transaksi sederhana, batas modul ditegakkan di kode.
2. Microservices: deployment/scaling independen, tetapi menambah network failure, distributed tracing, contract versioning, dan eventual consistency.
3. Layered monolith tunggal: paling sederhana, tetapi ownership dan coupling fitur lebih cepat kabur.

## Decision

Gunakan Next.js modular monolith. Modul domain memiliki public API, ownership data, application use case, domain, dan adapter sendiri. Domain tidak bergantung pada Next.js, ORM, database, atau provider. Controller/route tidak boleh mengakses repository secara langsung.

## Consequences

- Delivery, transaksi, testing, dan deployment lebih sederhana daripada microservices.
- Scaling dilakukan pada aplikasi sebagai unit, bukan per modul.
- Disiplin dependency dan architecture test diperlukan untuk mencegah coupling lintas modul.
- Batas modul menjadi seam untuk ekstraksi service bila kebutuhan operasional nyata muncul.

---

# ADR-002: Satu PostgreSQL Mandiri dengan Ownership Tabel per Modul

## Status

Accepted

## Context

Workflow approval dan audit membutuhkan konsistensi kuat. Sistem awal belum membutuhkan database per service, tetapi database tetap harus dapat dikelola, dicadangkan, dan direstore secara mandiri.

Pilihan:

1. Satu PostgreSQL: transaksi lintas tabel mudah dan operasi sederhana; blast radius database lebih besar.
2. Database per modul/service: isolasi kuat; distributed transaction dan reporting lintas domain lebih sulit.
3. Managed database: mengurangi beban operasi; menambah biaya dan ketergantungan platform.

## Decision

Gunakan satu PostgreSQL mandiri/dedicated. Setiap modul memiliki tabel dan migration yang jelas. Modul lain tidak boleh memakai repository atau tabel internal secara langsung. Constraint, foreign key, transaksi, dan optimistic concurrency menjaga integritas.

Untuk Docker lokal, PostgreSQL berjalan pada container port `5432` dan host port `5433`.

## Consequences

- Atomic transaction untuk status, approval, audit, dan outbox tersedia.
- Reporting lintas data lebih mudah.
- Database menjadi shared failure domain dan membutuhkan backup, monitoring, capacity planning, serta restore drill.
- Pemisahan database nanti memerlukan kontrak/event dan kemungkinan duplikasi data.

---

# ADR-003: Autentikasi Berbeda per Environment

## Status

Accepted

## Context

Developer memerlukan akses cepat tanpa konfigurasi Google penuh. Production memerlukan identity provider yang lebih kuat. Tombol demo dan credentials membawa risiko kritis bila ikut aktif di production.

Pilihan:

1. Credentials/demo di development dan Google OAuth di production: pengalaman dev cepat dengan guard environment ketat.
2. Google OAuth di semua environment: parity tinggi, tetapi setup lokal dan automated test lebih rumit.
3. Credentials di semua environment: sederhana, tetapi menambah penyimpanan password, reset flow, dan risiko keamanan production.

## Decision

Development memakai credentials lokal dan tombol akun demo saat `AUTH_MODE=development` serta `AUTH_DEMO_ENABLED=true`. Production menggunakan Google OAuth dengan `AUTH_MODE=production`; deployment wajib memasang secret unik dan kredensial Google.

Role tidak dipercaya dari input browser atau klaim bebas. Role disimpan server-side dan perubahan role diaudit.

## Consequences

- Onboarding developer dan E2E test lebih cepat.
- Perbedaan auth antar-environment dapat menyembunyikan bug integrasi OAuth; staging wajib memakai konfigurasi production-like.
- Guard build/runtime dan test konfigurasi menjadi kontrol keamanan wajib.
- Sistem tidak perlu mengelola password pengguna production.

---

# ADR-004: UTC untuk Penyimpanan, Asia/Jakarta untuk Waktu Bisnis

## Status

Accepted

## Context

Pengguna bekerja dalam waktu Indonesia Barat. Timestamp harus konsisten untuk audit, query, ekspor, dan integrasi tanpa bergantung timezone host/container.

Pilihan:

1. Simpan UTC dan konversi di boundary: konsisten dan portabel, tetapi membutuhkan disiplin konversi.
2. Simpan local time tanpa offset: mudah dibaca, tetapi ambigu dan rawan salah integrasi.
3. Simpan semua sebagai string: fleksibel, tetapi kehilangan constraint dan operasi waktu database.

## Decision

Simpan instant sebagai PostgreSQL `timestamptz` dalam UTC. Tampilkan, jadwalkan, dan hasilkan laporan dengan zona IANA `Asia/Jakarta`. Business date disimpan sebagai tipe tanggal bila tidak merepresentasikan instant. Container menggunakan `TZ=Asia/Jakarta`, tetapi logika tidak bergantung pada timezone OS.

## Consequences

- Audit dan integrasi memiliki timeline yang tidak ambigu.
- Semua formatter, filter tanggal, Excel, PDF, email, WhatsApp, dan job scheduler harus diuji terhadap zona bisnis.
- Developer harus membedakan instant, local date-time, dan business date.

---

# ADR-005: File Evidence melalui Storage Port

## Status

Accepted

## Context

Evidence harus persisten, aman, dan dapat dicadangkan. Penyimpanan byte di PostgreSQL menyederhanakan transaksi tetapi memperbesar database. Disk lokal sederhana untuk fase awal tetapi menghambat horizontal scaling.

Pilihan:

1. Persistent filesystem melalui port: sederhana dan murah; perlu shared/object storage sebelum multi-replica.
2. Object storage sejak awal: scalable dan durable; menambah setup dan biaya operasi lokal.
3. PostgreSQL large object/bytea: konsistensi transaksi mudah; backup dan ukuran database membesar.

## Decision

Simpan metadata evidence di PostgreSQL dan konten melalui `FileStoragePort`. Implementasi lokal/awal memakai volume persisten di luar public web root. Kontrak port mendukung migrasi ke object storage. Upload memakai allowlist, size limit, content-based MIME detection, nama acak, checksum, quarantine, dan malware scan bila tersedia.

## Consequences

- Domain tidak terikat filesystem atau vendor object storage.
- Backup database dan file harus dikoordinasikan dan diuji bersama.
- Horizontal scaling tidak aman dengan volume node-lokal; object/shared storage menjadi prasyarat.
- File download membutuhkan authorization server-side dan tidak boleh berupa public path permanen.

---

# ADR-006: Transactional Outbox untuk Email dan WhatsApp

## Status

Accepted

## Context

Provider email/WhatsApp dapat lambat, rate-limited, atau gagal. Mengirim dalam transaksi HTTP memperpanjang latency dan dapat menghasilkan state bisnis sukses tetapi respons gagal, atau sebaliknya.

Pilihan:

1. Transactional outbox dan worker: reliable serta dapat di-retry; menambah worker dan backlog monitoring.
2. Kirim sinkron dari request: sederhana; latency dan reliability buruk.
3. Message broker eksternal: throughput dan isolasi baik; menambah infrastruktur sebelum dibutuhkan.

## Decision

Tulis notification intent ke outbox dalam transaksi yang sama dengan perubahan bisnis. Worker mengambil pesan dengan locking yang aman, mengirim lewat port provider, dan mencatat attempt. Gunakan idempotency key, exponential backoff, maksimum retry, dan dead-letter state.

## Consequences

- Perubahan bisnis tidak hilang hanya karena provider gagal.
- Notifikasi bersifat eventual, bukan langsung terjamin saat response diterima.
- Outbox age, retry, dead-letter, dan provider latency wajib dimonitor.
- Broker dapat ditambahkan nanti bila volume dan isolation menuntutnya.

---

# ADR-007: Approval sebagai State Machine dengan Optimistic Concurrency

## Status

Accepted

## Context

Dua Admin dapat bertindak pada record yang sama. Staff juga dapat mencoba mengubah record setelah diajukan. Tanpa aturan transisi dan concurrency control, keputusan dapat tertimpa atau tidak dapat diaudit.

Pilihan:

1. State machine + optimistic concurrency: konflik terlihat dan cocok untuk contention rendah.
2. Pessimistic lock panjang: mencegah konflik, tetapi buruk untuk workflow berbasis manusia.
3. Last-write-wins: mudah, tetapi dapat merusak integritas keputusan.

## Decision

Gunakan status `DRAFT`, `SUBMITTED`, `REVISION_REQUESTED`, `APPROVED`, dan `REJECTED` dengan transisi eksplisit. Setiap command memeriksa role, ownership, current status, dan `version`. Update status, approval decision, audit event, dan outbox dilakukan dalam satu transaksi. Konflik versi mengembalikan error yang meminta pengguna memuat data terbaru.

## Consequences

- Race condition tidak diam-diam menimpa keputusan.
- UI harus menangani conflict response dengan jelas.
- Aturan transisi terkonsentrasi dan mudah diuji.
- Kebijakan four-eyes dapat diaktifkan tanpa mengubah model dasar.

---

# ADR-008: Audit Trail Append-Only Terstruktur

## Status

Accepted

## Context

Sistem memerlukan accountability untuk login, perubahan data, upload/download sensitif, approval, export, dan administrasi pengguna. Log aplikasi biasa tidak cukup karena retensi, struktur, dan aksesnya berbeda.

Pilihan:

1. Tabel audit append-only terstruktur: query dan korelasi mudah; masih berada dalam failure domain database.
2. Hanya application logs: murah; kurang kuat untuk business audit dan mudah terpotong oleh retensi log.
3. Audit service/SIEM eksternal: isolasi dan deteksi lebih baik; biaya serta kompleksitas lebih tinggi.

## Decision

Gunakan tabel audit append-only dengan actor, action, target, result, timestamp, correlation ID, metadata request yang aman, dan perubahan field terpilih. Audit bisnis kritis ditulis dalam transaksi yang sama. Secret, token, password, cookie, dan isi evidence dilarang masuk audit.

## Consequences

- Investigasi dan pelaporan aktivitas lebih andal.
- Volume tabel tumbuh dan membutuhkan retention/partitioning strategy.
- Admin aplikasi tidak boleh dapat mengubah event audit.
- Integrasi SIEM dapat ditambahkan melalui forwarding tanpa mengganti model audit utama.

---

# ADR-009: Ekspor Sinkron untuk Data Kecil, Job Asinkron untuk Data Besar

## Status

Accepted

## Context

Excel dan PDF dapat memakai CPU/memori besar dan melewati timeout request. Namun menjadikan semua ekspor asinkron menambah friksi untuk laporan kecil.

Pilihan:

1. Hybrid berdasarkan batas ukuran/estimasi: UX cepat untuk data kecil dan aman untuk data besar; perlu threshold yang diukur.
2. Semua sinkron: implementasi sederhana; berisiko timeout dan memory pressure.
3. Semua asinkron: operasi stabil; UX lebih lambat untuk ekspor kecil.

## Decision

Ekspor kecil di-stream sinkron dengan batas row, waktu, dan memori. Ekspor yang melewati estimasi diproses sebagai `ExportJob` oleh worker. Artefak memiliki expiry, akses terotorisasi, checksum, dan audit download. Query ekspor selalu menerapkan scope pengguna di server.

## Consequences

- Request interaktif terlindungi dari pekerjaan berat.
- Threshold perlu ditentukan melalui benchmark dan dipantau.
- Penyimpanan artefak dan cleanup job diperlukan.
- PDF membutuhkan font/layout deterministik dan visual regression test.

---

# ADR-010: Docker Compose Lokal dengan Port Host 3010 dan 5433

## Status

Accepted

## Context

Port default dapat berbenturan dengan project lain. Developer memerlukan environment lokal konsisten untuk app, PostgreSQL, volume, dan timezone.

Pilihan:

1. Docker Compose: konsisten dan mendekati production; membutuhkan Docker dan resource lebih besar.
2. Runtime/database native: lebih cepat pada sebagian mesin; setup dan versi mudah berbeda.
3. Development database remote bersama: setup lokal ringan; coupling antar-developer dan risiko data meningkat.

## Decision

Gunakan Docker Compose lokal. Next.js mendengar pada container port `3000`, dipetakan ke host `3010`. PostgreSQL mendengar pada container port `5432`, dipetakan ke host `5433`. Komunikasi container memakai DNS service dan port container. Gunakan volume persisten dan `TZ=Asia/Jakarta`.

## Consequences

- URL lokal aplikasi konsisten di `http://localhost:3010`.
- Tool database host terhubung ke `localhost:5433`; aplikasi dalam container tidak memakai alamat tersebut.
- Volume perlu prosedur backup/reset yang jelas.
- Konfigurasi production tetap terpisah dan tidak menyalin default secret development.

---

# ADR-011: Observability Berbasis Structured Logs, Metrics, dan Tracing

## Status

Accepted

## Context

Request web, database, upload, worker, OAuth, email, dan WhatsApp memiliki failure mode berbeda. Log teks tanpa korelasi tidak cukup untuk diagnosis dan alert.

Pilihan:

1. OpenTelemetry + structured logs/metrics: vendor-neutral dan lengkap; membutuhkan instrumentation dan backend observability.
2. Provider-specific SDK: setup cepat; meningkatkan vendor lock-in.
3. Logs saja: murah; sulit melihat latency, backlog, dan alur lintas worker.

## Decision

Gunakan JSON structured logs, metrics aplikasi/operasional, dan OpenTelemetry untuk trace kritis. Request/correlation ID diteruskan ke transaksi, outbox, worker, dan provider call. Liveness dan readiness dipisahkan. Alert berfokus pada dampak pengguna serta risiko data.

## Consequences

- Diagnosis lintas request dan job lebih cepat.
- Instrumentation menambah kode dan biaya penyimpanan telemetry.
- Sampling dan redaction wajib agar biaya terkendali dan data sensitif tidak bocor.
- SLO final baru ditetapkan setelah baseline beban nyata tersedia.

---

# ADR-012: Backup Terenkripsi dan Restore Drill Berkala

## Status

Accepted

## Context

PostgreSQL mandiri dan evidence storage adalah sumber data utama. Backup yang tidak pernah direstore tidak memberi keyakinan recovery.

Pilihan:

1. Backup database + evidence dengan restore drill: perlindungan lengkap; membutuhkan storage dan operasi rutin.
2. Snapshot server saja: mudah; recovery granular dan konsistensi tidak selalu terjamin.
3. Replikasi saja: recovery cepat untuk hardware failure; tidak melindungi dari deletion/corruption yang tereplikasi.

## Decision

Lakukan backup PostgreSQL harian terenkripsi, gunakan WAL/PITR bila tersedia, dan backup/snapshot evidence pada failure domain berbeda. Retensi awal adalah 7 harian, 4 mingguan, dan 12 bulanan. Jalankan restore drill terisolasi minimal setiap triwulan. Target awal RPO 24 jam tanpa PITR atau <= 15 menit dengan PITR, dan RTO 4 jam.

## Consequences

- Recovery data dapat diverifikasi, bukan diasumsikan.
- Storage, key management, monitoring backup, dan waktu drill menambah biaya operasi.
- Database dan evidence perlu titik konsistensi atau prosedur rekonsiliasi.
- Target final memerlukan persetujuan bisnis dan dapat mendorong replica/failover tambahan.

---

# ADR-013: Responsive UI dan Dark Mode sebagai Kebutuhan Produk

## Status

Accepted

## Context

Staff dapat bekerja dari layar mobile, sedangkan Admin sering memakai tabel pada desktop. Mode gelap dibutuhkan tanpa mengorbankan aksesibilitas dan keterbacaan laporan.

Pilihan:

1. Satu responsive design system dengan semantic tokens: konsisten dan maintainable; membutuhkan disiplin komponen.
2. UI desktop lalu adaptasi minimal: lebih cepat pada awal; UX mobile buruk dan utang desain tinggi.
3. UI mobile/desktop terpisah: optimasi penuh; duplikasi implementasi dan test.

## Decision

Gunakan satu responsive UI dengan semantic design tokens untuk warna, spacing, typography, elevation, dan state. Light/dark mengikuti preferensi pengguna atau sistem dan diterapkan sebelum render untuk mencegah flash. Target minimum viewport 360 px. Accessibility WCAG AA, keyboard, focus, reduced motion, serta semantic HTML diuji.

## Consequences

- Satu codebase melayani mobile dan desktop.
- Tabel kompleks membutuhkan pola responsif khusus, bukan sekadar mengecilkan kolom.
- Setiap komponen dan chart harus diuji pada dua theme.
- PDF/Excel tidak mengikuti dark mode; keduanya memakai style cetak stabil dan kontras tinggi.

---

# ADR-014: Strategi Deployment Immutable dan Migration Expand-Contract

## Status

Accepted

## Context

Deployment harus dapat diulang dan di-rollback. Migration database yang destruktif dapat membuat versi aplikasi sebelumnya tidak kompatibel.

Pilihan:

1. Immutable container + expand-contract: rollback aplikasi lebih aman; perubahan schema memerlukan beberapa release.
2. Deploy source langsung dan migration otomatis saat startup: sederhana; hasil host dapat berbeda dan race antar-replica mungkin terjadi.
3. Blue-green penuh sejak awal: risiko downtime rendah; infrastruktur lebih mahal.

## Decision

Build image immutable multi-stage dan jalankan sebagai non-root. Migration dijalankan sekali sebagai release step. Perubahan schema mengikuti expand-migrate-contract; drop/rename destruktif ditunda sampai versi lama tidak digunakan. App dan worker dapat memakai image sama dengan command berbeda. Smoke test dan telemetry diverifikasi setelah deployment.

## Consequences

- Build dapat direproduksi dan rollback image lebih cepat.
- Schema evolution lebih lambat dan memerlukan cleanup release.
- Pipeline harus mengelola migration lock, compatibility test, image scan, dan release metadata.
- High availability deployment dapat ditambahkan ketika SLO membutuhkannya.

---

# ADR-015: Testing Berlapis dengan PostgreSQL Nyata untuk Integrasi

## Status

Accepted

## Context

Mock-only test tidak menangkap SQL, constraint, transaction, migration, timezone, dan locking behavior. E2E-only test lambat dan sulit mendiagnosis kegagalan.

Pilihan:

1. Unit + integration PostgreSQL container + focused E2E: coverage seimbang; pipeline lebih kompleks.
2. Unit test dengan mock repository: cepat; risiko perbedaan terhadap database nyata.
3. E2E dominan: realistis; lambat, flaky, dan mahal dirawat.

## Decision

Gunakan unit test untuk domain/policy, integration test terhadap versi PostgreSQL yang sama dengan production, contract test untuk provider, dan E2E untuk journey kritis. Tambahkan security, accessibility, visual, performance, migration, backup/restore, dan rollback test sesuai risiko.

Quality gate wajib mencakup lint, type-check, unit/integration test, production build, secret/dependency/image scan, serta smoke test.

## Consequences

- Bug constraint, transaction, dan concurrency ditemukan lebih awal.
- CI membutuhkan Docker/container runtime dan waktu lebih lama.
- Test data builder dan isolation strategy perlu dirawat.
- Test suite tetap difokuskan pada risiko; tidak semua kombinasi harus menjadi E2E.


