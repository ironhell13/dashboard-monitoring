import { type MachineData } from '../store/useDataStore';

export interface HighestProblemResult {
  categoryKey: string;
  categoryName: string;
  value: number;
}

export const hwDetailMap: Record<string, string> = {
  P01: 'P01 - Pick Modul',
  P02: 'P02 - Presenter',
  P03: 'P03 - Reject',
  P04: 'P04 - Card Reader',
  P05: 'P05 - Komunikasi',
  P06: 'P06 - DIU',
  P07: 'P07 - Uang Habis',
  P08: 'P08 - Replenishment',
  P09: 'P09 - LLH',
  P10: 'P10 - Uang Penuh'
};

/**
 * Menerima satu object aggregatedData atau menggabungkan array of machines
 * dan mengembalikan problem dengan persentase (value) tertinggi.
 */
export function getHighestProblemCategory(aggregatedData: any): HighestProblemResult {
  if (!aggregatedData) {
    return { categoryKey: 'N/A', categoryName: 'Tidak ada data', value: 0 };
  }

  const categories = [
    { key: 'uh', name: 'UH', value: aggregatedData.uh || 0 },
    { key: 'kom', name: 'KOM', value: aggregatedData.kom || 0 },
    { key: 'up', name: 'UP', value: aggregatedData.up || 0 },
    { key: 'll', name: 'LL', value: aggregatedData.ll || 0 },
    { key: 'hw', name: 'HW', value: aggregatedData.hw || 0 },
  ];

  // Find max among main categories
  let maxCat = categories[0];
  for (const cat of categories) {
    if (cat.value > maxCat.value) {
      maxCat = cat;
    }
  }

  // Jika tidak ada problem sama sekali (semua 0)
  if (maxCat.value === 0) {
    return { categoryKey: 'N/A', categoryName: 'Tidak Ada Problem', value: 0 };
  }

  // Jika HW adalah yang tertinggi, cari sub-detailnya
  if (maxCat.key === 'hw' && aggregatedData.hwDetail) {
    let maxHwDetailKey = 'P01';
    let maxHwDetailValue = -1;

    // Hanya cek P01 sampai P04 sesuai instruksi
    const hwKeysToCheck = ['P01', 'P02', 'P03', 'P04'];
    
    for (const key of hwKeysToCheck) {
      const val = aggregatedData.hwDetail[key] || 0;
      if (val > maxHwDetailValue) {
        maxHwDetailValue = val;
        maxHwDetailKey = key;
      }
    }

    const detailName = hwDetailMap[maxHwDetailKey] || maxHwDetailKey;
    
    // Jangan tampilkan 'HW', langsung tampilkan detailnya sesuai instruksi
    return {
      categoryKey: `hw_${maxHwDetailKey}`,
      categoryName: detailName,
      value: maxCat.value // Tetap gunakan value HW total sebagai representasi tingginya
    };
  }

  return {
    categoryKey: maxCat.key,
    categoryName: maxCat.name,
    value: maxCat.value
  };
}

/**
 * Mengkalkulasi rata-rata data dari array machines 
 * Berguna saat menghitung tertinggi pada level sektor
 */
export function aggregateMachinesData(machines: (MachineData & { aggregatedData?: any })[]) {
  if (!machines || machines.length === 0) return null;

  const aggregated = {
    uh: 0, kom: 0, up: 0, hw: 0, ll: 0, total: 0,
    hwDetail: { P01: 0, P02: 0, P03: 0, P04: 0 }
  };

  let validCount = 0;

  for (const machine of machines) {
    if (machine.aggregatedData) {
      validCount++;
      aggregated.uh += machine.aggregatedData.uh || 0;
      aggregated.kom += machine.aggregatedData.kom || 0;
      aggregated.up += machine.aggregatedData.up || 0;
      aggregated.hw += machine.aggregatedData.hw || 0;
      aggregated.ll += machine.aggregatedData.ll || 0;
      aggregated.total += machine.aggregatedData.total || 0;
      
      if (machine.aggregatedData.hwDetail) {
        aggregated.hwDetail.P01 += machine.aggregatedData.hwDetail.P01 || 0;
        aggregated.hwDetail.P02 += machine.aggregatedData.hwDetail.P02 || 0;
        aggregated.hwDetail.P03 += machine.aggregatedData.hwDetail.P03 || 0;
        aggregated.hwDetail.P04 += machine.aggregatedData.hwDetail.P04 || 0;
      }
    }
  }

  if (validCount > 0) {
    aggregated.uh /= validCount;
    aggregated.kom /= validCount;
    aggregated.up /= validCount;
    aggregated.hw /= validCount;
    aggregated.ll /= validCount;
    aggregated.total /= validCount;
    aggregated.hwDetail.P01 /= validCount;
    aggregated.hwDetail.P02 /= validCount;
    aggregated.hwDetail.P03 /= validCount;
    aggregated.hwDetail.P04 /= validCount;
  }

  return aggregated;
}

export function getValueForCategory(aggregatedData: any, categoryKey: string): number {
  if (!aggregatedData) return 0;
  if (categoryKey.startsWith('hw_')) {
    const detailKey = categoryKey.replace('hw_', '');
    return aggregatedData.hwDetail ? (aggregatedData.hwDetail[detailKey] || 0) : 0;
  }
  return aggregatedData[categoryKey] || 0;
}

export function getFrxDurForCategory(aggregatedData: any, categoryKey: string): { frx: number, dur: number } {
  if (!aggregatedData) return { frx: 0, dur: 0 };
  
  if (categoryKey.startsWith('hw_')) {
    // Hardware subcategories don't have separate FRX/DUR in the raw data,
    // so we return the parent HW's total FRX/DUR.
    return { 
      frx: aggregatedData.hwFrx || 0, 
      dur: aggregatedData.hwDur || 0 
    };
  }

  return { 
     frx: aggregatedData[`${categoryKey}Frx`] || 0,
     dur: aggregatedData[`${categoryKey}Dur`] || 0
  };
}
