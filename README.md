# Dashboard Monitoring Utero

> Satu dashboard untuk memantau proyek, KPI, onboarding, bukti kerja, persetujuan, laporan, notifikasi, dan audit Utero.

**Status:** v0.1.0 UAT tervalidasi pada 6 November 2026. Domain publik berada dalam maintenance gate sampai Google OAuth production tersedia. Dokumen produk serta arsitektur tersedia pada bagian [Dokumentasi](#dokumentasi).

## Mengapa Proyek Ini Ada

Dashboard Monitoring Utero menggantikan dashboard HTML lokal dan pencatatan yang tersebar dengan sumber data bersama berbasis PostgreSQL. Staff dapat memperbarui pekerjaan dan mengirim bukti. Admin dapat mengelola target, penugasan, persetujuan, laporan, notifikasi, dan audit dari satu aplikasi.

## Kapabilitas Utama

- Monitoring proyek desain, KPI bulanan, timeline program, dan onboarding.
- Akses berbasis role `ADMIN` dan `STAFF`, ownership, serta status record.
- Evidence PDF/JPEG/PNG/XLSX dengan authorization, signature validation, checksum, dan ClamAV scan.
- Persetujuan Admin dengan histori keputusan dan kontrol konflik versi.
- Import Excel atomik, export Excel, dan laporan PDF A4.
- Notification center per user serta delivery email/WhatsApp melalui signed webhook worker.
- Audit append-only untuk aksi bisnis dan keamanan.
- Project detail/comments, bulk action, kalender/Gantt, saved filter, laporan lengkap, UI responsif, dark mode, dan waktu bisnis `Asia/Jakarta`.

## Peran

| Peran | Cakupan utama |
|---|---|
| Admin | Mengelola pengguna, master data, KPI, proyek, onboarding, assignment, approval, import/export, laporan, notifikasi, dan audit. |
| Staff | Melihat item yang diizinkan, membuat pembaruan, mengunggah bukti, mengajukan approval, dan mengekspor data sesuai scope akses. |

Semua pemeriksaan akses dilakukan di server. Tombol yang disembunyikan di UI bukan kontrol keamanan.

## Autentikasi

| Environment | Metode |
|---|---|
| Development | Email/password lokal dan tombol demo untuk Admin/Staff; Google opsional. |
| Test | Identitas deterministik; provider eksternal dimock. |
| Production | Google OAuth/OIDC saja dengan allowlist domain atau email. |

Base Compose memaksa `AUTH_MODE=production` dan `AUTH_DEMO_ENABLED=false`. Startup container gagal bila Google OAuth, HTTPS callback, secret kuat, atau scanner belum tersedia. Google account diikat ke subject permanen setelah email terverifikasi cocok dengan user ACTIVE.

## Teknologi dan Arsitektur

- Next.js modular monolith untuk UI dan delivery layer.
- PostgreSQL mandiri sebagai sumber data utama.
- Drizzle ORM untuk akses data.
- NextAuth/Auth.js untuk session dan autentikasi.
- Storage privat melalui `FileStoragePort`; metadata file berada di PostgreSQL.
- Transactional outbox dan worker untuk notifikasi serta report besar.
- Docker Compose untuk runtime lokal.

Keputusan arsitektur lengkap tersedia di [docs/ADR.md](docs/ADR.md) dan desain sistem di [docs/SSD.md](docs/SSD.md).

## Data Publik dan Privasi

Repository publik memakai data proyek, KPI, milestone, dan target yang sepenuhnya sintetis. Data production, backup, evidence, credential, dan template sumber internal tidak pernah menjadi bagian Git. Sumber internal lokal berada pada direktori `.private/` yang diabaikan Git dan Docker.
## Menjalankan Lokal

### Prasyarat

- Node.js yang kompatibel dengan Next.js 16.
- npm dengan lockfile proyek.
- Docker Engine dan Docker Compose untuk runtime target lengkap.

### Development lokal

```bash
npm ci
npm run dev -- --port 3010
```

Buka `http://localhost:3010`.

### Runtime Docker

Base `compose.yaml` adalah konfigurasi production: hanya Nginx masuk `carubra-network`; app, PostgreSQL, worker, ClamAV, backup, dan monitor tetap privat tanpa host port.

Local UAT memakai overlay dan hanya bind ke loopback:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Buka `http://localhost:3010`. Saat overlay aktif, domain publik sengaja menjawab HTTP 503 agar demo login tidak terbuka ke internet.

Production setelah Google OAuth dan provider webhook tersedia:

```bash
docker compose -f compose.yaml up -d --build
```

Lihat `docs/DEPLOYMENT.md` untuk release gate, image versioning, backup, dan monitoring.

## Konfigurasi

Konfigurasi minimum:

```text
TZ=Asia/Jakarta
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
NEXTAUTH_URL=https://dash-monitor.carubra.com
EMAIL_WEBHOOK_URL
WHATSAPP_WEBHOOK_URL
NOTIFICATION_WEBHOOK_TOKEN
MONITOR_WEBHOOK_URL
BACKUP_DIR
```

Jangan commit secret, password demo, token provider, atau kredensial database. Gunakan environment runtime atau secret manager.

## Perintah Proyek

```bash
npm run dev
npm run lint
npm run build
npm run start
npm run typecheck
npm test
npm run test:e2e # memakai database sementara; akun PostgreSQL perlu izin CREATE/DROP DATABASE
npm run monitor
```

Suite test domain tersedia melalui `npm test`. Strategi dan quality gate lengkap tersedia di [docs/TESTING.md](docs/TESTING.md).

## Dokumentasi

- [Panduan Pengguna](docs/USER_GUIDE.md): alur Admin dan Staff.
- [Kontrak API](docs/API.md): konvensi endpoint, payload, error, pagination, dan job.
- [Panduan Testing](docs/TESTING.md): level test, skenario kritis, dan release gate.
- [Panduan Keamanan](docs/SECURITY.md): autentikasi, otorisasi, upload, audit, dan operasi aman.
- [Product Requirements](docs/PRD.md): kebutuhan produk dan acceptance criteria.
- [Software System Design](docs/SSD.md): desain teknis dan operasi.
- [Database](docs/DATABASE.md): model data, integritas, transaksi, dan retensi.
- [Architecture Decision Records](docs/ADR.md): keputusan dan trade-off arsitektur.
- [Roadmap Pengembangan](docs/ROADMAP.md): urutan epic, dependency, acceptance criteria, dan sprint.
- [Rancangan Integrasi Ruang Proyek](docs/PROJECT_ROOM_INTEGRATION_DESIGN.md): penyatuan fitur HPP, fase, tahap, tim, dan dokumen proyek ke sistem PostgreSQL yang berjalan.

## Prinsip Operasi

- Simpan timestamp sebagai UTC; tampilkan waktu bisnis dalam `Asia/Jakarta`.
- Jalankan migration sebagai release step tunggal dengan pola expand-migrate-contract.
- Simpan database, evidence, dan artefak laporan pada storage persisten dan privat.
- Backup PostgreSQL dan evidence secara terkoordinasi; uji restore minimal setiap triwulan.
- Jalankan container sebagai non-root dan pindai dependency, secret, serta image sebelum rilis.

## Lisensi dan Kepemilikan

Proyek internal Utero. Hak penggunaan dan distribusi mengikuti kebijakan organisasi Utero.



- Import JSON legacy tersedia untuk Admin dengan preview, mapping, dry-run, dan idempotensi.
