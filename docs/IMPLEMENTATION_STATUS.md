# Status Implementasi

**Tanggal verifikasi:** 8 November 2026

## Ruang Proyek

- Ruang Proyek terintegrasi pada `/projects/{id}/workspace` dan dapat dibuka dari daftar/detail proyek.
- PostgreSQL menyimpan workspace, RAB/HPP, enam fase, enam belas tahap, tujuh role tim, dan tiga belas requirement dokumen.
- Tim dapat dikelola Admin; timeline dapat diperbarui sesuai assignment; dokumen memakai evidence privat dan ClamAV.
- Gate mendukung ready, submit, approval/rejection, passed, dan reopen dengan version check, audit, approval action, serta notification job.
- Data finansial hanya dikirim server kepada Admin, PIC, Project Leader, dan Finance Admin.
- Commercial lock, archived read-only guard, evidence replacement guard, fixed-point money, dan optimistic concurrency diterapkan.
- Generic approval tidak dapat memutus approval fase; keputusan fase wajib melalui endpoint fase khusus.
- Legacy PIC assignment memakai lock transaksi, conflict check PIC-Finance, dan assignment version.

## Migrasi Legacy

- Menu Admin `Migrasi Legacy` menerima JSON hasil `utero.projects` atau export Claude Artifact.
- Alur terdiri dari upload, preview, mapping proyek/user, dry-run rekonsiliasi, konfirmasi warning, dan commit.
- Proyek baru wajib memakai kode `DP-*`; workspace existing tidak dapat ditimpa kecuali replay idempotent persis.
- Nama user ambigu tidak dipetakan otomatis. Mapping dapat diarahkan ke user aktif atau `null`.
- Realisasi legacy `0` menjadi belum dilaporkan (`null`), tahap `Selesai` menjadi `IN_REVIEW`, dan checklist lama menjadi `LEGACY_CONFIRMED`.
- Commit berjalan atomik per proyek, memvalidasi ulang versi target dan status user, lalu menulis `data_jobs` serta audit.
- Ledger `project_workspace_imports` menjamin idempotensi dengan key `project-workspace-import:{sourceHash}:{legacyId}`.

## Database

- `0010_colorful_toxin.sql`: tabel dan constraint Ruang Proyek.
- `0011_many_sister_grimm.sql`: singleton role, lifecycle assignment, dan coherence approval/fase.
- `0012_sad_hawkeye.sql`: ledger preview dan idempotensi import legacy.
- Ketiga migration sudah diterapkan pada stack development/UAT.

## Validasi Terakhir

- Domain tests: 31 file, 135/135 lulus.
- Playwright E2E: 20/20 lulus pada desktop dan mobile, termasuk upload preview JSON legacy nyata.
- E2E memakai database PostgreSQL sementara yang dibuat, dimigrasikan, di-seed, dan dihapus otomatis tanpa menyentuh UAT.
- Lint, typecheck, production build, health API, dan `git diff --check` lulus.
- Runtime development sehat pada `http://localhost:3010`.

## Production Tersisa

- Handoff `AUTH_GOOGLE_ID` dan `AUTH_GOOGLE_SECRET`, lalu verifikasi login production.
- Isi endpoint email, WhatsApp, dan monitoring sesuai provider.
- Lakukan dry-run terhadap export legacy asli, rekonsiliasi jumlah proyek/HPP/tahap/dokumen, lalu commit setelah persetujuan Admin.
- Belum ada commit Git untuk perubahan implementasi ini.
