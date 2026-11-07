# Kontrak API Dashboard Monitoring Utero

Dokumen ini mendefinisikan kontrak HTTP target MVP. Endpoint final harus mengikuti implementasi dan OpenAPI ketika route tersedia. UI dapat memakai Server Actions untuk mutasi internal; Route Handlers dipakai untuk download, webhook, health, dan integrasi. Kontrak keamanan tetap berlaku pada keduanya.

## 1. Prinsip

- Base path rekomendasi: `/api/v1`.
- Payload dan respons memakai JSON, kecuali upload/download dan export streaming.
- Timestamp memakai ISO 8601 UTC; business date memakai `YYYY-MM-DD` dalam `Asia/Jakarta`.
- Semua mutasi memvalidasi session, role, ownership, state, input, dan `version`.
- Daftar proyek, approval, audit, notifikasi, dan job memakai pagination server-side.
- Request yang dapat diulang memakai `Idempotency-Key`.
- Error memakai kode stabil; client tidak boleh mem-parsing teks pesan.

## 2. Autentikasi dan Session

Session berbasis cookie `HttpOnly`, `Secure` di production, dan `SameSite=Lax` atau lebih ketat. Request state-changing wajib mendapat proteksi CSRF.

| Method | Path | Akses | Fungsi |
|---|---|---|---|
| `POST` | `/api/v1/auth/dev/sign-in` | Development | Login email/password lokal. |
| `POST` | `/api/v1/auth/demo` | Development | Membuat session demo Admin atau Staff. |
| `GET` | `/api/auth/signin/google` | Production | Memulai Google OAuth/OIDC. |
| `POST` | `/api/v1/auth/sign-out` | Login | Mengakhiri session. |
| `GET` | `/api/v1/me` | Login | Mengambil user, organisasi, role, dan permission efektif. |

Endpoint development tidak boleh dibangun atau diaktifkan di production.

## 3. Header Umum

```http
Accept: application/json
Content-Type: application/json
Idempotency-Key: 8d7c8b7e-...
If-Match: "12"
X-CSRF-Token: ...
```

`If-Match` atau field `version` mencegah last-write-wins. Server mengembalikan `X-Request-ID`; sertakan nilainya saat melaporkan error.

## 4. Bentuk Respons

### Sukses

```json
{
  "data": { "id": "01J...", "version": 12 },
  "meta": { "requestId": "req_01J..." }
}
```

### Daftar

```json
{
  "data": [],
  "page": { "nextCursor": null, "hasMore": false },
  "meta": { "requestId": "req_01J..." }
}
```

### Error

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Data telah berubah. Muat ulang sebelum melanjutkan.",
    "fieldErrors": {},
    "requestId": "req_01J..."
  }
}
```

| HTTP | Kode contoh | Arti |
|---:|---|---|
| `400` | `VALIDATION_ERROR` | Payload atau filter tidak valid. |
| `401` | `AUTHENTICATION_REQUIRED` | Session hilang atau kedaluwarsa. |
| `403` | `FORBIDDEN` | Role, ownership, atau state tidak mengizinkan aksi. |
| `404` | `NOT_FOUND` | Resource tidak ada atau di luar scope. |
| `409` | `VERSION_CONFLICT` | Versi record berubah. |
| `409` | `RECORD_NOT_SUBMITTABLE` | State tidak mengizinkan submit. |
| `409` | `ACTIVE_SUBMISSION_EXISTS` | Submission aktif sudah tersedia. |
| `413` | `FILE_TOO_LARGE` | File melewati batas. |
| `415` | `UNSUPPORTED_FILE_TYPE` | Tipe/MIME file ditolak. |
| `422` | `IMPORT_HAS_BLOCKING_ERRORS` | Import tidak dapat diterapkan. |
| `429` | `RATE_LIMITED` | Batas request terlampaui. |
| `500` | `INTERNAL_ERROR` | Error internal tanpa detail sensitif. |

Error eksternal tidak boleh memuat stack trace, SQL, path storage, token, atau data user lain.

## 5. Resource dan Endpoint

### Pengguna

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/v1/users` | Admin |
| `POST` | `/api/v1/users` | Admin |
| `PATCH` | `/api/v1/users/{userId}` | Admin |
| `GET` | `/api/v1/organizations/{organizationId}/members` | Admin |
| `PATCH` | `/api/v1/organizations/{organizationId}/members/{memberId}` | Admin |

Perubahan role, aktivasi, deaktivasi, dan assignment wajib diaudit. Deaktivasi tidak menghapus histori.

### Proyek

| Method | Path | Akses |
|---|---|---|
| `GET` | `/api/v1/projects` | Sesuai scope |
| `POST` | `/api/v1/projects` | Admin |
| `GET` | `/api/v1/projects/{projectId}` | Sesuai scope |
| `PATCH` | `/api/v1/projects/{projectId}` | Admin |
| `POST` | `/api/v1/projects/{projectId}/progress` | Admin atau Staff owner |
| `PUT` | `/api/v1/projects/{projectId}/assignments` | Admin |

Filter: `status`, `program`, `category`, `assigneeId`, `deadlineFrom`, `deadlineTo`, `overdue`, `dataIssue`, `q`, dan `cursor`.

```json
{
  "progress": 75,
  "status": "IN_PROGRESS",
  "note": "Materi utama selesai; menunggu review.",
  "version": 12
}
```

### KPI dan onboarding

| Method | Path | Akses |
|---|---|---|
| `GET` | `/api/v1/kpis` | Sesuai scope |
| `POST` | `/api/v1/kpis` | Admin |
| `PATCH` | `/api/v1/kpis/{kpiId}` | Admin |
| `POST` | `/api/v1/kpis/{kpiId}/reports` | Admin atau Staff owner |
| `GET` | `/api/v1/onboarding/templates` | Admin |
| `POST` | `/api/v1/onboarding/templates` | Admin |
| `POST` | `/api/v1/onboarding/enrollments` | Admin |
| `GET` | `/api/v1/onboarding/enrollments` | Sesuai scope |
| `PATCH` | `/api/v1/onboarding/enrollments/{id}/items/{itemId}` | Staff owner, mentor, atau Admin |

Nilai KPI aktual `null` berarti belum dilaporkan. Nilai uang dikirim sebagai string decimal, contoh `"1500000.00"`.

### Evidence

| Method | Path | Akses |
|---|---|---|
| `POST` | `/api/v1/evidence/uploads` | Sesuai entity scope |
| `POST` | `/api/v1/evidence` | Sesuai entity scope |
| `GET` | `/api/v1/evidence/{evidenceId}/download` | Sesuai object scope |
| `DELETE` | `/api/v1/evidence/{evidenceId}` | Owner sebelum approval atau Admin |

Upload memakai streaming multipart atau signed upload. File besar tidak dimuat seluruhnya ke memory. Download selalu melakukan authorization server-side dan memakai URL singkat atau `Content-Disposition: attachment`.

### Submission dan approval

Status aplikasi: `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `REVISION_REQUESTED`, dan `CANCELLED`. Implementasi domain harus memetakan `PENDING` ke event `SUBMITTED` secara eksplisit.

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/v1/submissions` | Staff/Admin sesuai scope |
| `PATCH` | `/api/v1/submissions/{id}` | Author saat draft/revisi |
| `POST` | `/api/v1/submissions/{id}/submit` | Author |
| `POST` | `/api/v1/submissions/{id}/cancel` | Author sebelum keputusan |
| `GET` | `/api/v1/approvals` | Admin; Staff untuk histori sendiri |
| `POST` | `/api/v1/approvals/{id}/approve` | Admin |
| `POST` | `/api/v1/approvals/{id}/reject` | Admin |
| `POST` | `/api/v1/approvals/{id}/request-revision` | Admin |

Reject dan request revision wajib memiliki `decisionNote`. Update entity, keputusan, audit, dan outbox terjadi dalam satu transaksi.

### Import, export, dan PDF

| Method | Path | Akses |
|---|---|---|
| `POST` | `/api/v1/imports` | Admin |
| `POST` | `/api/v1/imports/{jobId}/validate` | Admin |
| `POST` | `/api/v1/imports/{jobId}/commit` | Admin |
| `GET` | `/api/v1/imports/{jobId}` | Admin |
| `GET` | `/api/v1/imports/{jobId}/errors` | Admin |
| `POST` | `/api/v1/exports` | Sesuai scope |
| `POST` | `/api/v1/reports/pdf` | Sesuai scope |
| `GET` | `/api/v1/jobs/{jobId}` | Creator atau Admin |
| `GET` | `/api/v1/jobs/{jobId}/download` | Creator atau Admin sesuai scope |

Commit import atomik per batch. Data kecil dapat di-stream sinkron; data besar menghasilkan `202 Accepted` dan job ID. Artefak memiliki expiry, checksum, dan audit download.

Implementasi report proyek sinkron tersedia melalui `GET /api/reports/excel` dan `GET /api/reports/pdf`. Keduanya mengekspor seluruh proyek dalam scope pengguna, menyertakan ringkasan agregat, dan menerima query `q`, `status`, serta `archived=active|archived|deleted|all`. Nilai selain `active` efektif untuk Admin; Staff tetap dibatasi ke proyek aktif yang ditugaskan.

```json
{
  "resource": "PROJECTS",
  "format": "XLSX",
  "filters": { "status": ["IN_PROGRESS", "REVIEW"], "overdue": true },
  "includeApprovalHistory": false
}
```

### Notifikasi, audit, dan health

| Method | Path | Akses |
|---|---|---|
| `GET` | `/api/v1/notification-preferences` | User sendiri |
| `PATCH` | `/api/v1/notification-preferences` | User sendiri |
| `GET` | `/api/v1/notifications` | User sendiri |
| `POST` | `/api/v1/webhooks/email/{provider}` | Provider tervalidasi |
| `POST` | `/api/v1/webhooks/whatsapp/{provider}` | Provider tervalidasi |
| `GET` | `/api/v1/audit-events` | Admin/scope terbatas |
| `GET` | `/api/v1/audit-events/{id}` | Admin/scope terbatas |
| `GET` | `/api/health/live` | Sistem monitoring |
| `GET` | `/api/health/ready` | Sistem monitoring |

Webhook memvalidasi signature, timestamp, replay window, dan idempotency. Audit tidak memiliki endpoint update/delete. Liveness tidak bergantung provider eksternal; readiness memeriksa database dan storage tanpa membocorkan detail dependency.

## 6. Rate Limit dan Versioning

Terapkan rate limit berbeda untuk login, upload, import, export, report, dan webhook. Response `429` menyertakan `Retry-After` bila aman.

- Perubahan kompatibel tidak mengubah arti field yang ada.
- Breaking change membuat versi baru dan migration guide.
- Field deprecated memiliki tanggal, pengganti, dan minimal satu siklus rilis.
- OpenAPI menjadi referensi final setelah route diimplementasikan; contoh request diuji di CI.


## Endpoint Lampiran Implementasi

| Method | Endpoint | Fungsi |
|---|---|---|
| `GET` | `/api/evidence?entityType=PROJECT|TASK&entityId={uuid}` | Daftar file lampiran sesuai scope akses |
| `POST` | `/api/evidence` | Unggah file multipart untuk proyek, tugas, KPI, rencana mingguan, milestone, atau gate |
| `GET` | `/api/evidence/{id}` | Unduh file setelah authorization server-side |
| `GET` | `/api/attachments?entityType=PROJECT|TASK&entityId={uuid}` | Daftar link Google Drive/eksternal |
| `POST` | `/api/attachments` | Tambah link `http`/`https`; aktivitas dicatat di audit log |
