-- ==============================================================================
-- DIAGNOSTIK SUPABASE: TABEL INCIDENT_LOGS (CEK DAILY & FREKUENSI)
-- Jalankan query di bawah ini di Supabase SQL Editor dan laporkan hasilnya.
-- ==============================================================================

-- 1. Total baris & insiden unik per bulan (WIB / Asia/Jakarta)
select to_char(start_time at time zone 'Asia/Jakarta','YYYY-MM') as bulan,
       count(*) as total_baris,
       count(distinct incident_key) as insiden_unik,
       min(start_time at time zone 'Asia/Jakarta') as paling_awal,
       max(start_time at time zone 'Asia/Jakarta') as paling_akhir
from public.incident_logs
where start_time is not null
group by 1 order by 1 desc;

-- 2. Baris tanpa start_time (kemungkinan log tindakan penanganan)
select count(*) as baris_tanpa_start_time from public.incident_logs where start_time is null;

-- 3. Daftar index yang sudah ada di tabel incident_logs
select indexname, indexdef from pg_indexes where tablename = 'incident_logs';

-- 4. Sample Cross-Check 3 WSID (ZQ27, ZBK1, ZD6A) untuk Oktober 2026
select upper(trim(wsid)) as wsid,
       count(*) as total_baris,
       count(distinct incident_key) as insiden_unik,
       min(start_time at time zone 'Asia/Jakarta')::date as min_tgl,
       max(start_time at time zone 'Asia/Jakarta')::date as max_tgl
from public.incident_logs
where upper(trim(wsid)) in ('ZQ27', 'ZBK1', 'ZD6A')
  and start_time >= '2026-10-01 00:00:00+07'
  and start_time < '2026-11-01 00:00:00+07'
group by 1;
