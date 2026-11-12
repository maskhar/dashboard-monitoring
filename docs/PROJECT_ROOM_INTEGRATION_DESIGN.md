# Rancangan Integrasi Ruang Proyek Utero

**Status:** proposed  
**Tanggal:** 7 November 2026  
**Sumber fitur:** `1793773405-0d61.html`  
**Target sistem:** Dashboard Monitoring Utero berbasis Next.js, PostgreSQL, Drizzle, dan Auth.js

## 1. Tujuan

Mengubah prototipe Ruang Proyek Utero menjadi modul native pada Dashboard Monitoring Utero. PostgreSQL menjadi satu-satunya sumber data. Fitur tidak mempertahankan database Claude Artifact atau `localStorage` sebagai sumber data kedua.

Hasil integrasi harus:

- memakai project, user, assignment, evidence, approval, notification, dan audit yang sudah tersedia;
- menambah data komersial, RAB/HPP, fase, tahap, dan checklist dokumen per proyek;
- menjaga otorisasi pada server, bukan hanya menyembunyikan kontrol UI;
- mendukung histori perubahan, optimistic concurrency, dan soft delete;
- dapat mengimpor data lama dari prototipe tanpa membuat proyek duplikat;
- tidak mengubah modul Operations yang saat ini berbasis monitoring period.

## 2. Keputusan Arsitektur

### 2.1 Bentuk integrasi

Gunakan satu modular monolith dan satu PostgreSQL:

```text
Browser
  |
  | HTTPS + Auth.js session
  v
Next.js Dashboard
  |-- Project UI yang sudah ada
  |-- Ruang Proyek baru
  |-- Route handlers /api/projects/{id}/workspace/*
  |-- Domain service + authorization + audit
  v
PostgreSQL
  |-- projects dan project_assignments yang sudah ada
  |-- tabel workspace proyek baru
  |-- attachments/evidence, approvals, notifications, audit yang sudah ada
```

Claude DB dan `localStorage` hanya dipakai sebagai sumber migrasi satu kali. Setelah migrasi, klien membaca dan menulis melalui API dashboard.

### 2.2 Alasan tidak melakukan sinkronisasi dua arah

Sinkronisasi PostgreSQL dengan Claude DB atau `localStorage` menambah konflik versi, identitas proyek ganda, data finansial berbeda, dan jalur audit yang tidak lengkap. Sistem saat ini sudah dirancang untuk mengganti dashboard HTML lokal dengan sumber data bersama. Karena itu integrasi harus berupa pemindahan fitur, bukan replikasi dua sistem aktif.

### 2.3 Batas modul

- `projects` tetap menjadi identitas utama proyek.
- `project_assignments` tetap menjadi sumber anggota dan akses proyek.
- Ruang Proyek menyimpan detail eksekusi dan komersial untuk satu `project_id`.
- Operations tetap menyimpan KPI, weekly plan, daily milestone, dan gate periode organisasi.
- Gate proyek baru tidak memakai tabel `gates` saat ini karena tabel tersebut terikat ke `monitoring_periods`, bukan ke proyek.

## 3. Mapping Data

| Prototipe | Sistem sekarang | Keputusan |
|---|---|---|
| Nama proyek | `projects.brand` dan `projects.code` | Gunakan `code` sebagai identitas; `brand` sebagai nama/klien utama sesuai data sekarang. Tambah `client_name` bila nama proyek dan klien perlu dipisahkan. |
| Klien | Belum khusus | Tambah pada profil workspace. Jangan menimpa `brand` otomatis. |
| Lokasi | Belum khusus | Tambah pada profil workspace. |
| Jenis proyek | `projects.category` | Pakai `category`; field profil hanya bila butuh nilai operasional berbeda. |
| Nilai kontrak | Belum ada | Tambah ke tabel finansial. |
| Target margin, retensi, pajak | Belum ada | Tambah ke tabel finansial. |
| RAB/HPP | Belum ada | Tambah header finansial dan item biaya. |
| 7 peran tim | `project_assignments` | Perluas nilai `role`; gunakan user ID, bukan nama bebas. |
| 16 tahap | `tasks` sebagian cocok | Buat tabel tahap proyek khusus agar urutan, fase, tanggal rencana, dan template tetap konsisten. Task umum boleh ditautkan nanti. |
| 13 checklist dokumen | Attachments/evidence belum menyimpan requirement | Tambah requirement/checklist; bukti memakai storage dan authorization yang sudah ada. |
| 6 fase dan gate | Belum project-scoped | Tambah template fase dan status gate per proyek. |
| Catatan | `projects.notes`, comments | Catatan umum tetap di `projects.notes`; diskusi memakai comments. |
| Updated timestamp | Sudah ada | Semua mutasi menaikkan `workspace_version` dan menulis audit. |

## 4. Model Data Usulan

Semua nilai uang memakai `numeric(19,2)`. Persentase memakai `numeric(7,4)`. Timestamp memakai UTC; tanggal kerja memakai `date`.

### 4.1 `project_workspaces`

Satu baris untuk satu proyek.

| Kolom | Tipe | Aturan |
|---|---|---|
| `project_id` | uuid PK/FK | FK `projects.id`, cascade delete hanya untuk hard purge terkontrol |
| `client_name` | text | nullable |
| `location` | text | nullable |
| `deal_date` | date | nullable |
| `contract_value` | numeric(19,2) | >= 0 |
| `currency` | char(3) | default `IDR` |
| `target_margin_pct` | numeric(7,4) | 0-100 |
| `retention_pct` | numeric(7,4) | 0-100 |
| `overhead_pct` | numeric(7,4) | 0-100 |
| `contingency_pct` | numeric(7,4) | 0-100 |
| `vat_enabled` | boolean | default false |
| `vat_pct` | numeric(7,4) | default 11; nilai harus configurable |
| `withholding_enabled` | boolean | default false |
| `withholding_pct` | numeric(7,4) | default 2 |
| `commercial_status` | text | `DRAFT`, `SUBMITTED`, `APPROVED`, `LOCKED` |
| `current_phase` | smallint | derived/cache 1-6; jangan menjadi sumber kebenaran tunggal |
| `version` | integer | optimistic concurrency, mulai 1 |
| `created_at`, `updated_at` | timestamptz | standar sistem |

Constraint penting:

```text
target_margin_pct + retention_pct < 100
semua persentase >= 0 dan <= 100
contract_value >= 0
```

### 4.2 `project_cost_items`

| Kolom | Tipe | Aturan |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK | index |
| `category` | text | enum aplikasi delapan kategori awal |
| `description` | text | wajib |
| `quantity` | numeric(18,4) | > 0 |
| `unit` | text | wajib |
| `unit_price` | numeric(19,2) | >= 0 |
| `actual_amount` | numeric(19,2) | nullable; `NULL` berarti belum dilaporkan |
| `position` | integer | urutan stabil |
| `version` | integer | optimistic concurrency |
| `archived_at`, `deleted_at` | timestamptz | soft lifecycle |
| `created_at`, `updated_at` | timestamptz | |

Nilai rencana dihitung server: `quantity * unit_price`. Nilai aktual tidak boleh default ke nol karena nol berarti biaya aktual memang nol.

### 4.3 `project_phase_instances`

Enam baris dibuat otomatis saat workspace dibuat.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK | |
| `phase_number` | smallint | 1-6, unik per proyek |
| `code` | text | `G1`, `G2`, `G3`, `G4`, `G5`, `CLOSE` |
| `name` | text | snapshot nama template |
| `decision_owner_role` | text | role assignment yang berwenang |
| `status` | text | `WAITING`, `ACTIVE`, `READY`, `APPROVAL_PENDING`, `PASSED`, `REOPENED` |
| `passed_at` | timestamptz | nullable |
| `passed_by` | uuid FK users | nullable |
| `version` | integer | |

Status fase bukan hasil checkbox murni. Requirement lengkap membuat fase `READY`; approval/otoritas membuat fase `PASSED`.

### 4.4 `project_stage_instances`

Enam belas baris dibuat dari template saat workspace dibuat.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK | |
| `phase_number` | smallint | 1-6 |
| `stage_number` | smallint | 1-16, unik per proyek |
| `title` | text | snapshot template |
| `default_role` | text | role PIC tahap |
| `assignee_id` | uuid FK users | nullable |
| `planned_start` | date | nullable |
| `planned_end` | date | nullable |
| `actual_start` | date | nullable |
| `actual_end` | date | nullable |
| `status` | work_status | pakai enum yang sudah ada |
| `progress` | integer | 0-100 |
| `version` | integer | |

Validasi server:

- `planned_end >= planned_start`;
- `actual_end >= actual_start`;
- stage tidak boleh `COMPLETED` tanpa `actual_end`;
- stage fase berikutnya tidak boleh dimulai bila gate sebelumnya belum lolos, kecuali override Admin dengan alasan dan audit.

### 4.5 `project_document_requirements`

Tiga belas baris dibuat dari template. Tabel menyimpan requirement, bukan file binary.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | |
| `project_id` | uuid FK | |
| `phase_number` | smallint | |
| `code` | text | unik per proyek |
| `label` | text | snapshot template |
| `required` | boolean | default true |
| `status` | text | `MISSING`, `UPLOADED`, `IN_REVIEW`, `ACCEPTED`, `REJECTED`, `WAIVED` |
| `attachment_id` | uuid FK | nullable; merujuk metadata file sistem sekarang |
| `reviewed_by` | uuid FK users | nullable |
| `reviewed_at` | timestamptz | nullable |
| `review_note` | text | nullable |
| `version` | integer | |

Checklist manual hanya boleh untuk `WAIVED` dan memerlukan Admin, alasan, serta audit. Status normal mengikuti upload dan review evidence.

### 4.6 Assignment role

Tetap gunakan `project_assignments`, dengan role:

```text
PIC
PIC_ASSISTANT
DESIGNER
PROJECT_LEADER
PRODUCTION_TEAM
FINANCE_ADMIN
INSTALLATION_SUPPORT
```

Ubah constraint saat ini yang hanya membatasi satu PIC menjadi aturan unik satu assignment aktif per `(project_id, role, user_id)`. Untuk `PIC`, `PROJECT_LEADER`, dan `FINANCE_ADMIN`, bisnis dapat membatasi satu user aktif per role. `PRODUCTION_TEAM` dan `INSTALLATION_SUPPORT` boleh banyak user.

Kontrol konflik: user yang sama tidak boleh memegang `PIC` dan `FINANCE_ADMIN` pada proyek yang sama, kecuali override Admin dengan alasan yang tercatat.

## 5. Kalkulasi Server

Semua KPI finansial dihitung oleh domain service server. Browser hanya menampilkan hasil.

```text
planned_hpp       = SUM(quantity * unit_price)
actual_hpp        = SUM(actual_amount) untuk nilai yang sudah dilaporkan
overhead          = planned_hpp * overhead_pct / 100
contingency       = planned_hpp * contingency_pct / 100
planned_cost      = planned_hpp + overhead + contingency
retention         = contract_value * retention_pct / 100
minimum_price     = planned_cost / (1 - retention_pct/100 - target_margin_pct/100)
planned_margin    = contract_value - planned_cost - retention
planned_margin_pc = planned_margin / contract_value * 100
actual_margin     = contract_value - actual_hpp - overhead_actual - retention
```

Keputusan pajak harus eksplisit sebelum implementasi:

- apakah `contract_value` termasuk atau belum termasuk PPN;
- apakah PPh merupakan potongan kas, beban proyek, atau piutang pajak;
- apakah retensi mengurangi margin atau hanya menunda penerimaan kas.

Sampai Finance menetapkan definisi, API mengembalikan pajak dan retensi sebagai komponen terpisah dan tidak menyebut hasil sebagai laba bersih.

## 6. API Usulan

Endpoint mengikuti route yang sudah ada, tanpa prefix versi baru pada tahap awal.

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| `GET` | `/api/projects/{id}/workspace` | anggota proyek/Admin | snapshot lengkap workspace |
| `POST` | `/api/projects/{id}/workspace` | Admin | inisialisasi dari template |
| `PATCH` | `/api/projects/{id}/workspace` | sesuai field policy | ubah profil/komersial dengan version |
| `GET` | `/api/projects/{id}/cost-items` | anggota proyek/Admin | daftar RAB |
| `POST` | `/api/projects/{id}/cost-items` | PL/Admin | tambah item |
| `PATCH` | `/api/projects/{id}/cost-items/{itemId}` | PL/Finance/Admin | ubah item sesuai field policy |
| `DELETE` | `/api/projects/{id}/cost-items/{itemId}` | PL/Admin | soft delete item |
| `PATCH` | `/api/projects/{id}/stages/{stageId}` | assignee/PL/Admin | tanggal, status, progres |
| `POST` | `/api/projects/{id}/documents/{requirementId}/attachment` | anggota terkait | upload evidence lewat pipeline scanner |
| `POST` | `/api/projects/{id}/documents/{requirementId}/review` | owner gate/Admin | accept/reject |
| `POST` | `/api/projects/{id}/phases/{phaseId}/submit` | owner gate | ajukan gate |
| `POST` | `/api/projects/{id}/phases/{phaseId}/reopen` | Admin | buka ulang dengan alasan |
| `POST` | `/api/projects/{id}/workspace/duplicate` | Admin | salin template tanpa realisasi/dokumen |
| `POST` | `/api/projects/workspace-imports` | Admin | import hasil ekstraksi prototipe |

Semua mutasi menerima `version`. Version berbeda menghasilkan `409 Conflict` dengan snapshot terbaru.

Contoh respons ringkas:

```json
{
  "project": { "id": "...", "code": "DP-101", "brand": "..." },
  "workspace": { "version": 7, "currentPhase": 3, "commercialStatus": "APPROVED" },
  "metrics": {
    "plannedHpp": "12500000.00",
    "actualHpp": "9300000.00",
    "minimumPrice": "18181818.18",
    "plannedMarginPct": "26.92",
    "completedStages": 6,
    "lateStages": 1,
    "acceptedDocuments": 5,
    "requiredDocuments": 13
  },
  "assignments": [],
  "phases": [],
  "stages": [],
  "costItems": [],
  "documents": []
}
```

## 7. Otorisasi

### 7.1 Prinsip

- Admin dapat membaca dan mengelola seluruh workspace.
- Staff hanya dapat membaca proyek dengan assignment aktif.
- Hak edit ditentukan oleh assignment role dan jenis field.
- Setiap endpoint memanggil `canAccessEntity` lalu policy khusus workspace.
- UI disabled/hidden bukan kontrol keamanan.

### 7.2 Matrix ringkas

| Aksi | PIC | Project Leader | Finance | Role lain | Admin |
|---|---:|---:|---:|---:|---:|
| Lihat workspace | Ya | Ya | Ya | Ya | Ya |
| Ubah identitas/lokasi | Ya | Ya | Tidak | Tidak | Ya |
| Ubah kontrak/margin/pajak | Ajukan | Tidak | Ajukan | Tidak | Ya/approve |
| Ubah RAB rencana | Lihat | Ya | Lihat | Tidak | Ya |
| Isi realisasi biaya | Lihat | Ya | Ya | Tidak | Ya |
| Ubah tahap milik sendiri | Sesuai tugas | Ya | Sesuai tugas | Sesuai tugas | Ya |
| Review dokumen gate | Sesuai owner | Sesuai owner | Sesuai owner | Tidak | Ya |
| Loloskan/reopen gate | Ajukan | Ajukan | Ajukan | Tidak | Ya |
| Hapus/arsip workspace | Tidak | Tidak | Tidak | Tidak | Ya |

## 8. Approval, Audit, dan Notifikasi

Gunakan tabel `approvals`, `approval_actions`, `audit_events`, dan `notification_jobs` yang sudah ada.

Approval type baru:

```text
PROJECT_COMMERCIAL_APPROVAL
PROJECT_GATE_APPROVAL
PROJECT_BUDGET_OVERRIDE
PROJECT_ROLE_CONFLICT_OVERRIDE
PROJECT_STAGE_SEQUENCE_OVERRIDE
PROJECT_DOCUMENT_WAIVER
```

Event audit minimum:

```text
project.workspace.created
project.workspace.updated
project.cost_item.created|updated|deleted
project.stage.updated
project.document.uploaded|accepted|rejected|waived
project.phase.submitted|passed|reopened
project.commercial.submitted|approved|locked
project.workspace.imported
```

Notifikasi minimum:

- tahap terlambat kepada assignee, PIC, dan Project Leader;
- gate siap diajukan kepada owner;
- gate diajukan kepada Admin/decider;
- dokumen ditolak kepada uploader dan PIC;
- realisasi biaya lebih dari 110% RAB kepada Project Leader, Finance, dan Admin;
- margin di bawah target kepada PIC, Finance, dan Admin.

Gunakan transactional outbox yang sudah ada agar mutasi bisnis dan enqueue notifikasi berada dalam satu transaksi.

## 9. UI Terintegrasi

### 9.1 Navigasi

Jangan menambah aplikasi terpisah. Tambahkan aksi `Buka Ruang Proyek` pada detail proyek dan route dashboard:

```text
/projects/{projectId}/workspace
```

Jika dashboard tetap single-page pada iterasi pertama, section baru dapat bernama `project-workspace`, tetapi URL route lebih baik untuk deep-link dan refresh.

### 9.2 Susunan halaman

Pertahankan pola visual dashboard sekarang, bukan CSS prototipe secara mentah.

```text
Header proyek + status sinkronisasi
Rail 6 fase
KPI: kontrak, HPP, margin, progres tahap, dokumen
Tabs:
  1. Ringkasan
  2. HPP & Harga Jual
  3. Tim Kerja
  4. Timeline
  5. Administrasi
  6. Audit/Activity
```

Perubahan terhadap prototipe:

- nama anggota dipilih dari user aktif, bukan input teks bebas;
- dokumen diunggah, dipindai, lalu direview; bukan checkbox bebas;
- autosave memakai mutation API dan version, bukan timer yang menulis seluruh object;
- status save menunjukkan `Menyimpan`, `Tersimpan`, `Konflik versi`, atau `Gagal`;
- kalkulasi berasal dari response server;
- activity tab menampilkan comments, approval, dan audit yang boleh dilihat user;
- mobile menampilkan tabel RAB dan timeline sebagai card list sesuai pola dashboard sekarang.

## 10. Sinkronisasi dan Konsistensi

### 10.1 Model konsistensi

Gunakan server-authoritative optimistic concurrency:

1. UI membaca snapshot dengan `version`.
2. Mutation mengirim perubahan granular dan `version` terakhir.
3. Server mengunci/mengecek row, menerapkan perubahan, menaikkan version, menulis audit.
4. Jika version sudah berubah, server mengembalikan `409` dan snapshot baru.
5. UI meminta user memuat perubahan atau mengulang edit pada snapshot terbaru.

Tahap awal dapat memakai refetch setelah mutation. Real-time WebSocket/SSE belum diperlukan. Polling ringan 30-60 detik hanya untuk detail yang sedang dibuka dapat ditambahkan setelah kebutuhan kolaborasi terbukti.

### 10.2 Transaksi penting

Satu transaksi wajib mencakup:

- inisialisasi workspace + fase + tahap + requirement dokumen;
- submit/passing gate + approval action + audit + notification job;
- perubahan kontrak/RAB yang memengaruhi kalkulasi + audit;
- import satu proyek beserta seluruh turunannya;
- duplicate workspace beserta template, tanpa actual dan attachment.

## 11. Migrasi Data Prototipe

### 11.1 Format ekspor

Tambahkan alat migrasi sementara yang menerima JSON hasil `utero.projects` atau export dari Claude Artifact. Jangan jalankan skrip prototipe di browser production.

Payload import harus membawa:

```text
legacy_id
nama, klien, lokasi, jenis, tanggalDeal
nilaiKontrak dan konfigurasi margin/pajak
items
team
stages
docs
catatan
updatedAt
```

### 11.2 Proses import

1. Admin mengunggah JSON pada preview mode.
2. Server memvalidasi schema dan menampilkan kandidat mapping proyek/user.
3. Proyek dicocokkan berdasarkan mapping manual, bukan hanya nama.
4. Nama tim dicocokkan ke user aktif; nilai ambigu wajib diselesaikan Admin.
5. Checklist dokumen lama diimpor sebagai `LEGACY_CONFIRMED`, bukan `ACCEPTED`, karena file belum tersedia.
6. Import commit berjalan atomik per proyek dan menulis `data_jobs` serta audit.
7. File sumber disimpan privat sementara sesuai kebijakan retensi import.

Idempotency key:

```text
project-workspace-import:{source_hash}:{legacy_id}
```

Import ulang dengan key sama tidak membuat duplikat.

## 12. Rollout

### Fase 0 - Konfirmasi aturan bisnis

- Finance menetapkan definisi kontrak, PPN, PPh, retensi, dan margin aktual.
- Operations menetapkan owner tiap gate dan aturan reopen.
- Admin menetapkan role assignment yang boleh banyak user.

### Fase 1 - Fondasi database dan domain

- Tambah migration tabel workspace.
- Tambah template enam fase, enam belas tahap, dan tiga belas requirement.
- Tambah service kalkulasi, authorization, audit, dan test domain.
- Belum tampilkan UI kepada user.

### Fase 2 - Read-only workspace

- Tambah endpoint GET dan halaman detail.
- Tampilkan mapping proyek existing dan kalkulasi server.
- Uji akses Admin/Staff dan responsive UI.

### Fase 3 - Mutasi inti

- Aktifkan profil, assignment, RAB, realisasi, dan timeline.
- Terapkan version conflict dan audit.
- Tambah upload/review dokumen melalui pipeline evidence sekarang.

### Fase 4 - Gate dan approval

- Aktifkan submit/pass/reopen gate.
- Tambah approval type dan notification event.
- Terapkan lock komersial setelah G1/G2 sesuai keputusan bisnis.

### Fase 5 - Import dan cutover

- Jalankan dry-run import data prototipe.
- Rekonsiliasi jumlah proyek, HPP, kontrak, tahap, dan dokumen.
- Bekukan perubahan pada prototipe.
- Jalankan import final dan umumkan dashboard sebagai sumber data resmi.

### Fase 6 - Hardening

- Export Excel/PDF ruang proyek.
- Alert biaya dan keterlambatan.
- Monitoring query dan job.
- Backup/restore mencakup tabel baru dan attachment.

## 13. Test dan Acceptance Criteria

### Domain

- kalkulasi uang presisi dan tidak memakai floating point browser;
- target margin + retensi 100% atau lebih ditolak;
- actual `NULL` berbeda dari actual `0`;
- fase tidak lolos bila requirement wajib belum accepted/waived;
- tahap berikutnya ditolak ketika gate belum lolos tanpa override;
- konflik version menghasilkan 409 tanpa kehilangan perubahan user lain.

### Authorization

- Staff tanpa assignment menerima 403 untuk seluruh endpoint workspace;
- role tidak terkait tidak dapat mengubah kontrak atau RAB;
- user yang sama tidak dapat menjadi PIC dan Finance tanpa override;
- attachment tidak dapat diunduh di luar scope proyek.

### Audit dan approval

- setiap perubahan finansial menyimpan before/after;
- approval memakai base version dan menolak snapshot usang;
- reopen gate menyimpan alasan dan actor;
- notification job dibuat satu kali melalui idempotency key.

### Migrasi

- import ulang tidak membuat duplikat;
- total HPP hasil import sama dengan prototipe untuk data valid;
- nama anggota ambigu tidak dipetakan otomatis;
- checklist tanpa file tidak dianggap evidence accepted.

### UI

- desktop dan mobile dapat mengelola RAB, tahap, dan dokumen;
- status save dan conflict dapat dipahami tanpa membuka developer tools;
- halaman dapat direfresh tanpa kehilangan state tersimpan;
- dark mode dan akses keyboard mengikuti dashboard sekarang.

## 14. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Definisi margin/pajak belum final | Angka salah secara bisnis | Gate implementasi finansial menunggu keputusan Finance |
| Duplikasi konsep gate | Kebingungan dengan Operations | Gunakan nama dan tabel project-scoped; dokumentasikan batas modul |
| Import nama tim bebas | Assignment salah | Mapping manual ke user ID dan daftar ambiguity |
| Checkbox lama tanpa file | Bukti palsu | Status `LEGACY_CONFIRMED`, bukan accepted |
| Autosave kolaboratif menimpa data | Kehilangan perubahan | Mutation granular + optimistic version |
| Tabel detail tumbuh besar | Query detail lambat | Index project/status/date, pagination activity, query metrics terukur |
| RAB sensitif terlihat semua staff | Kebocoran finansial | Field-level response policy; role tertentu menerima metrics terbatas |

## 15. Urutan Implementasi File

Perubahan diperkirakan menyentuh:

```text
src/db/schema.ts
drizzle/<migration>.sql
src/lib/server/project-workspace.ts
src/lib/server/project-workspace-policy.ts
src/lib/project-workspace-metrics.ts
src/app/api/projects/[id]/workspace/route.ts
src/app/api/projects/[id]/cost-items/*
src/app/api/projects/[id]/stages/*
src/app/api/projects/[id]/documents/*
src/app/api/projects/[id]/phases/*
src/app/projects/[id]/workspace/page.tsx
src/components/project-workspace/*
tests/domain/project-workspace*.test.ts
tests/e2e/project-workspace.spec.ts
docs/API.md
docs/DATABASE.md
docs/USER_GUIDE.md
```

## 16. Definition of Done

Integrasi selesai ketika:

- tidak ada read/write runtime ke Claude DB atau `utero.projects`;
- satu proyek dashboard memiliki satu workspace PostgreSQL;
- data finansial, tahap, fase, assignment, dan dokumen punya authorization server;
- gate memakai evidence/review dan approval, bukan checkbox saja;
- semua mutasi penting tercatat pada audit;
- migrasi legacy tervalidasi dan idempotent;
- test domain, API, authorization, E2E, lint, typecheck, build, backup, dan restore lulus.

