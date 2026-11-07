# Panduan Keamanan Dashboard Monitoring Utero

Dokumen ini menetapkan kontrol keamanan target untuk development, deployment, dan operasi. Temuan keamanan tidak boleh dikirim melalui issue publik atau menyertakan secret/data production. Laporkan melalui kanal keamanan internal Utero.

## 1. Model Keamanan

- Deny by default.
- RBAC `ADMIN`/`STAFF` digabung dengan organisasi, ownership, permission, dan state record.
- Policy berjalan di application use case, bukan hanya UI atau middleware.
- PostgreSQL, evidence storage, dan worker berada pada jaringan privat.
- Audit bisnis kritis ditulis dalam transaksi yang sama dengan perubahan data.
- Secret, token, password, cookie, dan isi evidence dilarang masuk log atau audit.

## 2. Autentikasi per Environment

### Development dan test

- Email/password lokal hanya aktif bila `AUTH_MODE` bukan `production` dan `AUTH_DEMO_ENABLED=true`.
- Tombol demo memerlukan `AUTH_MODE=development`, `AUTH_DEMO_ENABLED=true`, dan user seed lokal.
- Password disimpan dengan Argon2id atau bcrypt cost yang sesuai; jangan tanam secret dalam source/image.
- Test memakai identitas deterministik dan provider eksternal fake.

### Production

- Hanya Google OAuth/OIDC Authorization Code flow; gunakan PKCE bila relevan.
- Validasi `state`, `nonce`, issuer, audience, redirect URI, dan email verification.
- Batasi akses melalui allowlist domain atau email.
- Petakan identity ke subject Google permanen; email bukan satu-satunya identifier.
- Startup gagal bila dev/demo auth aktif, secret default dipakai, callback bukan HTTPS, atau evidence memakai storage ephemeral.

Staging harus production-like untuk menemukan masalah OAuth yang tidak terlihat pada login development.

## 3. Session, CSRF, dan Otorisasi

- Cookie session: `HttpOnly`, `Secure` di production, `SameSite=Lax` atau lebih ketat.
- Rotasi session setelah login dan perubahan privilege.
- Invalidasi session saat akun dinonaktifkan atau insiden kredensial.
- Mutasi berbasis cookie memakai proteksi CSRF.
- Tindakan sensitif dapat meminta recent authentication.
- Jangan menyimpan token auth di `localStorage`.

Setiap command/query memeriksa session, organisasi, role server-side, ownership/assignment, permission, state, dan version entity. Query list, detail, export, download, serta job status menerapkan scope di server. Jangan mengambil semua data lalu memfilter di browser.

Jika RLS PostgreSQL digunakan, context organisasi/user dipasang dalam transaction lokal. RLS menjadi defense in depth, bukan pengganti authorization application layer.

## 4. Validasi Input dan Output

- Validasi seluruh payload dengan schema dan allowlist field.
- Gunakan query terparameterisasi melalui ORM/driver.
- Escape output HTML; sanitasi rich text bila ditambahkan.
- Batasi panjang string, jumlah item, filter, page size, dan kedalaman JSON.
- Gunakan decimal aman untuk uang dan integer 0-100 untuk progres.
- Error publik memakai kode stabil tanpa stack, SQL, path storage, token, atau data user lain.

## 5. Evidence dan Upload

- Allowlist ekstensi, MIME, dan content-based magic bytes.
- Batas default 10 MB per file dan 10 file per submission.
- Tolak executable, macro-enabled document yang tidak dibutuhkan, archive berisiko, dan polyglot.
- Simpan file di luar public web root dengan nama storage acak.
- Jangan membentuk path dari nama file user.
- Hitung checksum; simpan metadata di PostgreSQL.
- Gunakan quarantine dan malware scan bila tersedia.
- Sajikan download melalui authorization server-side atau signed URL singkat.
- Gunakan `Content-Disposition: attachment` untuk tipe berisiko.
- Catat download evidence sensitif bila policy membutuhkan.

Storage lokal memerlukan volume persisten dan satu node. Sebelum horizontal scaling, pindahkan ke shared/object storage privat.

## 6. Approval dan Concurrency

- Approval mengikuti state machine eksplisit.
- Satu request pending per entity dan tipe approval.
- Submission menyimpan base version/snapshot.
- Keputusan memeriksa role, status, dan version dalam transaction.
- Update entity, request, action, audit, dan outbox commit bersama.
- Reject dan request revision wajib memiliki alasan.
- Konflik mengembalikan `409 VERSION_CONFLICT`; jangan memakai last-write-wins.

## 7. Import, Export, dan PDF

### Import

- Hanya Admin.
- Validasi header, tipe, enum, referensi, tanggal, duplikasi, formula, dan progres.
- Gunakan staging table dan transaction per batch.
- Bila ada error blocking, jangan menerapkan baris apa pun.
- Jangan mengeksekusi macro, formula, atau konten aktif workbook.
- Simpan import ID, actor, checksum sumber, hasil, dan audit event.

### Export dan PDF

- Terapkan scope user pada query server-side.
- Batasi ukuran, waktu, dan memori export sinkron; proses data besar lewat worker.
- Simpan artefak privat dengan expiry, checksum, dan download terotorisasi.
- Audit pembuatan dan download sensitif.
- Cegah spreadsheet formula injection pada nilai berawalan `=`, `+`, `-`, atau `@`.
- PDF tidak boleh memuat URL internal, secret, atau metadata filesystem.

## 8. Email, WhatsApp, dan Webhook

- Gunakan transactional outbox; provider failure tidak membatalkan transaksi bisnis.
- Gunakan idempotency key, maksimum retry, exponential backoff, dan dead-letter state.
- Pesan memuat data minimum dan tautan aplikasi yang tetap memerlukan login.
- WhatsApp hanya ke nomor valid dengan consent.
- Webhook memvalidasi signature, timestamp, replay window, dan idempotency.
- Simpan provider message ID/status delivery, bukan token provider.
- Redact payload provider yang mengandung PII.

## 9. Audit dan Logging

Audit append-only mencatat actor, role saat aksi, action, target, result, waktu UTC, correlation ID, metadata request aman, dan before/after field terpilih.

Jangan catat password/hash, OAuth token, cookie, authorization header, provider secret, DSN, isi evidence, atau PII yang tidak diperlukan. Cabut hak `UPDATE`, `DELETE`, dan `TRUNCATE` audit dari role aplikasi. Akses operator terhadap audit harus terbatas dan diaudit.

Structured log memakai redaction otomatis. Teruskan request/correlation ID ke database transaction, outbox, worker, dan provider call.

## 10. Rate Limit, Header, dan Transport

Terapkan rate limit pada login/OAuth, upload, download sensitif, import, export, PDF, pencarian mahal, dan webhook. Monitor login failure, denied authorization, rate-limit hit, upload rejection, job spike, serta enumerasi resource.

Production wajib TLS. Reverse proxy hanya mempercayai proxy header dari hop yang dikontrol. Header minimum: CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, frame protection, dan permission policy sesuai kebutuhan.

PostgreSQL tidak diekspos publik. Port host `5433` hanya untuk development lokal dan dibatasi ke host.

## 11. Secret dan Konfigurasi

```text
DATABASE_URL
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
EMAIL_PROVIDER_*
WHATSAPP_PROVIDER_*
OTEL_EXPORTER_*
```

- Jangan commit `.env` berisi secret.
- Jangan menyalin secret ke client bundle, image layer, log, export, atau dokumentasi.
- Gunakan secret berbeda per environment.
- Rotasi secret setelah kebocoran, pergantian provider, atau sesuai policy.
- Validasi konfigurasi saat startup dan gagal cepat pada kondisi lemah.

## 12. Docker dan Supply Chain

- Build image multi-stage, immutable, minimal, dan reproducible dari lockfile.
- Jalankan app dan worker sebagai non-root.
- Gunakan health check, resource limit, restart policy, dan read-only filesystem bila kompatibel.
- Pisahkan volume database, evidence, dan artefak sementara.
- Pindai secret, dependency, SAST, SBOM, dan image pada pipeline.
- Patch base image dan dependency berkala.
- Jalankan migration sekali sebagai release step.
- Gunakan expand-migrate-contract agar rollback image tetap mungkin.

## 13. Backup, Recovery, dan Retensi

- Backup PostgreSQL harian terenkripsi.
- Gunakan WAL/PITR bila tersedia.
- Backup evidence pada failure domain berbeda.
- Retensi awal: 7 harian, 4 mingguan, dan 12 bulanan.
- Jalankan restore drill terisolasi minimal triwulanan.
- Verifikasi record, referensi evidence, checksum sampel, dan login.
- Target awal: RPO 24 jam tanpa PITR atau maksimal 15 menit dengan PITR; RTO 4 jam.

Backup tanpa restore test belum terbukti. Simpan kunci enkripsi terpisah dari backup.

## 14. Monitoring dan Respons Insiden

Alert minimum: error/latency tinggi, database/storage hampir penuh atau unavailable, backup gagal, outbox tertahan, provider failure spike, login attack pattern, authorization denial, perubahan auth/role, audit write gagal, dan checksum mismatch.

Saat insiden:

1. Simpan request ID, waktu UTC/Jakarta, user terdampak, dan scope data.
2. Batasi akses atau nonaktifkan fitur tanpa menghapus bukti.
3. Rotasi secret/session bila mungkin terkompromi.
4. Pertahankan log, audit, dan artefak forensik.
5. Pulihkan dari image/backup terverifikasi bila diperlukan.
6. Dokumentasikan akar masalah, dampak, tindakan, dan pencegahan.

Jangan menghapus audit atau log relevan untuk membersihkan insiden.

## 15. Checklist Production

- [ ] Dev auth dan demo login tidak tersedia.
- [ ] Google OAuth memakai HTTPS dan allowlist benar.
- [ ] Cookie, CSRF, CSP, HSTS, dan rate limit aktif.
- [ ] Endpoint memiliki test role, ownership, dan tenant isolation.
- [ ] PostgreSQL dan storage tidak publik.
- [ ] Upload diuji terhadap bypass dan malware policy.
- [ ] Export/PDF diuji terhadap kebocoran scope dan formula injection.
- [ ] Secret/dependency/image scan lulus.
- [ ] Audit redaction dan immutability terverifikasi.
- [ ] Backup database/evidence dan restore drill lulus.
- [ ] Migration, rollback, health check, metrics, dan alert terverifikasi.

