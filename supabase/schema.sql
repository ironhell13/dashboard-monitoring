-- ==============================================================================
-- SCHEMA DATABASE SUPABASE (POSTGRESQL) - DASHBOARD MONITORING & DOWNTIME BCA
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABEL: APP_USERS (Manajemen Pengguna, Super Admin & Hak Akses)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'MONITORING', 
    -- Role: 'SUPER_ADMIN', 'KAWIL', 'KAOPS', 'MONITORING', 'VIEWER'
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    -- Status: 'ACTIVE', 'INACTIVE'
    assigned_sektor VARCHAR(100), -- Opsional: Batas sektor operasional
    phone_number VARCHAR(30),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_status ON public.app_users(status);

-- ==============================================================================
-- 3. TABEL: MACHINES (Data Master Seluruh Mesin ATM / CRM)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.machines (
    wsid VARCHAR(10) PRIMARY KEY,
    jenis_mesin VARCHAR(20) DEFAULT 'ATM',
    klien_status VARCHAR(50) DEFAULT 'BCA',
    sektor_bca VARCHAR(100),
    wilayah_operasional VARCHAR(100),
    lokasi TEXT,
    vendor VARCHAR(50),
    tipe_mesin VARCHAR(100),
    status_aktif VARCHAR(20) DEFAULT 'AKTIF',
    jam_operasional VARCHAR(50) DEFAULT '(00:00 - 24:00)',
    opr INT DEFAULT 43200,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machines_sektor ON public.machines(sektor_bca);
CREATE INDEX IF NOT EXISTS idx_machines_wilayah ON public.machines(wilayah_operasional);
CREATE INDEX IF NOT EXISTS idx_machines_status ON public.machines(status_aktif);

-- ==============================================================================
-- 4. TABEL: MONTHLY_UPTIME (Rekap Uptime & Downtime Bulanan Mesin)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.monthly_uptime (
    id BIGSERIAL PRIMARY KEY,
    wsid VARCHAR(10) NOT NULL REFERENCES public.machines(wsid) ON DELETE CASCADE,
    periode VARCHAR(7) NOT NULL, -- Format 'YYYY-MM', misal '2026-02'
    uh NUMERIC(6, 2) DEFAULT 0,
    uh_frx INT DEFAULT 0,
    uh_dur INT DEFAULT 0,
    um NUMERIC(6, 2) DEFAULT 0,
    um_frx INT DEFAULT 0,
    um_dur INT DEFAULT 0,
    pm NUMERIC(6, 2) DEFAULT 0,
    pm_frx INT DEFAULT 0,
    pm_dur INT DEFAULT 0,
    total_downtime_dur INT DEFAULT 0,
    target_sla NUMERIC(6, 2) DEFAULT 98.50,
    target_vol INT DEFAULT 0,
    is_locked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_wsid_periode UNIQUE(wsid, periode)
);

CREATE INDEX IF NOT EXISTS idx_monthly_uptime_periode ON public.monthly_uptime(periode);
CREATE INDEX IF NOT EXISTS idx_monthly_uptime_wsid ON public.monthly_uptime(wsid);

-- ==============================================================================
-- 5. TABEL: ACTIVE_INCIDENTS (Daftar Insiden Aktif / Open yang Dipantau Monitoring)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.active_incidents (
    incident_key VARCHAR(100) PRIMARY KEY,
    wsid VARCHAR(10) NOT NULL,
    ticket_no VARCHAR(100),
    problem TEXT,
    keterangan TEXT,
    status VARCHAR(30) DEFAULT 'OPEN',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_minutes INT DEFAULT 0,
    action_plan TEXT,
    action_taken TEXT,
    action_by VARCHAR(100),
    action_at TIMESTAMPTZ,
    is_bulk_action BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_incidents_wsid ON public.active_incidents(wsid);
CREATE INDEX IF NOT EXISTS idx_active_incidents_status ON public.active_incidents(status);
CREATE INDEX IF NOT EXISTS idx_active_incidents_start ON public.active_incidents(start_time);
ALTER TABLE public.active_incidents DROP CONSTRAINT IF EXISTS active_incidents_wsid_fkey;

-- ==============================================================================
-- 6. TABEL: INCIDENT_LOGS (Riwayat Seluruh Insiden dari Upload Daily)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.incident_logs (
    id BIGSERIAL PRIMARY KEY,
    incident_key VARCHAR(100),
    wsid VARCHAR(10) NOT NULL,
    ticket_no VARCHAR(100),
    problem TEXT,
    keterangan TEXT,
    status VARCHAR(30),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_minutes INT DEFAULT 0,
    action_taken TEXT,
    action_by VARCHAR(100),
    action_at TIMESTAMPTZ,
    periode_bulan VARCHAR(7), -- 'YYYY-MM'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_logs_wsid ON public.incident_logs(wsid);
CREATE INDEX IF NOT EXISTS idx_incident_logs_periode ON public.incident_logs(periode_bulan);
CREATE INDEX IF NOT EXISTS idx_incident_logs_start ON public.incident_logs(start_time);

-- ==============================================================================
-- 7. TABEL: FOLLOW_UP_TICKETS (Tiket Arahan Ka Wil / Ka Ops ke Tim Monitoring)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.follow_up_tickets (
    id VARCHAR(50) PRIMARY KEY, -- 'TKT-YYYYMMDD-XXXX'
    wsid VARCHAR(10) NOT NULL,
    lokasi TEXT,
    sektor VARCHAR(100),
    service_point VARCHAR(100),
    kategori_problem TEXT,
    deskripsi_arahan TEXT,
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(30) DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'WAITING_VALIDATION', 'CLOSED'
    target_selesai TIMESTAMPTZ,
    progress_notes JSONB DEFAULT '[]'::jsonb,
    closed_at TIMESTAMPTZ,
    closed_by VARCHAR(100),
    validation_notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_tickets_wsid ON public.follow_up_tickets(wsid);
CREATE INDEX IF NOT EXISTS idx_follow_up_tickets_status ON public.follow_up_tickets(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_tickets_sp ON public.follow_up_tickets(service_point);

-- ==============================================================================
-- 8. TABEL: QUICK_CHIPS (Konfigurasi Pilihan Cepat Preset Super Admin)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.quick_chips (
    id VARCHAR(50) PRIMARY KEY,
    category VARCHAR(30) NOT NULL, -- 'UPDATE', 'PENANGANAN', 'PROGRESS_TIKET', 'INSTRUKSI_REQUEST'
    text TEXT NOT NULL,
    order_num INT DEFAULT 1,
    is_custom BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_chips_category ON public.quick_chips(category);

-- ==============================================================================
-- 9. TABEL: APP_CONFIG (Pengaturan Sistem, Target SLA & Sesi Login)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.app_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 10. TABEL: UPLOAD_LOGS (Audit Trail Riwayat Upload Berkas Excel/CSV)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.upload_logs (
    id BIGSERIAL PRIMARY KEY,
    file_name TEXT,
    file_type VARCHAR(50),
    total_rows INT,
    uploaded_by VARCHAR(100),
    status VARCHAR(30),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 11. STORED PROCEDURE: AUTHENTICATE USER (LOGIN AMAN DENGAN BCRYPT/HASH)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.authenticate_app_user(
    p_username VARCHAR,
    p_password VARCHAR
)
RETURNS TABLE (
    id UUID,
    username VARCHAR,
    full_name VARCHAR,
    email VARCHAR,
    role VARCHAR,
    status VARCHAR,
    assigned_sektor VARCHAR,
    authenticated BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.full_name,
        u.email,
        u.role,
        u.status,
        u.assigned_sektor,
        CASE 
            WHEN u.status != 'ACTIVE' THEN FALSE
            WHEN u.password_hash = crypt(p_password, u.password_hash) THEN TRUE
            WHEN u.password_hash = p_password THEN TRUE
            WHEN u.password_hash = encode(digest(p_password, 'sha256'), 'hex') THEN TRUE
            ELSE FALSE
        END AS authenticated
    FROM public.app_users u
    WHERE LOWER(u.username) = LOWER(p_username)
    LIMIT 1;
END;
$$;

-- ==============================================================================
-- 12. ENABLE ROW LEVEL SECURITY (RLS) & PUBLIC ACCESS POLICIES
-- ==============================================================================
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_uptime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_chips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;

-- Kebijakan Akses Penuh untuk Anon Key / Frontend Dashboard
CREATE POLICY "Public full access to app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to machines" ON public.machines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to monthly_uptime" ON public.monthly_uptime FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to active_incidents" ON public.active_incidents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to incident_logs" ON public.incident_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to follow_up_tickets" ON public.follow_up_tickets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to quick_chips" ON public.quick_chips FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to app_config" ON public.app_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access to upload_logs" ON public.upload_logs FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 13. ENABLE SUPABASE REALTIME REPLICATION (MULTI-PC INSTANT SYNC)
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_chips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_up_tickets;

-- ==============================================================================
-- 14. INITIAL SEED: PENGGUNA DEFAULT (SUPER ADMIN, KAOPS, KAWIL, MONITORING)
-- ==============================================================================
INSERT INTO public.app_users (username, full_name, email, password_hash, role, status)
VALUES
  (
    'superadmin',
    'Super Administrator eMons BCA',
    'superadmin@bca.co.id',
    crypt('BcaAdmin2026!', gen_salt('bf')),
    'SUPER_ADMIN',
    'ACTIVE'
  ),
  (
    'kaops',
    'Kepala Operasional (Ka Ops)',
    'kaops@bca.co.id',
    crypt('Kaops2026!', gen_salt('bf')),
    'KAOPS',
    'ACTIVE'
  ),
  (
    'kawil',
    'Kepala Wilayah (Ka Wil)',
    'kawil@bca.co.id',
    crypt('Kawil2026!', gen_salt('bf')),
    'KAWIL',
    'ACTIVE'
  ),
  (
    'monitoring',
    'Tim Monitoring & Dispatcher',
    'monitoring@bca.co.id',
    crypt('Monitoring2026!', gen_salt('bf')),
    'MONITORING',
    'ACTIVE'
  )
ON CONFLICT (username) DO UPDATE SET
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name;

-- ==============================================================================
-- 15. INITIAL SEED: QUICK CHIPS DEFAULT
-- ==============================================================================
INSERT INTO public.quick_chips (id, category, text, order_num, is_custom)
VALUES
  ('qc_upd_1', 'UPDATE', 'Koordinasi Vendor Teknisi Onsite', 1, false),
  ('qc_upd_2', 'UPDATE', 'Menunggu Kedatangan Sparepart', 2, false),
  ('qc_upd_3', 'UPDATE', 'Perbaikan Jalur Jaringan / Router', 3, false),
  ('qc_upd_4', 'UPDATE', 'Kendala Listrik / UPS Gedung', 4, false),
  ('qc_upd_5', 'UPDATE', 'Eskalasi ke PIC Cabang', 5, false),
  ('qc_png_1', 'PENANGANAN', 'Restart Mesin & Sensor Normal', 1, false),
  ('qc_png_2', 'PENANGANAN', 'Penggantian Modul Cash Handler', 2, false),
  ('qc_png_3', 'PENANGANAN', 'Pembersihan Sensor Card Reader', 3, false),
  ('qc_png_4', 'PENANGANAN', 'Pengisian Ulang Kas Selesai', 4, false),
  ('qc_png_5', 'PENANGANAN', 'Reconnecting Jaringan Berhasil', 5, false),
  ('qc_prg_1', 'PROGRESS_TIKET', 'Teknisi Sedang Menuju Lokasi (OTW)', 1, false),
  ('qc_prg_2', 'PROGRESS_TIKET', 'Investigasi Masalah Bersama Vendor', 2, false),
  ('qc_prg_3', 'PROGRESS_TIKET', 'Part Sedang Diambil di Gudang', 3, false),
  ('qc_prg_4', 'PROGRESS_TIKET', 'Sedang Uji Coba Transaksi Tarik/Setor', 4, false),
  ('qc_prg_5', 'PROGRESS_TIKET', 'Perbaikan Selesai, Menunggu Validasi Ka Ops', 5, false),
  ('qc_ins_1', 'INSTRUKSI_REQUEST', 'Prioritas Utama: Mohon Segera Dispatch Teknisi', 1, false),
  ('qc_ins_2', 'INSTRUKSI_REQUEST', 'Cek Frekuensi Down Berulang dalam 7 Hari', 2, false),
  ('qc_ins_3', 'INSTRUKSI_REQUEST', 'Koordinasikan dengan Pengelola Lokasi/Mall', 3, false),
  ('qc_ins_4', 'INSTRUKSI_REQUEST', 'Lakukan Eskalasi ke Level 2 Vendor', 4, false)
ON CONFLICT (id) DO NOTHING;
