# Panduan Testing Dashboard Monitoring Utero

Tujuan testing: memastikan data resmi, permission, approval, evidence, laporan, notifikasi, audit, dan recovery bekerja tanpa kebocoran antar-user atau kehilangan histori.

## 1. Status Saat Ini

Vitest, Testing Library, jsdom, dan Playwright sudah terpasang. Unit test domain tersedia di `tests/domain` dan dijalankan melalui `npm test`. Smoke test API, database PostgreSQL, login, export Excel/PDF, serta visual desktop/mobile telah dijalankan pada 5 November 2026. Suite integration dan E2E penuh tetap menjadi perluasan berikutnya.

## 2. Strategi Test

| Level | Fokus |
|---|---|
| Unit | State transition, invariant, permission, overdue, progres, timezone, mapping import, template notifikasi. |
| Integration | PostgreSQL nyata, constraint, transaction, locking, outbox, migration, file adapter, dan job lease. |
| Contract | Google claims, email/WhatsApp, webhook, format Excel/PDF, dan storage adapter. |
| E2E | Journey Admin/Staff, login, project/KPI/onboarding, evidence, approval, import/export/PDF, dan audit. |
| Security | Escalation, CSRF, IDOR, upload bypass, traversal, XSS, SQL injection, session, rate limit, secret leakage. |
| Visual/A11y | Desktop/mobile, light/dark, keyboard, focus, contrast, screen reader, dan PDF snapshot. |
| Performance | List/filter, upload maksimum, concurrent approval, export besar, dan worker backlog. |
| Recovery | Migration, rollback image, backup/restore database dan evidence. |

Integration test wajib memakai versi PostgreSQL yang sama dengan production. Mock repository tidak cukup untuk SQL, constraint, timezone, locking, dan transaksi.

## 3. Script Proyek

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:a11y": "playwright test --grep @a11y"
  }
}
```

Jangan menambahkan script tanpa konfigurasi dan test yang benar-benar berjalan.

## 4. Data dan Environment Test

- Gunakan database disposable per worker atau schema terisolasi.
- Jalankan migration dari nol sebelum integration test.
- Seed satu organisasi, dua Admin, dua Staff, proyek lintas owner, KPI, onboarding, evidence, dan submission berbagai state.
- Gunakan file fixture aman; jangan memakai data production.
- Mock provider eksternal melalui fake HTTP server, bukan bypass domain policy.
- Bekukan waktu untuk deadline, quiet hours, expiry, dan retry; uji UTC/`Asia/Jakarta`.
- Bersihkan artefak test tanpa menyentuh volume development atau production.

## 5. Unit Test Wajib

### Role dan ownership

- Admin dapat mengelola master data dan approval.
- Staff hanya dapat membaca dan mengubah item dalam scope.
- User nonaktif tidak dapat login tetapi histori actor tetap tersedia.
- Role dari browser diabaikan; role server-side menjadi sumber kebenaran.

### Proyek, KPI, dan onboarding

- `OVERDUE` dihitung dari deadline dan status final.
- Progres hanya 0-100.
- `PUBLISHED` dengan progres di bawah 100% menghasilkan issue.
- `BACKLOG` dengan progres 100% menghasilkan issue.
- Nilai KPI `null` berbeda dari nol; uang tidak memakai floating-point.
- Kelulusan onboarding memeriksa item dan evidence wajib.

### Approval dan notifikasi

- Transisi hanya mengikuti state machine.
- Reject/revision tanpa alasan ditolak.
- Submission aktif kedua ditolak.
- Base version lama menghasilkan `VERSION_CONFLICT`.
- Reminder H-3/H-1 dan quiet hours memakai `Asia/Jakarta`.
- Idempotency mencegah duplikat; retry berhenti setelah batas.

## 6. Integration Test Wajib

- Constraint organisasi mencegah referensi lintas tenant.
- RLS/request context tidak bocor antar-organisasi bila diaktifkan.
- Update progres menulis histori, snapshot, audit, dan outbox atomik.
- Approval mengunci request, memeriksa version, dan commit bersama.
- Dua Admin concurrent menghasilkan satu keputusan final.
- Queue memakai `FOR UPDATE SKIP LOCKED` dan pulih dari worker mati.
- Audit tidak dapat di-`UPDATE`, `DELETE`, atau `TRUNCATE` oleh role aplikasi.
- Migration berjalan dari database kosong dan versi sebelumnya.
- Evidence metadata/checksum cocok dengan storage object.
- Export menerapkan scope user pada query server-side.

## 7. E2E Journey Kritis

### Auth dan approval

1. Login development dan demo menghasilkan role benar.
2. Production-like environment menolak dev/demo auth.
3. Staff membuka item sendiri, membuat draft, upload evidence, lalu submit.
4. Data resmi belum berubah sebelum approval.
5. Admin melihat diff, lalu approve/reject/request revision.
6. Data resmi, audit, dan notifikasi berubah sesuai keputusan.

### KPI, onboarding, import, dan laporan

- Staff melaporkan KPI bernilai nol dan kosong; hasil berbeda.
- Staff menyelesaikan onboarding dengan evidence; mentor/Admin memberi catatan.
- Import valid sukses atomik; satu baris invalid membatalkan batch.
- `Create only` menolak duplikasi; `Upsert by ID` memperbarui target tepat.
- Excel menangani serial date, formula, dan identifier sebagai teks.
- Export Staff tidak memuat item user lain.
- PDF A4 memuat metadata, filter, nomor halaman, dan header tabel berulang.
- Job besar hanya dapat diunduh creator/Admin berwenang.

### Notifikasi dan audit

- Provider gagal tidak menggagalkan transaksi bisnis.
- Retry dan dead-letter tercatat.
- Audit mencatat login, perubahan, upload, submit, approval, import, export, dan konfigurasi.
- Audit tidak memuat password, token, cookie, secret, atau isi evidence.

## 8. Security Test

- Staff mencoba ID proyek Staff lain dan endpoint Admin.
- User organisasi A mencoba resource organisasi B.
- CSRF pada mutasi berbasis cookie ditolak.
- Upload executable, MIME palsu, polyglot, archive berbahaya, traversal, nama Unicode, dan file besar ditolak.
- XSS pada catatan/nama file/data import tidak dieksekusi.
- SQL injection pada filter tidak mengubah query.
- Login, upload, import, export, dan report terkena rate limit.
- Error tidak membocorkan stack, SQL, path storage, DSN, atau data user lain.
- Client bundle tidak memuat secret server.

## 9. Visual, Accessibility, dan Performance

Uji login, ringkasan, proyek, KPI, onboarding, submission, approval, import, laporan, dan audit pada viewport 360 px, tablet, desktop, light/dark, keyboard-only, reduced motion, contrast WCAG AA, serta touch target 44x44 px.

Target awal:

- P95 halaman utama < 2,5 detik pada koneksi kantor normal.
- P95 API read < 500 ms untuk query umum.
- 200 user, 100 session concurrent, 100.000 item, dan 1 juta audit event tanpa redesign mendasar.

Benchmark list/filter, upload 10 MB, concurrent approval, report besar, outbox backlog, storage lambat, dan restart database.

## 10. Manual UAT

- Excel valid, invalid, duplikat, formula, serial date, teks tanggal, dan file besar.
- Upload MIME salah, file besar, nama Unicode, koneksi putus, dan retry.
- Pergantian hari UTC/Jakarta.
- Konflik dua Admin dan submission versi lama.
- Screen reader, keyboard-only, contrast, dan touch target.
- Kegagalan email/WhatsApp tanpa rollback data bisnis.
- Role Admin dan Staff pada desktop serta mobile.

## 11. Pipeline dan Release Gate

1. Install dependency dari lockfile.
2. Jalankan lint, type-check, unit test, dan secret scan.
3. Jalankan integration test dengan PostgreSQL container.
4. Build image production dan uji migration.
5. Jalankan dependency, SAST, dan image scan.
6. Jalankan E2E smoke pada environment sementara.
7. Deploy sesuai approval; jalankan smoke test dan verifikasi metrics.

Rilis diblokir bila migration, authorization, tenant isolation, build, atau test kritis gagal; vulnerability critical/high belum ditangani; demo auth aktif di production; upload dapat melewati authorization; atau backup/restore belum diuji.


