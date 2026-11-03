/**
 * Supabase Service Layer - Dashboard Monitoring & Downtime BCA
 * Mengelola interaksi query relasional, batch insertion, dan Realtime WebSockets.
 */

import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import type { QuickChipItem } from './quickChipsService';

// ==============================================================================
// 1. QUICK CHIPS (PILIHAN CEPAT) & REALTIME
// ==============================================================================

export async function fetchQuickChipsSupabase(): Promise<{
  success: boolean;
  chips: QuickChipItem[];
  message?: string;
}> {
  const client = getSupabase();
  if (!client) return { success: false, chips: [], message: 'Supabase belum dikonfigurasi.' };

  try {
    const { data, error } = await client
      .from('quick_chips')
      .select('*')
      .order('category', { ascending: true })
      .order('order_num', { ascending: true });

    if (error) throw error;

    const chips: QuickChipItem[] = (data || []).map((row: any) => ({
      id: row.id,
      category: row.category,
      text: row.text,
      order: row.order_num,
      isCustom: row.is_custom,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return { success: true, chips };
  } catch (err: any) {
    return { success: false, chips: [], message: err.message };
  }
}

export async function saveQuickChipsSupabase(
  chips: QuickChipItem[]
): Promise<{ success: boolean; message?: string }> {
  const client = getSupabase();
  if (!client) return { success: false, message: 'Supabase belum dikonfigurasi.' };

  try {
    const payload = chips.map((c, idx) => ({
      id: c.id,
      category: c.category,
      text: c.text,
      order_num: c.order !== undefined ? c.order : idx + 1,
      is_custom: Boolean(c.isCustom),
      updated_at: new Date().toISOString()
    }));

    // Upsert chips
    const { error: upsertErr } = await client
      .from('quick_chips')
      .upsert(payload, { onConflict: 'id' });

    if (upsertErr) throw upsertErr;

    // Hapus chip di Supabase yang sudah dihapus oleh user di UI
    const currentIds = chips.map((c) => c.id);
    if (currentIds.length > 0) {
      await client
        .from('quick_chips')
        .delete()
        .not('id', 'in', `(${currentIds.map((id) => `"${id}"`).join(',')})`);
    }

    return { success: true, message: 'Quick Chips berhasil disimpan ke Supabase!' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export function subscribeQuickChipsSupabase(onUpdate: (chips: QuickChipItem[]) => void) {
  const client = getSupabase();
  if (!client) return () => {};

  const channel = client
    .channel('realtime_quick_chips')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quick_chips' },
      async () => {
        const res = await fetchQuickChipsSupabase();
        if (res.success) {
          onUpdate(res.chips);
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// ==============================================================================
// 2. TIKET FOLLOW UP (KA WIL / KA OPS -> MONITORING) & REALTIME
// ==============================================================================

export async function fetchFollowUpTicketsSupabase(): Promise<{
  success: boolean;
  tickets: any[];
  message?: string;
}> {
  const client = getSupabase();
  if (!client) return { success: false, tickets: [], message: 'Supabase belum dikonfigurasi.' };

  try {
    const { data, error } = await client
      .from('follow_up_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const tickets = (data || []).map((t: any) => ({
      id: t.id,
      wsid: t.wsid,
      lokasi: t.lokasi,
      sektor: t.sektor,
      servicePoint: t.service_point,
      kategoriProblem: t.kategori_problem,
      deskripsiArahan: t.deskripsi_arahan,
      createdBy: t.created_by,
      createdAt: t.created_at,
      status: t.status,
      targetSelesai: t.target_selesai,
      progressNotes: t.progress_notes || [],
      closedAt: t.closed_at,
      closedBy: t.closed_by,
      validationNotes: t.validation_notes,
      updatedAt: t.updated_at
    }));

    return { success: true, tickets };
  } catch (err: any) {
    return { success: false, tickets: [], message: err.message };
  }
}

export async function saveFollowUpTicketSupabase(ticket: any): Promise<{
  success: boolean;
  message?: string;
}> {
  const client = getSupabase();
  if (!client) return { success: false, message: 'Supabase belum dikonfigurasi.' };

  try {
    const row = {
      id: ticket.id,
      wsid: String(ticket.wsid || '').trim(),
      lokasi: ticket.lokasi || '',
      sektor: ticket.sektor || '',
      service_point: ticket.servicePoint || ticket.service_point || '',
      kategori_problem: ticket.kategoriProblem || ticket.kategori_problem || '',
      deskripsi_arahan: ticket.deskripsiArahan || ticket.deskripsi_arahan || '',
      created_by: ticket.createdBy || ticket.created_by || 'Ka Ops',
      status: ticket.status || 'OPEN',
      target_selesai: ticket.targetSelesai || ticket.target_selesai || null,
      progress_notes: ticket.progressNotes || ticket.progress_notes || [],
      closed_at: ticket.closedAt || ticket.closed_at || null,
      closed_by: ticket.closedBy || ticket.closed_by || null,
      validation_notes: ticket.validationNotes || ticket.validation_notes || null,
      updated_at: new Date().toISOString()
    };

    const { error } = await client.from('follow_up_tickets').upsert(row, { onConflict: 'id' });
    if (error) throw error;

    return { success: true, message: 'Tiket berhasil disimpan ke Supabase!' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function deleteFollowUpTicketSupabase(ticketId: string): Promise<{
  success: boolean;
  message?: string;
}> {
  const client = getSupabase();
  if (!client) return { success: false, message: 'Supabase belum dikonfigurasi.' };

  try {
    const { error } = await client.from('follow_up_tickets').delete().eq('id', ticketId);
    if (error) throw error;
    return { success: true, message: 'Tiket berhasil dihapus dari Supabase.' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export function subscribeFollowUpTicketsSupabase(onUpdate: (tickets: any[]) => void) {
  const client = getSupabase();
  if (!client) return () => {};

  const channel = client
    .channel('realtime_follow_up_tickets')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'follow_up_tickets' },
      async () => {
        const res = await fetchFollowUpTicketsSupabase();
        if (res.success) {
          onUpdate(res.tickets);
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// ==============================================================================
// 3. MASTER MESIN (2.043 MESIN) & BATCH INSERT
// ==============================================================================

export async function fetchMachinesSupabase(): Promise<{
  success: boolean;
  machines: any[];
  count: number;
  message?: string;
}> {
  const client = getSupabase();
  if (!client) return { success: false, machines: [], count: 0, message: 'Supabase belum dikonfigurasi.' };

  try {
    // Ambil seluruh mesin (gunakan pagination jika lebih dari 1000 baris)
    let allMachines: any[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await client
        .from('machines')
        .select('*')
        .range(from, from + step - 1)
        .order('wsid', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        allMachines = allMachines.concat(data);
        from += step;
        if (data.length < step) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    return { success: true, machines: allMachines, count: allMachines.length };
  } catch (err: any) {
    return { success: false, machines: [], count: 0, message: err.message };
  }
}

export async function upsertMachinesBatchSupabase(
  machinesList: any[],
  batchSize = 250,
  onProgress?: (processed: number, total: number) => void
): Promise<{ success: boolean; totalProcessed: number; message?: string }> {
  const client = getSupabase();
  if (!client) return { success: false, totalProcessed: 0, message: 'Supabase belum dikonfigurasi.' };

  try {
    let processed = 0;
    const total = machinesList.length;

    for (let i = 0; i < total; i += batchSize) {
      const chunk = machinesList.slice(i, i + batchSize).map((m) => ({
        wsid: String(m.wsid || '').trim().replace(/^0+/, '') || String(m.wsid || ''),
        jenis_mesin: m.jenisMesin || m.jenis_mesin || 'ATM',
        klien_status: m.klienStatus || m.klien_status || 'BCA',
        sektor_bca: m.sektorBCA || m.sektor_bca || '',
        wilayah_operasional: m.wilayahOperasional || m.wilayah_operasional || '',
        lokasi: m.lokasi || '',
        vendor: m.vendor || '',
        tipe_mesin: m.tipeMesin || m.tipe_mesin || '',
        status_aktif: m.statusAktif || m.status_aktif || 'AKTIF',
        jam_operasional: m.jam || m.jam_operasional || '(00:00 - 24:00)',
        opr: Number(m.opr) || 43200,
        updated_at: new Date().toISOString()
      }));

      const { error } = await client.from('machines').upsert(chunk, { onConflict: 'wsid' });
      if (error) throw error;

      processed += chunk.length;
      if (onProgress) onProgress(processed, total);
    }

    return { success: true, totalProcessed: processed };
  } catch (err: any) {
    return { success: false, totalProcessed: 0, message: err.message };
  }
}

// ==============================================================================
// 4. MONTHLY UPTIME BATCH UPSERT
// ==============================================================================

export async function upsertMonthlyUptimeBatchSupabase(
  records: any[],
  batchSize = 300,
  onProgress?: (processed: number, total: number) => void
): Promise<{ success: boolean; totalProcessed: number; message?: string }> {
  const client = getSupabase();
  if (!client) return { success: false, totalProcessed: 0, message: 'Supabase belum dikonfigurasi.' };

  try {
    let processed = 0;
    const total = records.length;

    for (let i = 0; i < total; i += batchSize) {
      const chunk = records.slice(i, i + batchSize).map((r) => ({
        wsid: String(r.wsid || '').trim().replace(/^0+/, '') || String(r.wsid || ''),
        periode: r.periode,
        uh: Number(r.uh) || 0,
        uh_frx: Number(r.uhFrx || r.uh_frx) || 0,
        uh_dur: Number(r.uhDur || r.uh_dur) || 0,
        um: Number(r.um) || 0,
        um_frx: Number(r.umFrx || r.um_frx) || 0,
        um_dur: Number(r.umDur || r.um_dur) || 0,
        pm: Number(r.pm) || 0,
        pm_frx: Number(r.pmFrx || r.pm_frx) || 0,
        pm_dur: Number(r.pmDur || r.pm_dur) || 0,
        total_downtime_dur: Number(r.totalDowntimeDur || r.total_downtime_dur) || 0,
        target_sla: Number(r.targetSla || r.target_sla) || 98.50,
        target_vol: Number(r.targetVol || r.target_vol) || 0,
        is_locked: Boolean(r.isLocked || r.is_locked),
        updated_at: new Date().toISOString()
      }));

      const { error } = await client
        .from('monthly_uptime')
        .upsert(chunk, { onConflict: 'wsid,periode' });

      if (error) throw error;

      processed += chunk.length;
      if (onProgress) onProgress(processed, total);
    }

    return { success: true, totalProcessed: processed };
  } catch (err: any) {
    return { success: false, totalProcessed: 0, message: err.message };
  }
}

// ==============================================================================
// 5. MANAJEMEN PENGGUNA (APP_USERS) & SUPER ADMIN
// ==============================================================================

export type AppUserRole = 'SUPER_ADMIN' | 'KAWIL' | 'KAOPS' | 'MONITORING' | 'VIEWER';
export type AppUserStatus = 'ACTIVE' | 'INACTIVE';

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  role: AppUserRole;
  status: AppUserStatus;
  assignedSektor?: string;
  phoneNumber?: string;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function fetchUsersSupabase(): Promise<{
  success: boolean;
  users: AppUser[];
  message?: string;
}> {
  const client = getSupabase();
  if (!client) return { success: false, users: [], message: 'Supabase belum dikonfigurasi.' };

  try {
    const { data, error } = await client
      .from('app_users')
      .select('id, username, full_name, email, role, status, assigned_sektor, phone_number, last_login_at, created_at, updated_at')
      .order('role', { ascending: true })
      .order('username', { ascending: true });

    if (error) throw error;

    const users: AppUser[] = (data || []).map((u: any) => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      email: u.email,
      role: u.role as AppUserRole,
      status: u.status as AppUserStatus,
      assignedSektor: u.assigned_sektor,
      phoneNumber: u.phone_number,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
      updatedAt: u.updated_at
    }));

    return { success: true, users };
  } catch (err: any) {
    return { success: false, users: [], message: err.message };
  }
}

export async function saveUserSupabase(user: {
  id?: string;
  username: string;
  fullName: string;
  email?: string;
  password?: string;
  role: AppUserRole;
  status: AppUserStatus;
  assignedSektor?: string;
  phoneNumber?: string;
}): Promise<{ success: boolean; user?: AppUser; message?: string }> {
  const client = getSupabase();
  if (!client) return { success: false, message: 'Supabase belum dikonfigurasi.' };

  try {
    const payload: any = {
      username: user.username.trim().toLowerCase(),
      full_name: user.fullName.trim(),
      email: user.email?.trim() || null,
      role: user.role,
      status: user.status,
      assigned_sektor: user.assignedSektor?.trim() || null,
      phone_number: user.phoneNumber?.trim() || null,
      updated_at: new Date().toISOString()
    };

    if (user.password && user.password.trim()) {
      // Simpan password dengan hash SHA-256 / plain fallback kompatibel authenticate_app_user
      payload.password_hash = user.password.trim();
    }

    if (user.id) {
      // Update
      const { data, error } = await client
        .from('app_users')
        .update(payload)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, user: data, message: 'Pengguna berhasil diperbarui.' };
    } else {
      // Create new
      if (!user.password || !user.password.trim()) {
        throw new Error('Password wajib diisi untuk pengguna baru.');
      }
      const { data, error } = await client
        .from('app_users')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return { success: true, user: data, message: 'Pengguna baru berhasil ditambahkan.' };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function deleteUserSupabase(userId: string): Promise<{
  success: boolean;
  message?: string;
}> {
  const client = getSupabase();
  if (!client) return { success: false, message: 'Supabase belum dikonfigurasi.' };

  try {
    const { error } = await client.from('app_users').delete().eq('id', userId);
    if (error) throw error;
    return { success: true, message: 'Pengguna berhasil dihapus.' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export function subscribeUsersSupabase(onUpdate: (users: AppUser[]) => void) {
  const client = getSupabase();
  if (!client) return () => {};

  const channel = client
    .channel('realtime_app_users')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_users' },
      async () => {
        const res = await fetchUsersSupabase();
        if (res.success) {
          onUpdate(res.users);
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}


