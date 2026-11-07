# Status Implementasi

**Tanggal verifikasi:** 6 November 2026

## Selesai

- Dashboard tunggal Next.js untuk Admin dan Staff.
- PostgreSQL menjadi sumber data; UI tidak memakai fallback demo.
- Data contoh tersanitasi dari dua template: 65 proyek, 3 periode, 9 definisi KPI, 27 target KPI, 33 minggu, 20 milestone, dan 5 gate.
- Scope Staff berdasarkan assignment; Admin melihat seluruh data.
- User management, PIC proyek, evidence upload/download, approval, audit, import/export Excel, dan PDF.
- Perubahan timeline oleh Staff masuk approval; Admin approval memakai version check dan baru kemudian menerapkan snapshot.
- Docker lokal pada app port 3030 dan PostgreSQL host port 5433.
- Responsive desktop/mobile dan dark mode.
- Monitoring P3 untuk app, query PostgreSQL, ClamAV, dan usia backup; alert/recovery webhook opsional tanpa Docker socket.
- Dokumentasi handoff credential OAuth production dan uji restore terisolasi.

## Konfigurasi Production Tersisa

- Lakukan handoff `AUTH_GOOGLE_ID` dan `AUTH_GOOGLE_SECRET` sesuai `docs/DEPLOYMENT.md`, lalu verifikasi login production.
- Isi `EMAIL_WEBHOOK_URL` dan `WHATSAPP_WEBHOOK_URL` sesuai provider.
- Service `monitor` sudah berjalan; isi `MONITOR_WEBHOOK_URL` sesuai provider/relay insiden.
- Restore terisolasi DB, aplikasi, dan evidence lulus; login OAuth production tetap menunggu credential sebelum go-live.

## Verifikasi

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- `docker compose up -d --build`

## Progress 6 November 2026

- Tunnel upstream isolated to a unique private app alias; only Nginx is on shared network.
- Base Compose disables demo auth and removes published ports. Development overlay binds to localhost and shows HTTP 503 publicly until Google OAuth credentials are set.
- ClamAV scan blocks uploads before persistence and scans legacy evidence before download. Daily DB/uploads backups verified through isolated restore drill.
- Added monitored backup/health stack, project comments, notification center, calendar/Gantt, saved filters, bulk actions, and complete reports.
- Production activation still requires Google OAuth credentials and external notification/monitor provider endpoints. Git initialized and CI workflow added, but no initial commit, remote, or executed remote CI run yet.

## Hardening UAT 6 November 2026

- Cleanup database sementara scanner selesai; backup production tidak disentuh.
- Nginx menolak host asing, tidak meneruskan header proto dari klien, dan menyembunyikan readiness API dari publik; rate limit menggunakan IP peer tunnel, bukan header klien.
- Worker notification mewajibkan signing token bila webhook aktif, mengirim timestamp dan event ID; monitor memeriksa queue macet dan job gagal.
- Startup production menolak URL OAuth yang bukan HTTPS origin; sesi login maksimal 32 jam.
- Unit tests 65/65 lulus, lint, typecheck, build Docker lulus; E2E terakhir tercatat passed. Runtime tetap UAT/maintenance dan bukan go-live.

