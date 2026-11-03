import { useState, useEffect } from 'react';
import { apiGet, apiPost, isBackendConfigured } from './apiClient';

export type QuickChipCategory = 'UPDATE' | 'PENANGANAN' | 'PROGRESS_TIKET' | 'INSTRUKSI_REQUEST';

export interface QuickChipItem {
  id: string;
  category: QuickChipCategory;
  text: string;
  order: number;
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const QUICK_CHIP_CATEGORIES: {
  id: QuickChipCategory;
  name: string;
  shortName: string;
  description: string;
  badgeClass: string;
  chipClass: string;
  colorName: string;
}[] = [
  {
    id: 'UPDATE',
    name: 'Tindakan Update (Info Progres / Lapangan)',
    shortName: 'Update Progres',
    description: 'Pilihan cepat pada pop-up tindakan monitoring untuk mencatat update status lapangan (tim OTW, koordinasi, dll).',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    chipClass: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200',
    colorName: 'blue'
  },
  {
    id: 'PENANGANAN',
    name: 'Tindakan Penanganan (Perbaikan Nyata Mesin)',
    shortName: 'Penanganan Mesin',
    description: 'Pilihan cepat tindakan saat mesin telah dilakukan perbaikan teknis nyata (replenish, reset, swap part, dll).',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    chipClass: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200',
    colorName: 'emerald'
  },
  {
    id: 'PROGRESS_TIKET',
    name: 'Progres Tiket Follow Up (Tindak Lanjut)',
    shortName: 'Progres Tiket',
    description: 'Pilihan cepat saat memperbarui catatan riwayat progres penanganan tiket tindak lanjut ke monitoring.',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    chipClass: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200',
    colorName: 'purple'
  },
  {
    id: 'INSTRUKSI_REQUEST',
    name: 'Instruksi Request Ka Ops / Ka Wil',
    shortName: 'Instruksi Request',
    description: 'Pilihan cepat arahan awal saat Ka Ops / Ka Wil menerbitkan tiket permintaan tindak lanjut baru ke monitoring.',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    chipClass: 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200',
    colorName: 'amber'
  }
];

export const DEFAULT_QUICK_CHIPS: QuickChipItem[] = [
  // 1. Kategori: UPDATE
  { id: 'qc_up_1', category: 'UPDATE', text: 'Tim OTW Lokasi', order: 1 },
  { id: 'qc_up_2', category: 'UPDATE', text: 'Koordinasi Vendor FLM', order: 2 },
  { id: 'qc_up_3', category: 'UPDATE', text: 'Menunggu Tim CIT', order: 3 },
  { id: 'qc_up_4', category: 'UPDATE', text: 'Konfirmasi Pengelola / Cabang', order: 4 },
  { id: 'qc_up_5', category: 'UPDATE', text: 'Monitoring Berkala / Standby', order: 5 },

  // 2. Kategori: PENANGANAN
  { id: 'qc_pen_1', category: 'PENANGANAN', text: 'Replenish Ulang', order: 1 },
  { id: 'qc_pen_2', category: 'PENANGANAN', text: 'Eskalasi SLM (Part Replacement)', order: 2 },
  { id: 'qc_pen_3', category: 'PENANGANAN', text: 'Eskalasi Jaringan / Provider', order: 3 },
  { id: 'qc_pen_4', category: 'PENANGANAN', text: 'Cek Kelistrikan / UPS', order: 4 },
  { id: 'qc_pen_5', category: 'PENANGANAN', text: 'Reset / Reboot Mesin', order: 5 },
  { id: 'qc_pen_6', category: 'PENANGANAN', text: 'Ganti Sensor / Modul', order: 6 },
  { id: 'qc_pen_7', category: 'PENANGANAN', text: 'Sudah Penanganan Teknisi', order: 7 },
  { id: 'qc_pen_8', category: 'PENANGANAN', text: 'Mesin Sudah Normal / Up Kembali', order: 8 },

  // 3. Kategori: PROGRESS_TIKET
  { id: 'qc_prog_1', category: 'PROGRESS_TIKET', text: 'Sudah koordinasi dengan PIC vendor untuk dispatch teknisi', order: 1 },
  { id: 'qc_prog_2', category: 'PROGRESS_TIKET', text: 'Teknisi vendor sedang OTW menuju lokasi mesin', order: 2 },
  { id: 'qc_prog_3', category: 'PROGRESS_TIKET', text: 'Teknisi sudah tiba di lokasi, sedang pengecekan fisik modul', order: 3 },
  { id: 'qc_prog_4', category: 'PROGRESS_TIKET', text: 'Menunggu pengiriman modul pengganti (swap sparepart)', order: 4 },
  { id: 'qc_prog_5', category: 'PROGRESS_TIKET', text: 'Modul berhasil diganti, pengetesan penarikan/setoran tunai sukses', order: 5 },
  { id: 'qc_prog_6', category: 'PROGRESS_TIKET', text: 'Problem jaringan berhasil di-reset, status mesin sudah kembali online', order: 6 },
  { id: 'qc_prog_7', category: 'PROGRESS_TIKET', text: 'Koordinasi dengan pihak cabang / pengelola gedung terkait kelistrikan', order: 7 },
  { id: 'qc_prog_8', category: 'PROGRESS_TIKET', text: 'Mesin sudah normal kembali dan siap ditransaksikan nasabah', order: 8 },

  // 4. Kategori: INSTRUKSI_REQUEST
  { id: 'qc_req_1', category: 'INSTRUKSI_REQUEST', text: 'Mohon percepatan koordinasi teknisi vendor ke lokasi', order: 1 },
  { id: 'qc_req_2', category: 'INSTRUKSI_REQUEST', text: 'Problem berulang >3x dalam seminggu, mohon eskalasi pergantian part/modul', order: 2 },
  { id: 'qc_req_3', category: 'INSTRUKSI_REQUEST', text: 'Periksa kestabilan jaringan komunikasi / modem VSAT lokasi', order: 3 },
  { id: 'qc_req_4', category: 'INSTRUKSI_REQUEST', text: 'Cek fisik jalur kelistrikan, MCB, dan kestabilan tegangan UPS', order: 4 },
  { id: 'qc_req_5', category: 'INSTRUKSI_REQUEST', text: 'Segera tindak lanjuti cash handler / dispenser yang macet', order: 5 },
  { id: 'qc_req_6', category: 'INSTRUKSI_REQUEST', text: 'Mohon jadwalkan kunjungan teknisi untuk general inspection mesin', order: 6 }
];

const STORAGE_KEY = 'EMONS_QUICK_CHIPS_V1';
const EVENT_NAME = 'emons_quick_chips_updated';

/**
 * Membaca daftar chip dari localStorage, fallback ke DEFAULT_QUICK_CHIPS
 */
export function loadQuickChips(): QuickChipItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      saveQuickChips(DEFAULT_QUICK_CHIPS, false);
      return DEFAULT_QUICK_CHIPS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('Gagal membaca quick chips dari localStorage:', e);
  }
  return DEFAULT_QUICK_CHIPS;
}

/**
 * Menyimpan daftar chip ke localStorage dan mentrigger event ke seluruh komponen
 */
export function saveQuickChips(chips: QuickChipItem[], syncToServer = true): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chips));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: chips }));

    if (syncToServer && isBackendConfigured()) {
      apiPost('saveQuickChipsConfig', { chips }).catch((err) => {
        console.warn('Gagal menyimpan quick chips ke backend:', err);
      });
    }
  } catch (e) {
    console.error('Gagal menyimpan quick chips:', e);
  }
}

/**
 * Mengambil chip berdasarkan kategori dan terurut sesuai order
 */
export function getQuickChipsByCategory(category: QuickChipCategory): QuickChipItem[] {
  const all = loadQuickChips();
  return all
    .filter((c) => c.category === category)
    .sort((a, b) => a.order - b.order);
}

/**
 * Mengambil array string teks chip untuk kategori tertentu
 */
export function getQuickChipTexts(category: QuickChipCategory): string[] {
  return getQuickChipsByCategory(category).map((c) => c.text);
}

/**
 * Menambahkan chip baru
 */
export function addQuickChip(category: QuickChipCategory, text: string): QuickChipItem {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('Teks pilihan cepat tidak boleh kosong.');

  const all = loadQuickChips();
  const categoryChips = all.filter((c) => c.category === category);
  const maxOrder = categoryChips.reduce((max, c) => Math.max(max, c.order || 0), 0);

  const newItem: QuickChipItem = {
    id: 'qc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    category,
    text: cleanText,
    order: maxOrder + 1,
    isCustom: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  all.push(newItem);
  saveQuickChips(all);
  return newItem;
}

/**
 * Memperbarui teks atau kategori chip
 */
export function updateQuickChip(id: string, updates: Partial<QuickChipItem>): boolean {
  const all = loadQuickChips();
  const index = all.findIndex((c) => c.id === id);
  if (index === -1) return false;

  all[index] = {
    ...all[index],
    ...updates,
    text: updates.text ? updates.text.trim() : all[index].text,
    updatedAt: new Date().toISOString(),
    isCustom: true
  };

  saveQuickChips(all);
  return true;
}

/**
 * Menghapus chip berdasarkan ID
 */
export function deleteQuickChip(id: string): boolean {
  const all = loadQuickChips();
  const filtered = all.filter((c) => c.id !== id);
  if (filtered.length === all.length) return false;

  saveQuickChips(filtered);
  return true;
}

/**
 * Mengubah urutan chip (UP atau DOWN)
 */
export function reorderQuickChip(id: string, direction: 'UP' | 'DOWN'): boolean {
  const all = loadQuickChips();
  const target = all.find((c) => c.id === id);
  if (!target) return false;

  const categoryChips = all
    .filter((c) => c.category === target.category)
    .sort((a, b) => a.order - b.order);

  const idx = categoryChips.findIndex((c) => c.id === id);
  if (idx === -1) return false;

  if (direction === 'UP' && idx > 0) {
    const prev = categoryChips[idx - 1];
    const tempOrder = target.order;
    target.order = prev.order;
    prev.order = tempOrder;
  } else if (direction === 'DOWN' && idx < categoryChips.length - 1) {
    const next = categoryChips[idx + 1];
    const tempOrder = target.order;
    target.order = next.order;
    next.order = tempOrder;
  } else {
    return false;
  }

  saveQuickChips(all);
  return true;
}

/**
 * Mengembalikan seluruh chip ke default bawaan sistem
 */
export function resetQuickChipsToDefault(): void {
  saveQuickChips(DEFAULT_QUICK_CHIPS);
}

/**
 * Sinkronisasi awal dari backend Google Apps Script jika tersedia
 */
export async function syncQuickChipsFromServer(): Promise<QuickChipItem[]> {
  if (!isBackendConfigured()) return loadQuickChips();

  try {
    const res = await apiGet('getQuickChipsConfig');
    if (res && res.success && Array.isArray(res.chips) && res.chips.length > 0) {
      saveQuickChips(res.chips, false);
      return res.chips;
    }
  } catch (err) {
    console.warn('Gagal sync quick chips dari server:', err);
  }
  return loadQuickChips();
}

/**
 * React Hook untuk memantau perubahan quick chips secara reaktif
 */
export function useQuickChips(categoryFilter?: QuickChipCategory) {
  const [chips, setChips] = useState<QuickChipItem[]>(() => {
    return categoryFilter ? getQuickChipsByCategory(categoryFilter) : loadQuickChips();
  });

  useEffect(() => {
    const handler = (e: any) => {
      const all: QuickChipItem[] = e.detail || loadQuickChips();
      if (categoryFilter) {
        setChips(all.filter((c) => c.category === categoryFilter).sort((a, b) => a.order - b.order));
      } else {
        setChips(all);
      }
    };

    window.addEventListener(EVENT_NAME, handler);
    // Sinkronisasi background dari server saat mount
    syncQuickChipsFromServer().then((updated) => {
      if (categoryFilter) {
        setChips(updated.filter((c) => c.category === categoryFilter).sort((a, b) => a.order - b.order));
      } else {
        setChips(updated);
      }
    });

    return () => {
      window.removeEventListener(EVENT_NAME, handler);
    };
  }, [categoryFilter]);

  return {
    chips,
    chipTexts: chips.map((c) => c.text),
    addChip: (category: QuickChipCategory, text: string) => addQuickChip(category, text),
    updateChip: (id: string, updates: Partial<QuickChipItem>) => updateQuickChip(id, updates),
    deleteChip: (id: string) => deleteQuickChip(id),
    reorderChip: (id: string, direction: 'UP' | 'DOWN') => reorderQuickChip(id, direction),
    resetToDefault: () => resetQuickChipsToDefault()
  };
}
