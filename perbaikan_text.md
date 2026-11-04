0. PERAN & ATURAN MAIN
Kamu adalah senior full-stack engineer. Revisi proyek ini agar menu Cek Daily (CekDailyPage.tsx → MonitoringPage.tsx, dipakai juga oleh mode Monitoring) menampilkan data yang sama persis di semua browser/perangkat (Chrome biasa, Incognito, HP, PC lain), real-time, dan tidak lemot.
Aturan:
Supabase adalah satu-satunya sumber kebenaran (single source of truth). Cache lokal hanya untuk tampilan awal yang cepat, dan harus selalu ditimpa oleh hasil server.
Jangan mengubah tampilan/UI, alur role (Ka Wil / Ka Ops / Monitoring), fitur upload, bulk action, chronic detection, maupun menu lain. Fokus hanya pada lapisan data, sinkronisasi, dan performa.
Kerjakan bertahap sesuai fase di bawah; setelah tiap fase pastikan npm run build lolos tanpa error TypeScript.
Sebelum mengubah, buka dan baca file yang disebut (nomor baris hanya perkiraan; patokan utamanya nama fungsi). Jika temuan di bawah ternyata berbeda dengan kode aktual, laporkan dan sesuaikan.
Semua teks UI/pesan tetap Bahasa Indonesia.
1. HASIL AUDIT — AKAR MASALAH (sudah dianalisis dari kode)
A. Kenapa Chrome biasa ≠ Incognito
Incognito = storage kosong. Chrome biasa = storage berisi data lama. Kode saat ini memperlakukan data lama itu sebagai data "live":
#
Lokasi
Masalah
A1
MonitoringPage.tsx — useState awal allDailyIncidents & openIncidents
Diisi dari localStorage (MONITORING_ACTIVE_DATASET, MONITORING_OPEN_CACHE).
A2
MonitoringPage.tsx — loadCache() (useEffect awal)
Memuat snapshot IndexedDB, dan hanya menarik data dari DB jika !hasDailyData. Artinya di Chrome biasa dataset harian tidak pernah di-refresh; di Incognito selalu fresh.
A3
dbCache.ts — saveMonitoringSnapshot()
Menolak menimpa dengan array kosong (memakai data lama jika yang baru kosong). Cache tidak pernah bisa "mengosongkan" problem yang sudah selesai.
A4
MonitoringPage.tsx — effect "Simpan cache lokal open incidents"
Hanya menyimpan jika openIncidents.length > 0. Hasil kosong yang valid tidak pernah tersimpan.
A5
MonitoringPage.tsx — fetchOpenIncidents()
baseItems = cleanIncidents.length > 0 ? cleanIncidents : prev → jika server bilang 0 open, yang ditampilkan malah prev (data lama). Lalu ada fallback extractOpenFromRows(currentDaily) yang membangkitkan lagi problem yang sudah closed dari dataset cache lama.
A6
monitoringService.ts — getOpenIncidentsApi() & getDailyIncidentsFromDbApi()
Hasil Supabase hanya dipakai jika length > 0. Jika 0 (valid) atau error → jatuh ke localStorage → lalu ke file statis /daily-incidents-seed.json (1,4 MB di public/) dan menganggapnya data live. Respons kosong, error, dan data valid tidak dibedakan.
A7
supabaseClient.ts — getSupabaseUrl()/getSupabaseAnonKey()
Kredensial dari localStorage (EMONS_CUSTOM_SUPABASE_URL/KEY) menimpa env Vercel. Chrome biasa bisa menunjuk project Supabase yang berbeda dari Incognito.
A8
supabaseService.ts — getMachineMetadata()
Lokasi/Service Point/Sektor diambil dari useDataStore.getState().machines. Di browser baru store kosong/terisi belakangan → kolom '-' vs terisi. Juga memakai .find() linear per baris (lambat untuk puluhan ribu baris).
A9
MonitoringPage.tsx — handleOpenDetailDrawer() & handler simpan action
Riwayat/aksi bersifat local-first (loadLocalActions dari IndexedDB di-merge dengan server). Setelah simpan, UI langsung menampilkan sukses dan .catch hanya console.warn("tetap tersimpan aman di browser") → jika server gagal, aksi hanya ada di browser itu dan tidak pernah terlihat tim lain. Audit juga saveIncidentActionApi (monitoringService.ts): kegagalan server tidak boleh dianggap sukses.
A10
supabaseService.ts — saveIncidentActionSupabase()
update().eq() tanpa .select() → jika 0 baris ter-update (key tidak cocok / RLS), tetap dianggap sukses. Insert ke incident_logs dibungkus try/catch kosong, padahal supabase-js tidak melempar error, melainkan mengembalikan { error } → kegagalan tak pernah terdeteksi. Selain itu tiap aksi menambah baris incident_logs berstatus 'OPEN' tanpa end_time → berpotensi terbaca sebagai problem open ganda oleh extractOpenFromRows. Verifikasi dampaknya.
B. Kenapa "real-time" tidak benar-benar real-time
#
Lokasi
Masalah
B1
subscribeActiveIncidentsSupabase()
.subscribe() tanpa callback status; tidak menangani CHANNEL_ERROR / TIMED_OUT / CLOSED; tidak ada resync setelah reconnect, tab kembali aktif, atau koneksi pulih → event yang terlewat = data basi selamanya.
B2
Handler realtime di MonitoringPage.tsx
Setiap event memanggil fetchOpenIncidents(true) (unduh ulang semua open incident, select('*'), tanpa debounce). Upload 1.000 baris = badai ratusan refetch. Payload event diabaikan.
B3
setInterval 1 detik (countdown 15 dtk)
Tetap jalan saat tab disembunyikan, dan setCountdownSeconds tiap detik me-render ulang MonitoringPage (±580 KB / 5.000+ baris) → lemot. Polling + realtime berjalan bersamaan tanpa koordinasi.
B4
Tab "Daily/History"
Tidak ada realtime sama sekali (incident_logs bukan bagian publication dan tidak di-subscribe); dataset hanya dimuat sekali.
C. Kenapa lemot
#
Lokasi
Masalah
C1
fetchDailyIncidentsFromDbSupabase()
Mode 'ALL' mengunduh seluruh incident_logs (select('*'), bisa puluhan ribu baris, 6 request paralel), lalu dipetakan satu-satu dengan getMachineMetadata O(n).
C2
Pagination .order('start_time').range()
start_time tidak unik → baris bisa terduplikasi/terlewat antar halaman (apalagi saat data berubah). Perlu tie-breaker unik.
C3
public/sample-data.json (10 MB), master-machines-seed.json (10 MB), daily-incidents-seed.json (1,4 MB)
Ikut terdeploy ke produksi dan dipakai sebagai fallback (spreadsheetService.ts, supabaseService.ts, monitoringService.ts). Folder dist/ juga ikut di zip/repo.
C4
Tidak ada index komposit untuk query utama
active_incidents(status, start_time) dan incident_logs(periode_bulan, start_time, id).
D. Catatan keamanan (di luar scope tugas ini, cukup dilaporkan)
supabase/schema.sql memakai policy FOR ALL USING (true) WITH CHECK (true) pada semua tabel termasuk app_users dengan anon key. Siapa pun yang memegang anon key dapat membaca/mengubah/menghapus data. Jangan diubah sekarang (bisa merusak login/fitur), tapi tulis rekomendasi hardening di laporan akhir.
2. TARGET PERILAKU (SPESIFIKASI)
Buka Cek Daily di Chrome biasa, Incognito, HP, dan PC lain → data identik (jumlah open problem, isi kolom, riwayat aksi).
Ubah data (update aksi / upload / close) di perangkat A → muncul di perangkat B ≤ 2 detik (realtime), tanpa refresh manual.
Hasil server kosong = tampilkan kosong ("Tidak ada problem open"), bukan data lama/seed.
Server error/offline = tetap tampilkan data terakhir yang valid dengan banner jelas ("Offline — data terakhir sinkron HH:MM:SS"), jangan pernah tampil seolah live.
Tampilan awal ≤ 1,5 dtk (dari cache, stale-while-revalidate), data segar dari server ≤ 3 dtk. Interaksi (filter, buka drawer) tidak terasa lag.
Indikator status koneksi kecil di header: 🟢 Live · 🟡 Menyambung ulang · 🔴 Offline, plus "Terakhir sinkron: HH:MM:SS".
3. FASE 0 — DIAGNOSTIK (kerjakan dulu, kecil & aman)
Tambahkan panel debug tersembunyi, aktif via ?debug=1 (tanpa mengubah UI normal), menampilkan:
Project ref Supabase yang aktif + sumber kredensial (env atau localStorage)
Sumber data tiap dataset: supabase | cache | seed
Jumlah baris open & daily, lastSyncedAt, status channel realtime, versi build, versi cache
Tombol "Bersihkan cache lokal & muat ulang"
Tujuannya agar mudah memastikan perbedaan antar browser berasal dari mana.
4. FASE 1 — KEBENARAN DATA (menghilangkan perbedaan Chrome vs Incognito)
4.1 Pisahkan tiga kondisi hasil fetch
Ubah return getOpenIncidentsApi, getDailyIncidentsFromDbApi, dan service terkait menjadi diskriminatif, mis.:
type Result<T> =
  | { status: 'ok'; data: T; syncedAt: number }      // termasuk data kosong yang valid
  | { status: 'error'; message: string };            // jangan diperlakukan sebagai data
Hapus logika "jika length > 0 baru pakai hasil Supabase".
Hapus fallback ke localStorage dan /daily-incidents-seed.json dari jalur data live. Seed boleh dipertahankan hanya untuk mode demo eksplisit (mis. import.meta.env.VITE_DEMO_MODE === 'true') — default mati.
4.2 Cache = hanya untuk first paint, selalu ditimpa
Buat satu modul cache terpusat (perluas dbCache.ts) dengan: 
CACHE_SCHEMA_VERSION dan kunci cache menyertakan project ref Supabase (agar ganti project tidak membawa data lama).
Metadata savedAt; tampilkan umur cache di panel debug.
Aturan tulis: setelah fetch sukses (status:'ok'), ganti total state & cache dengan hasil server — termasuk array kosong. Hapus logika di saveMonitoringSnapshot yang menolak menimpa dengan kosong, dan hapus syarat length > 0 di effect penyimpanan open cache.
Aturan baca: cache hanya dipakai untuk render pertama; fetch server wajib selalu dijalankan saat mount (hapus kondisi if (!hasDailyData) di loadCache()).
Jangan lagi menginisialisasi useState dari localStorage secara sinkron; mulai dari [] + isLoading, lalu isi dari cache IndexedDB (async), lalu server.
Migrasi sekali jalan (purge cache lama): saat versi cache berbeda, hapus 
localStorage: MONITORING_ACTIVE_DATASET, MONITORING_OPEN_CACHE, MONITORING_LOCAL_ACTIONS, MONITORING_SNAPSHOT_FALLBACK, DOWNTIME_BCA_SNAPSHOT_FALLBACK, serta key LOCAL_STORAGE_INCIDENTS di monitoringService.ts
IndexedDB DOWNTIME_BCA_CACHE_DB / store app_state: monitoring_full_snapshot, incident_active_dataset, incident_actions_cache
Jangan menghapus cache master data/uptime (cached_master_data, cached_uptime_files, cached_locked_periodes) karena dipakai halaman lain.
4.3 Perbaiki fetchOpenIncidents
Server ok + kosong → setOpenIncidents([]).
Hapus baseItems = ... : prev dan fallback extractOpenFromRows(currentDaily) dari jalur ini. active_incidents (status='OPEN') adalah satu-satunya definisi "open".
Enrichment dari dataset harian (enrichOpenWithDailyData) boleh tetap, tapi tidak boleh menambah item yang tidak ada di server dan boleh menghapus item yang sudah closed.
4.4 Kredensial Supabase
Di supabaseClient.ts, utamakan env Vercel (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). Override localStorage hanya aktif bila import.meta.env.DEV atau flag eksplisit; di produksi abaikan dan tampilkan peringatan bila ada override lama (lalu hapus key EMONS_CUSTOM_SUPABASE_*).
4.5 Metadata mesin tanpa getMachineMetadata
Hapus ketergantungan pada useDataStore.getState().machines untuk data insiden. Gunakan view SQL join di server (lihat Fase 4) sehingga lokasi, service_point, sektor_bca, tipe_mesin, vendor ikut dalam respons.
Jika masih perlu lookup di klien: bangun Map<wsid, meta> sekali (O(1)), bukan .find() per baris.
4.6 Aksi & riwayat: server-first
handleOpenDetailDrawer: ambil riwayat dari server sebagai sumber utama; data lokal hanya untuk aksi berstatus pending (belum terkonfirmasi) dan ditandai "mengirim…".
Simpan aksi dengan optimistic update + rollback: tampil instan, tetapi jika server gagal → batalkan perubahan lokal dan tampilkan error "Gagal menyimpan, coba lagi" (hapus pesan "tetap tersimpan aman di browser").
Perbaiki saveIncidentActionSupabase (dan versi bulk): gunakan .select() untuk memastikan ≥1 baris ter-update; periksa { error } dari setiap insert (hapus try/catch kosong); jika salah satu gagal → kembalikan success:false. Idealnya pakai RPC atomik (lihat Fase 4).
Audit saveIncidentActionApi/bulkSaveIncidentActionApi: kegagalan Supabase tidak boleh fallback ke penyimpanan lokal lalu dianggap sukses.
Audit apakah baris incident_logs hasil tindakan (status 'OPEN', tanpa end_time) mencemari dataset harian atau extractOpenFromRows. Jika ya, pisahkan penanda log-tindakan (mis. kolom kind / tabel incident_actions) tanpa merusak riwayat yang sudah ada; laporkan keputusan.
5. FASE 2 — REAL-TIME YANG BENAR
Buat hook terpusat useOpenIncidents() (file baru, mis. src/hooks/useOpenIncidents.ts) yang menggantikan polling/realtime tersebar di MonitoringPage.tsx. Boleh memakai TanStack Query bila ingin, tetapi cukup hook biasa.
Fetch awal dari view v_open_incidents (hanya kolom yang dipakai, bukan select('*')).
Subscribe realtime pada active_incidents (INSERT/UPDATE/DELETE) dan gunakan payload: 
Kumpulkan incident_key yang berubah dalam jendela 300–500 ms (debounce/batching).
Untuk DELETE atau status !== 'OPEN' → hapus dari state lokal.
Untuk INSERT/UPDATE berstatus OPEN → ambil hanya baris itu dari v_open_incidents (.in('incident_key', keys)) lalu upsert ke state. Jangan unduh ulang seluruh daftar.
Status channel: .subscribe((status) => …): 
SUBSCRIBED → lakukan full resync sekali (menangkap event yang terlewat) → 🟢
CHANNEL_ERROR | TIMED_OUT | CLOSED → 🟡/🔴, aktifkan polling cadangan.
Resync tambahan: saat visibilitychange (tab kembali terlihat), online, dan focus.
Polling cadangan 30–60 dtk, hanya saat tab terlihat dan channel tidak SUBSCRIBED. Hapus setInterval 1-detik yang me-render ulang halaman.
Countdown "refresh 15 dtk" (jika masih ingin ditampilkan): pindahkan ke komponen kecil terpisah (React.memo) / useRef + update DOM langsung, supaya MonitoringPage tidak re-render tiap detik. Atau ganti dengan teks "Terakhir sinkron".
Daily/History: tambahkan incident_logs ke publication realtime dan subscribe dengan debounce 1–2 dtk (invalidate data bulan aktif saja), atau minimal refetch bulan aktif saat tab Daily dibuka + polling ringan.
Cleanup channel saat unmount (hindari subscription ganda di React StrictMode/dev).
6. FASE 3 — PERFORMA
Dataset harian jangan 'ALL' secara default. Muat bulan berjalan + bulan sebelumnya saja (filter periode_bulan / rentang start_time), bulan lain dimuat saat dipilih. Frekuensi/chronic (3x sehari, 3x dalam 5 hari) hanya butuh beberapa hari terakhir → query dengan rentang tanggal; bila perlu buat RPC agregat (wsid, problem, jumlah per hari) agar tidak mengunduh ribuan baris mentah.
Pagination stabil: tambahkan tie-breaker unik: .order('start_time', {ascending:false}).order('id', {ascending:false}) (incident_logs) dan .order('incident_key') (active_incidents). Hindari mengambil halaman saat data berubah tanpa tie-breaker.
Pilih kolom yang dibutuhkan, bukan select('*').
Pemetaan data (mapRowToOpenIncident, enrichOpenWithDailyData, extractOpenFromRows) gunakan Map/Set, tidak ada .find()/.filter() bersarang per baris. Pertimbangkan useMemo/useDeferredValue untuk filter & pencarian.
Singkirkan aset berat dari produksi: pindahkan public/sample-data.json, master-machines-seed.json, daily-incidents-seed.json keluar dari public/ (atau muat dinamis hanya untuk demo/dev). Pastikan dist/ ada di .gitignore.
Pecah MonitoringPage.tsx secara aman bila memungkinkan (minimal pisahkan tab Open / History / Frekuensi ke komponen React.memo terpisah dan lazy()), tanpa mengubah perilaku/UI.
Pasang Content-Cache yang benar di vercel.json untuk aset ber-hash (immutable) dan index.html tanpa cache, agar deploy baru langsung terpakai.
7. FASE 4 — SQL SUPABASE (buat file supabase/migrations/2026xx_realtime_cekdaily.sql, jalankan di SQL Editor)
-- 1) Index untuk query utama
create index if not exists idx_active_incidents_status_start
  on public.active_incidents (status, start_time desc, incident_key);
create index if not exists idx_incident_logs_periode_start_id
  on public.incident_logs (periode_bulan, start_time desc, id desc);
-- 2) View open incidents + metadata mesin (hilangkan lookup di klien)
--    Catatan: tabel machines tidak punya kolom service_point; gunakan wilayah_operasional.
create or replace view public.v_open_incidents
with (security_invoker = true) as
select
  ai.*,
  m.lokasi,
  m.wilayah_operasional as service_point,
  m.sektor_bca,
  m.tipe_mesin,
  m.vendor
from public.active_incidents ai
left join public.machines m on m.wsid = upper(trim(ai.wsid))
where ai.status = 'OPEN';
-- 3) RPC atomik simpan aksi (update + log dalam 1 transaksi, gagal = error jelas)
create or replace function public.save_incident_action(
  p_incident_key text, p_wsid text, p_problem text,
  p_action text, p_by text, p_periode text
) returns public.active_incidents
language plpgsql as $$
declare v_row public.active_incidents;
begin
  update public.active_incidents
     set action_taken = p_action, action_by = p_by,
         action_at = now(), updated_at = now()
   where incident_key = p_incident_key
   returning * into v_row;
  if not found then
    raise exception 'Incident % tidak ditemukan atau sudah closed', p_incident_key;
  end if;
  insert into public.incident_logs
    (incident_key, wsid, problem, action_taken, action_by, action_at, status, periode_bulan)
  values
    (p_incident_key, p_wsid, p_problem, p_action, p_by, now(), 'OPEN', p_periode);
  -- NOTE: sesuaikan 'status' bila hasil audit (Fase 1.6) memutuskan memisahkan log tindakan.
  return v_row;
end $$;
-- 4) Pastikan tabel masuk publication realtime (abaikan error jika sudah ada)
alter publication supabase_realtime add table public.incident_logs;
-- active_incidents sudah ada di publication (lihat schema.sql baris ~272).
Sesuaikan dengan kolom aktual di database (mis. event_code, periode_bulan pada active_incidents jika ada dari migrasi sebelumnya); cek dulu dengan select column_name from information_schema.columns where table_name = 'active_incidents'.
8. BATASAN (JANGAN DILAKUKAN)
Jangan mengubah desain/tata letak/teks menu, flow login & role, rumus SLA/uptime, parser CSV, fitur upload & bulk action.
Jangan menghapus data di database Supabase. Semua perubahan SQL harus idempotent (if not exists / or replace).
Jangan menambah library besar tanpa alasan kuat (TanStack Query boleh).
Jangan menyimpan secret/service-role key di frontend.
Jangan mematikan RLS atau mengubah policy sekarang (hanya laporkan, lihat 1.D).
9. KRITERIA LULUS (UJI MANUAL WAJIB, LAPORKAN HASILNYA)
Paritas browser: Chrome biasa (cache lama sengaja dibiarkan), Incognito, dan HP menampilkan jumlah open problem & isi kolom yang identik setelah halaman selesai memuat.
Realtime: update aksi di perangkat A muncul di B ≤ 2 dtk tanpa refresh. Close problem via upload → hilang dari daftar open di semua perangkat ≤ 2 dtk.
Kosong valid: kosongkan active_incidents OPEN (di environment uji) → UI kosong, bukan data lama. Tidak ada kebangkitan problem closed.
Offline: matikan jaringan → banner offline + data terakhir; nyalakan lagi → otomatis resync dan banner hilang.
Upload massal 1.000 baris → maksimal beberapa request refetch (bukan ratusan); UI tetap responsif.
Gagal simpan: simulasikan error server saat simpan aksi → UI rollback + pesan error; tidak ada aksi "hantu" yang hanya ada di satu browser.
Performa: first paint data ≤ 1,5 dtk (cache), data server ≤ 3 dtk; tidak ada re-render halaman tiap detik (cek React Profiler); network tidak mengunduh file *-seed.json/sample-data.json di jalur normal.
npm run build bersih; tidak ada any baru yang tidak perlu pada kode yang diubah.
10. FORMAT HASIL YANG DIMINTA
Ringkasan perubahan per file (apa & kenapa), dikelompokkan per fase.
File SQL migrasi + urutan menjalankannya + cara rollback.
Daftar env Vercel yang wajib (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) dan langkah redeploy.
Langkah bagi pengguna untuk membersihkan cache lama sekali (atau konfirmasi bahwa migrasi versi cache otomatis berjalan).
Hasil uji bagian 9 (lulus/tidak + catatan).
Daftar temuan yang tidak diperbaiki (mis. RLS terbuka) beserta rekomendasi.