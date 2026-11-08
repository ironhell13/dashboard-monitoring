-- ==============================================================================
-- MIGRASI SUPABASE: OPTIMASI PERFORMA MENU FREKUENSI & RPC AGREGASI MATRIKS
-- Tanggal: 8 November 2026
-- File: supabase/migrations/20261108_freq_perf.sql
-- ==============================================================================

-- 1. INDEX PERFORMA UNTUK INCIDENT_LOGS
create index if not exists idx_incident_logs_start_time on public.incident_logs (start_time desc);
create index if not exists idx_incident_logs_wsid_start on public.incident_logs (wsid, start_time desc);
create index if not exists idx_incident_logs_periode on public.incident_logs (periode_bulan, start_time);
create index if not exists idx_incident_logs_key_id on public.incident_logs (incident_key, id desc);

-- 2. FUNGSI RPC: AGREGASI MATRIKS FREKUENSI BULANAN DI DATABASE (SERVER-SIDE)
-- Menghasilkan satu nilai JSONB array berformat: [wsid, problem, 'YYYY-MM-DD', freq, dur]
-- Menghindari batasan max-rows (1000) pada PostgREST & melakukan deduplikasi akurat per incident_key
create or replace function public.get_frequency_matrix(p_month text)  -- format 'YYYY-MM'
returns jsonb
language sql
stable
set statement_timeout = '30s'
as $$
  with bounds as (
    select
      make_timestamptz(split_part(p_month,'-',1)::int, split_part(p_month,'-',2)::int, 1, 0, 0, 0, 'Asia/Jakarta') as s
  ),
  dedup as (
    -- 1 insiden = 1 baris: ambil versi terbaru (id terbesar) per incident_key
    select distinct on (l.incident_key)
           l.incident_key, l.wsid, l.problem, l.start_time, l.duration_minutes
    from public.incident_logs l, bounds b
    where l.start_time is not null
      and l.start_time >= b.s
      and l.start_time <  b.s + interval '1 month'
    order by l.incident_key, l.id desc
  ),
  agg as (
    select upper(trim(wsid)) as wsid,
           problem,
           (start_time at time zone 'Asia/Jakarta')::date as tgl,
           count(*)::int as freq,
           coalesce(sum(duration_minutes),0)::int as dur
    from dedup
    where wsid is not null and trim(wsid) <> ''
    group by 1,2,3
  )
  select coalesce(jsonb_agg(jsonb_build_array(wsid, problem, to_char(tgl,'YYYY-MM-DD'), freq, dur)), '[]'::jsonb)
  from agg;
$$;

-- Izin eksekusi RPC matriks frekuensi
grant execute on function public.get_frequency_matrix(text) to anon, authenticated, service_role;

-- 3. FUNGSI RPC: DAFTAR PERIODE BULAN UNIK SECARA INSTAN (DROPDOWN BULAN)
create or replace function public.get_distinct_incident_months()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(periode_bulan order by periode_bulan desc), '[]'::jsonb)
  from (
    select distinct periode_bulan
    from public.incident_logs
    where periode_bulan is not null and trim(periode_bulan) <> ''
  ) s;
$$;

-- Izin eksekusi RPC periode bulan unik
grant execute on function public.get_distinct_incident_months() to anon, authenticated, service_role;
