# Roadmap Pengembangan

Roadmap ini memakai estimasi `S` (1-3 hari), `M` (4-7 hari), dan `L` (8-15 hari) per developer, termasuk test tetapi belum termasuk UAT.

## Prinsip Urutan

1. Bangun fondasi job, scheduler, permission, dan release security lebih dahulu.
2. Tambahkan automation dan collaboration setelah authorization stabil.
3. Tambahkan planning, analytics, dan compliance setelah lifecycle data konsisten.
4. Setiap epic wajib memiliki migration, authorization server-side, audit, unit test, integration test, dan E2E pada alur kritis.

## Epic 0 - Fondasi Jobs dan Scheduler

**Estimasi:** M + M + S. **Dependency:** tidak ada.

- Standardisasi job: status, schedule, lease, retry, correlation ID, idempotency key, dan safe error.
- Scheduler memakai PostgreSQL advisory lock dan zona waktu `Asia/Jakarta`.
- Standardisasi event serta audit contract.

**Selesai bila:** dua worker tidak memproses job sama; restart tidak menggandakan efek; stale job pulih; monitor mendeteksi scheduler tertinggal.

## Epic 1 - Granular Permissions

**Estimasi:** M + M + L + M. **Dependency:** Epic 0 event contract.

- Catalog permission tetap seperti `project.manage`, `task.update_assigned`, `report.schedule`, `trash.purge`, dan `audit.export`.
- Tabel role, permission, role-permission, dan user-role dengan migrasi kompatibel Admin/Staff.
- Policy terpusat menggantikan pemeriksaan role tersebar.
- UI matriks permission dengan diff, konfirmasi, dan audit.

**Selesai bila:** seluruh API, export, evidence, worker, dan query scoped memakai deny-by-default; UI bukan satu-satunya kontrol.

## Epic 2 - Deadline Reminder dan SLA

**Estimasi:** M + M + M + L. **Dependency:** Jobs, scheduler, permissions.

- Reminder H-3, H-1, hari H, dan overdue digest.
- Preferensi kanal dan quiet hours per user.
- SLA approval dan task dengan jam kalender atau jam kerja.
- Eskalasi bertingkat ke reviewer dan Admin.

**Selesai bila:** reminder idempotent; perubahan deadline membatalkan jadwal lama; item selesai/arsip tidak diberi reminder; breach terlihat dan teraudit.

## Epic 3 - Recurring Tasks dan Template

**Estimasi:** M + M + M + M. **Dependency:** Jobs, scheduler, permissions.

- Template versioned untuk task dan checklist.
- Recurrence harian, mingguan, bulanan, hari kerja, pause, resume, terminate.
- Generator occurrence dengan unique key dan preview 10 jadwal berikutnya.
- UI membedakan task manual dan recurring.

**Selesai bila:** rerun tidak membuat duplikat; perubahan template tidak mengubah task lama; assignee tidak aktif menghasilkan warning aman.

## Epic 4 - Dependency dan Critical Path

**Estimasi:** M + M + L + L. **Dependency:** Task model stabil dan permissions.

- Dependency awal `finish-to-start`.
- Tolak self-reference, duplicate edge, dan cycle secara transaksional.
- Hitung earliest start/finish, slack, dan critical flag.
- Gantt menampilkan blocker, dampak jadwal, dan fallback list mobile.

**Selesai bila:** perhitungan deterministik; task blocked terlihat; bulk action tidak melanggar dependency.

## Epic 5 - Mention dan Attachment

**Estimasi:** M + M + M. **Dependency:** Permissions dan evidence pipeline.

- Mention tersimpan sebagai relation user, bukan parsing nama tampilan.
- Attachment comment/task memakai MIME validation, magic bytes, checksum, ClamAV, dan authorization download.
- Composer accessible dengan autocomplete, upload progress, scan state, dan preview aman.

**Selesai bila:** user tanpa akses tidak dapat disebut atau menerima kebocoran notifikasi; file non-CLEAN tidak dapat diunduh.

## Epic 6 - Scheduled Reports

**Estimasi:** M + L + M. **Dependency:** Jobs, scheduler, permissions.

- Definisi jadwal menyimpan format, filter, timezone, recipient, owner, dan recurrence.
- Report besar diproses worker dengan output privat dan expiry.
- Delivery memakai link aman serta audit download.

**Selesai bila:** permission pembuat divalidasi ulang saat eksekusi; retry tidak membuat output ganda; jadwal dapat pause, resume, dan run-now.

## Epic 7 - Workload Capacity

**Estimasi:** M + M + L. **Dependency:** Permissions; lebih akurat setelah recurring/dependencies.

- Capacity per user dan periode dalam jam atau points.
- Estimate task serta allocation period.
- Dashboard capacity, assigned load, available load, overload, dan unestimated work.

**Selesai bila:** assignment menampilkan dampak kapasitas; completed/cancelled tidak menghitung future load; scope akses terjaga.

## Epic 8 - Trash Retention dan Permanent Delete

**Estimasi:** M + L + M. **Dependency:** Scheduler, permissions, attachment lifecycle.

- Lifecycle seragam: `deletedAt`, `deletedBy`, reason, restore, dan purge eligibility.
- Retention default 30 hari dengan purge batch, dry-run, dan legal hold.
- Permanent delete membutuhkan permission khusus, alasan, dan konfirmasi jumlah item.

**Selesai bila:** deleted item hilang dari query aktif/report/reminder; restore memeriksa konflik; audit tidak ikut dipurge.

## Epic 9 - Import Preview dan Rollback

**Estimasi:** L + L + L + L. **Dependency:** Jobs, permissions, trash lifecycle.

- Import session immutable dan staging rows.
- Mapping serta validation engine untuk header, enum, tanggal, duplicate, reference, dan conflict.
- Apply atomic dengan manifest before/after.
- Rollback preview dengan conflict detection dan window awal 7 hari.

**Selesai bila:** preview tidak mengubah business table; blocking error tidak dapat diterapkan; double-submit aman; rollback teraudit.

## Epic 10 - Session Revocation dan Cloudflare Access

**Estimasi:** L + M + M. **Dependency:** Permissions untuk administrasi session.

- Session database-backed dengan ID, expiry, revoked state, dan last-seen aman.
- User/Admin dapat revoke session sesuai permission.
- Cloudflare Access melindungi origin sebelum Nginx dengan prosedur break-glass.

**Selesai bila:** suspend atau perubahan privilege mencabut session; logout melakukan revoke server-side; direct origin tidak publik.

## Epic 11 - CSP Nonce dan Secret Management

**Estimasi:** S + L + M. **Dependency:** dapat dimulai paralel.

- Security header regression test.
- CSP nonce per response; hapus `unsafe-inline` untuk script setelah report-only rollout.
- Pindahkan production secret dari plaintext `.env` ke secret mechanism atau Vault-compatible manager.

**Selesai bila:** OAuth, hydration, theme, upload, dan report tetap lulus E2E; secret tidak masuk image, log, audit, atau client bundle.

## Epic 12 - Audit Export dan Retention

**Estimasi:** M + L. **Dependency:** Jobs dan permissions.

- Export filter actor/action/entity/result/date dengan redaction dan formula-injection protection.
- Async export dengan checksum, expiry, serta audit actor/filter/count.
- Retention, partitioning/archive, dan legal hold.

**Selesai bila:** role aplikasi tidak dapat mengubah/menghapus audit langsung; histori lama tetap dapat dicari dan direstore.

## Epic 13 - CI Security, Image Scan, dan SBOM

**Estimasi:** S + S + M + M. **Dependency:** tidak ada.

- Secret scan pada repository dan commit range.
- Dependency audit serta SAST.
- Build dan scan image production; temuan high/critical memblokir release kecuali exception terukur.
- SBOM CycloneDX/SPDX, checksum, provenance, dan hubungan image ke commit.

**Selesai bila:** setiap release dapat ditelusuri ke commit, image digest, scan result, dan SBOM.

## Urutan Sprint Rekomendasi

| Sprint | Fokus | Exit criteria utama |
|---|---|---|
| 0 | Jobs, scheduler, event contract, secret/image scan | Job idempotent dan CI security gate aktif |
| 1 | Permissions backend, session revocation foundation | Endpoint kritis deny-by-default |
| 2 | Permission UI, deadline reminders, session UI | Reminder idempotent; seluruh API scoped |
| 3 | SLA dan recurring tasks | Breach escalation dan recurring generator stabil |
| 4 | Mentions, attachments, scheduled reports | Kolaborasi aman dan report async |
| 5 | Trash retention dan import staging | Trash memiliki purge date; preview tidak memutasi data |
| 6 | Import apply/rollback, audit export, SBOM | Rollback atomic; release menghasilkan SBOM |
| 7 | Capacity planning dan report delivery | Overload berbasis kapasitas periodik |
| 8 | Dependencies dan critical path | Cycle ditolak; critical path deterministik |
| 9 | Cloudflare Access, CSP nonce, secret manager | Origin terlindungi dan secret tidak plaintext |

## Keputusan Produk Sebelum Sprint 1

1. Gunakan permission tetap dengan role terkelola, bukan role builder bebas.
2. Tentukan SLA memakai jam kerja atau kalender.
3. Tentukan capacity memakai jam atau points.
4. Gunakan trash retention awal 30 hari.
5. Gunakan import rollback window awal 7 hari.
6. Tentukan audit retention dan kebutuhan legal hold.
7. Putuskan Cloudflare Access sebagai lapisan tambahan atau identity utama.
8. Tentukan recurrence tanggal bulanan invalid: skip atau hari terakhir bulan.
