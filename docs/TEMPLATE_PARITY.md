# Audit Kesetaraan Template

Tanggal: 6 November 2026. Referensi: `dashboard-monitoring-admin.html` dan `dashboard-monitoring-design.html`.

## Temuan pada versi sebelumnya

- Jumlah data seed benar, tetapi kesetaraan perilaku belum tercapai.
- Periode default Januari menyembunyikan timeline, hari pertama, dan gate yang terikat ke November.
- Pemilih bulan, ringkasan 90 hari, evaluasi KPI, catatan manajer/mentor dan checklist gate hilang.
- Beban desainer, kapasitas lima proyek, filter program/PIC dan peringatan kualitas data hilang.
- Rumus overdue dan belum ada PIC menghitung juga pekerjaan 100%, berbeda dari sumber.
- Seed menimpa progres/status proyek dan catatan mingguan setiap deploy.
- Export memakai scope ADMIN sintetis dan PDF hanya mengambil 40 proyek.

## Acuan data desain

Baseline template tanpa perubahan pengguna pada 6 November 2026, zona bisnis Asia/Jakarta:

| Indikator | Nilai |
|---|---:|
| Proyek | 65 |
| Backlog | 56 |
| In Progress | 0 |
| Review | 3 |
| Published | 6 |
| Terlambat | 13 |
| Aktif belum ditugaskan | 48 |
| Cek status/progres | 8 |

Delapan inkonsistensi sumber dipertahankan sebagai peringatan, bukan diperbaiki otomatis. Angka terlambat berubah mengikuti tanggal bisnis.

## Perbedaan yang disengaja

- Database menggantikan localStorage untuk kerja multi-user.
- Desainer direpresentasikan sebagai akun STAFF; pembuatan akun melalui menu Pengguna, bukan nama lokal tanpa identitas. Tidak ada penghapusan identitas audit ketika akun dinonaktifkan.
- STAFF tetap terbatas pada assignment. Data global tidak otomatis menjadi milik Staff demo.
- Perubahan status dan progres proyek disimpan bersama agar validasi pasangan nilai atomik.
- Perubahan mingguan Staff memakai satu pengajuan review; Admin menyimpan langsung sesuai izin.
- CANCELLED tidak dihitung sebagai pekerjaan aktif/terlambat; status tambahan ini tidak ada di template.
- Nilai dan catatan yang hanya tersimpan di localStorage browser lama tidak tersedia di file HTML dan belum diimpor.

## Verifikasi

- `tests/domain/template-parity.test.ts` menguji baseline proyek, anomali sumber dan batas hari Asia/Jakarta.
- Uji browser harus memeriksa isi Program 3 Bulan sebanyak 13 rencana mingguan, 14 Hari Pertama sebanyak 14 baris, lima gate, tiga bulan KPI dan filter proyek; keberadaan nama tab saja tidak cukup.
- Rebuild tidak boleh mengembalikan progres/status proyek dan catatan minggu ke nilai template.
- Kredensial Google dan provider email/WhatsApp tetap konfigurasi terpisah, bukan fitur template.
## Hasil validasi 6 November 2026

- Database terverifikasi: 65 proyek, 3 periode, 9 definisi dan 27 target KPI, 13 rencana mingguan, 14 hari, 5 gate.
- `npm run typecheck`, `npm run lint`, `npm test` (28 tes), dan `npm run test:e2e` (10 tes desktop/mobile) lulus.
- Docker `app` dan `db` sehat pada port host 3010 dan 5433. Menu mobile diperiksa agar ikon terlihat.


