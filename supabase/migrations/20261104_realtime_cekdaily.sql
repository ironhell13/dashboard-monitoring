-- ==============================================================================
-- MIGRASI SUPABASE: OPTIMASI REALTIME & PARITAS DATA CEK DAILY
-- Tanggal: 4 November 2026
-- File: supabase/migrations/20261104_realtime_cekdaily.sql
-- ==============================================================================

-- 1. Index Komposit untuk Query Utama Cek Daily (Performa Cepat)
create index if not exists idx_active_incidents_status_start
  on public.active_incidents (status, start_time desc, incident_key);

create index if not exists idx_incident_logs_periode_start_id
  on public.incident_logs (periode_bulan, start_time desc, id desc);

-- 2. View Open Incidents + Metadata Mesin (Hilangkan Lookup O(N) di Klien)
create or replace view public.v_open_incidents
with (security_invoker = true) as
select
  ai.*,
  m.lokasi,
  case 
    when m.sektor_bca like '%-%' then split_part(m.sektor_bca, '-', 1)
    else coalesce(m.wilayah_operasional, 'ACJK')
  end as service_point,
  m.sektor_bca,
  m.tipe_mesin,
  m.vendor
from public.active_incidents ai
left join public.machines m on upper(trim(m.wsid)) = upper(trim(ai.wsid))
where ai.status = 'OPEN';

-- Berikan izin akses view ke anon / authenticated
grant select on public.v_open_incidents to anon, authenticated, service_role;

-- 3. RPC Transaksional Atomik: Simpan Tindakan Insiden (Update + Insert Log)
create or replace function public.save_incident_action(
  p_incident_key text,
  p_wsid text,
  p_problem text,
  p_action text,
  p_by text,
  p_periode text
) returns public.active_incidents
language plpgsql security definer as $$
declare
  v_row public.active_incidents;
begin
  -- Update row aktif di tabel active_incidents
  update public.active_incidents
     set action_taken = p_action,
         action_by = p_by,
         action_at = now(),
         updated_at = now()
   where incident_key = p_incident_key
   returning * into v_row;

  if not found then
    raise exception 'Incident % tidak ditemukan atau sudah selesai (CLOSED)', p_incident_key;
  end if;

  -- Catat riwayat ke tabel incident_logs
  insert into public.incident_logs
    (incident_key, wsid, problem, action_taken, action_by, action_at, status, periode_bulan)
  values
    (p_incident_key, p_wsid, p_problem, p_action, p_by, now(), 'OPEN', coalesce(p_periode, to_char(now(), 'YYYY-MM')));

  return v_row;
end;
$$;

-- Berikan izin eksekusi function ke anon / authenticated
grant execute on function public.save_incident_action(text, text, text, text, text, text) to anon, authenticated, service_role;

-- 4. Pastikan Tabel Terdaftar di Publikasi Supabase Realtime & REPLICA IDENTITY FULL
alter table public.active_incidents replica identity full;
alter table public.incident_logs replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.active_incidents;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.incident_logs;
  exception when duplicate_object then null;
  end;
end $$;

