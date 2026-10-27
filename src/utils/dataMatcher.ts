import type { MachineData, MonthlyProblemData } from '../store/useDataStore';
import type { MasterRow, ParsedUptimeFile, UptimeRow } from './excelParser';
import { normalizePeriode, SERVICE_POINT_MAP } from './comprehensiveExporter';
import { cleanSektorName } from './dailyIncidentParser';

export const matchData = (
  masterData: MasterRow[],
  uptimeFiles: ParsedUptimeFile[]
): MachineData[] => {
  
  // Create a fast lookup map for Master Data
  const masterMap = new Map<string, MasterRow>();
  for (const row of masterData) {
    if (row.WSID) {
      masterMap.set(String(row.WSID).trim(), row);
    }
  }

  const machineMap = new Map<string, MachineData>();

  const getValIC = (obj: any, key: string) => {
    if (!obj) return undefined;
    const exact = obj[key];
    if (exact !== undefined) return exact;
    const lowerKey = key.toLowerCase().trim();
    for (const k in obj) {
      if (k.trim().toLowerCase() === lowerKey) return obj[k];
    }
    return undefined;
  };

  // Pre-load ALL machines from Master Data (ensures all sectors exist)
  for (const row of masterData) {
    if (row.WSID) {
      const wsid = String(row.WSID).trim();

      const klienVal = getValIC(row, 'Klien');
      const isBCA = String(klienVal || '').trim().toUpperCase() === 'BCA';
      
      const jenisMesinVal = getValIC(row, 'Jenis Mesin');
      const rawSektorVal = String(getValIC(row, 'Sektor') || '').trim();
      const rawWilayahVal = String(getValIC(row, 'Wilayah') || '').trim();

      let sektorVal = rawSektorVal || (isBCA ? 'Unknown' : 'Non BCA');
      if (rawSektorVal) {
        const cleaned = cleanSektorName(rawSektorVal);
        if (cleaned === '-') {
          sektorVal = isBCA ? 'Unknown' : 'Non BCA';
        } else if (!rawSektorVal.includes('-') && rawWilayahVal && SERVICE_POINT_MAP[rawWilayahVal.toUpperCase()]) {
          sektorVal = `${rawWilayahVal.toUpperCase()}-${cleaned}`;
        }
      }

      const wilayahVal = rawWilayahVal || (rawSektorVal.includes('-') ? rawSektorVal.split('-')[0].trim().toUpperCase() : 'ACJK');
      const lokasiVal = getValIC(row, 'Nama Lokasi');
      const tipeMesinVal = getValIC(row, 'Tipe Mesin');
      const statusVal = getValIC(row, 'Status');
      
      const vendorVal = getValIC(row, 'Vendor');
      const hariVal = getValIC(row, 'Hari');
      const jamVal = getValIC(row, 'Jam');
      const oprVal = getValIC(row, 'OPR');
      
      machineMap.set(wsid, {
        wsid,
        jenisMesin: jenisMesinVal || 'ATM',
        klienStatus: isBCA ? 'BCA' : 'Non BCA',
        sektorBCA: sektorVal,
        wilayahOperasional: wilayahVal,
        lokasi: lokasiVal || 'Unknown Lokasi',
        vendor: vendorVal || '-',
        tipeMesin: tipeMesinVal || '',
        statusAktif: statusVal || 'AKTIF',
        hari: hariVal || undefined,
        jam: jamVal || undefined,
        opr: oprVal || undefined,
        monthlyData: []
      });
    }
  }

  // Process all uptime files
  for (const file of uptimeFiles) {
    const fileNormPeriode = normalizePeriode(file.periode);

    const processRow = (row: UptimeRow, jenis: 'ATM' | 'CRM') => {
      const wsid = String(row.WSID || '').trim();
      if (!wsid) return;

      const masterRow = masterMap.get(wsid);
      const masterWilayah = masterRow ? getValIC(masterRow, 'Wilayah') : 'Unknown';
      const wilayahOperasional = (row.DESCKCU || row.KWW || masterWilayah || 'Unknown').trim().toUpperCase();

      // HANYA proses mesin kelolaan ABACUS JAKARTA (sesuai instruksi spesifik pengguna)
      if (wilayahOperasional !== 'ABACUS JAKARTA' && !masterRow) {
        return;
      }
      
      // Determine BCA vs Non BCA
      const klienMasterVal = getValIC(masterRow, 'Klien');
      const klienUptimeVal = getValIC(row, 'Klien');
      
      let isBCA = false;
      if (masterRow && klienMasterVal !== undefined && klienMasterVal !== '') {
        isBCA = String(klienMasterVal).trim().toUpperCase() === 'BCA';
      } else {
        isBCA = String(klienUptimeVal || '').trim().toUpperCase() === 'BCA';
      }
      
      const klienStatus: 'BCA' | 'Non BCA' = isBCA ? 'BCA' : 'Non BCA';

      // Helper to safely get numeric values
      const getNum = (key: string) => Number(row[key]) || 0;

      // Ekstrak detail sub-kategori hardware P01 s.d P10 secara dinamis
      const hwDetailObj: Record<string, number> = {};
      const hwSubObj: Record<string, { frx: number; dur: number; pct: number }> = {};

      for (let p = 1; p <= 10; p++) {
        const pKey = `P${p < 10 ? '0' + p : p}`;
        let pPct = 0;
        let pFrx = 0;
        let pDur = 0;

        for (const k in row) {
          if (k.startsWith(pKey)) {
            if (k.endsWith('_pct') || k === `${pKey}_pct` || k === pKey) {
              pPct = getNum(k);
            } else if (k.endsWith('_frx')) {
              pFrx = getNum(k);
            } else if (k.endsWith('_dur')) {
              pDur = getNum(k);
            }
          }
        }

        if (row.hwDetail && (row.hwDetail as any)[pKey] !== undefined) {
          pPct = Number((row.hwDetail as any)[pKey]) || pPct;
        }
        if (row.hwSubCategories && (row.hwSubCategories as any)[pKey]) {
          pFrx = Number((row.hwSubCategories as any)[pKey].frx) || pFrx;
          pDur = Number((row.hwSubCategories as any)[pKey].dur) || pDur;
          pPct = Number((row.hwSubCategories as any)[pKey].pct) || pPct;
        }

        hwDetailObj[pKey] = pPct;
        hwSubObj[pKey] = { frx: pFrx, dur: pDur, pct: pPct };
      }

      let uhVal = getNum('UH_pct');
      let uhFrxVal = getNum('UH_frx');
      let uhDurVal = getNum('UH_dur');
      if (uhVal === 0 && hwDetailObj['P07']) uhVal = hwDetailObj['P07'];
      if (uhFrxVal === 0 && hwSubObj['P07']?.frx) uhFrxVal = hwSubObj['P07'].frx;
      if (uhDurVal === 0 && hwSubObj['P07']?.dur) uhDurVal = hwSubObj['P07'].dur;

      let komVal = getNum('KOM_pct');
      let komFrxVal = getNum('KOM_frx');
      let komDurVal = getNum('KOM_dur');
      if (komVal === 0 && hwDetailObj['P05']) komVal = hwDetailObj['P05'];
      if (komFrxVal === 0 && hwSubObj['P05']?.frx) komFrxVal = hwSubObj['P05'].frx;
      if (komDurVal === 0 && hwSubObj['P05']?.dur) komDurVal = hwSubObj['P05'].dur;

      let upVal = getNum('UP_pct');
      let upFrxVal = getNum('UP_frx');
      let upDurVal = getNum('UP_dur');
      if (upVal === 0 && hwDetailObj['P10']) upVal = hwDetailObj['P10'];
      if (upFrxVal === 0 && hwSubObj['P10']?.frx) upFrxVal = hwSubObj['P10'].frx;
      if (upDurVal === 0 && hwSubObj['P10']?.dur) upDurVal = hwSubObj['P10'].dur;

      let hwVal = getNum('H/W_pct') || getNum('HW_pct');
      let hwFrxVal = getNum('H/W_frx') || getNum('HW_frx');
      let hwDurVal = getNum('H/W_dur') || getNum('HW_dur');

      let llVal = getNum('LL_pct');
      let llFrxVal = getNum('LL_frx');
      let llDurVal = getNum('LL_dur');
      if (llVal === 0 && hwDetailObj['P08']) llVal = hwDetailObj['P08'];
      if (llFrxVal === 0 && hwSubObj['P08']?.frx) llFrxVal = hwSubObj['P08'].frx;
      if (llDurVal === 0 && hwSubObj['P08']?.dur) llDurVal = hwSubObj['P08'].dur;

      const totalVal = getNum('Total_pct');
      const totalFrxVal = getNum('Total_frx');
      const totalDurVal = getNum('Total_dur');

      // Jika HW frx atau dur bernilai 0, jumlahkan dari subkategori HW (P01, P02, P03, P04, P06, P09)
      if (hwFrxVal === 0 || hwDurVal === 0) {
        let subFrx = 0;
        let subDur = 0;
        ['P01', 'P02', 'P03', 'P04', 'P06', 'P09'].forEach(pk => {
          if (hwSubObj[pk]) {
            subFrx += hwSubObj[pk].frx || 0;
            subDur += hwSubObj[pk].dur || 0;
          }
        });
        if (hwFrxVal === 0 && subFrx > 0) hwFrxVal = subFrx;
        if (hwDurVal === 0 && subDur > 0) hwDurVal = subDur;
      }

      // Rekonstruksi durasi HANYA jika bernilai 0 namun persentase > 0
      const opr = (totalVal > 0 && totalDurVal > 0) ? (totalDurVal / (totalVal / 100)) : (Number(row.OPR) || 44640);
      const calcDur = (pct: number) => Math.round((pct / 100) * opr);

      if (uhDurVal === 0 && uhVal > 0) uhDurVal = calcDur(uhVal);
      if (komDurVal === 0 && komVal > 0) komDurVal = calcDur(komVal);
      if (upDurVal === 0 && upVal > 0) upDurVal = calcDur(upVal);
      if (hwDurVal === 0 && hwVal > 0) hwDurVal = calcDur(hwVal);
      if (llDurVal === 0 && llVal > 0) llDurVal = calcDur(llVal);

      if (upVal > 0) {
        hwDetailObj['P10'] = upVal;
        hwSubObj['P10'] = { frx: upFrxVal, dur: upDurVal, pct: upVal };
      }
      if (komVal > 0 && !hwDetailObj['P05']) {
        hwDetailObj['P05'] = komVal;
        hwSubObj['P05'] = { frx: komFrxVal, dur: komDurVal, pct: komVal };
      }
      if (uhVal > 0 && !hwDetailObj['P07']) {
        hwDetailObj['P07'] = uhVal;
        hwSubObj['P07'] = { frx: uhFrxVal, dur: uhDurVal, pct: uhVal };
      }
      if (llVal > 0 && !hwDetailObj['P08']) {
        hwDetailObj['P08'] = llVal;
        hwSubObj['P08'] = { frx: llFrxVal, dur: llDurVal, pct: llVal };
      }

      // Pastikan seluruh subkategori P01 - P10 memiliki durasi jika pct > 0
      for (let p = 1; p <= 10; p++) {
        const pKey = `P${p < 10 ? '0' + p : p}`;
        const pPct = hwDetailObj[pKey] || 0;
        if (pPct > 0) {
          if (!hwSubObj[pKey] || hwSubObj[pKey].dur === 0) {
            const subDur = calcDur(pPct);
            hwSubObj[pKey] = {
              pct: pPct,
              dur: hwSubObj[pKey]?.dur || subDur,
              frx: hwSubObj[pKey]?.frx || 0
            };
          }
        }
      }

      const monthlyData: MonthlyProblemData = {
        periode: fileNormPeriode,
        uh: uhVal,
        uhFrx: uhFrxVal,
        uhDur: uhDurVal,
        kom: komVal,
        komFrx: komFrxVal,
        komDur: komDurVal,
        up: upVal,
        upFrx: upFrxVal,
        upDur: upDurVal,
        hw: hwVal,
        hwFrx: hwFrxVal,
        hwDur: hwDurVal,
        ll: llVal,
        llFrx: llFrxVal,
        llDur: llDurVal,
        total: totalVal,
        frxTotal: totalFrxVal,
        durTotal: totalDurVal,
        hwDetail: hwDetailObj,
        hwSubCategories: hwSubObj
      };

      const vendorVal = String(row.VDR || '').trim();

      if (!machineMap.has(wsid)) {
        // Machine from Uptime (not in Master Data -> Non BCA)
        const rawRowSek = (row.SEKTOR && String(row.SEKTOR).trim() !== '' && String(row.SEKTOR).trim() !== '#N/A')
          ? String(row.SEKTOR).trim()
          : '';
        let rowSektor = rawRowSek || (isBCA ? 'Unknown' : 'Non BCA');
        if (rawRowSek) {
          const cleanedRowSek = cleanSektorName(rawRowSek);
          if (cleanedRowSek === '-') {
            rowSektor = isBCA ? 'Unknown' : 'Non BCA';
          }
        }

        machineMap.set(wsid, {
          wsid,
          jenisMesin: jenis,
          klienStatus,
          sektorBCA: rowSektor,
          wilayahOperasional,
          lokasi: row.LOKASI || 'Unknown Lokasi',
          vendor: vendorVal || '-',
          tipeMesin: row['Tipe Mesin'] || jenis,
          statusAktif: 'AKTIF', // Forcing AKTIF for Non BCA / machines from Uptime
          hari: row.HARI,
          jam: row.JAM,
          opr: row.OPR,
          monthlyData: [monthlyData]
        });
      } else {
        // Append monthly data to existing machine
        const existing = machineMap.get(wsid)!;
        if (row.DESCKCU) existing.wilayahOperasional = row.DESCKCU;
        if (row.LOKASI && (!existing.lokasi || existing.lokasi === 'Unknown Lokasi')) {
          existing.lokasi = row.LOKASI;
        }
        if (vendorVal && (!existing.vendor || existing.vendor === '-')) {
          existing.vendor = vendorVal;
        }
        if (row.HARI) existing.hari = row.HARI;
        if (row.JAM) existing.jam = row.JAM;
        if (row.OPR) existing.opr = row.OPR;

        const existIdx = existing.monthlyData.findIndex(d => normalizePeriode(d.periode) === fileNormPeriode);
        if (existIdx >= 0) {
          existing.monthlyData[existIdx] = monthlyData;
        } else {
          existing.monthlyData.push(monthlyData);
        }
      }
    };

    file.atmData.forEach(row => processRow(row, 'ATM'));
    file.atsData.forEach(row => processRow(row, 'CRM'));
  }

  // Sort monthlyData internally by period
  const allMachines = Array.from(machineMap.values());
  const machines = allMachines.filter(m => {
    const w = m.wilayahOperasional.trim().toUpperCase();
    const isAbacus = w === 'ABACUS JAKARTA' || w === 'ACJK';
    const isNonBca = m.klienStatus === 'Non BCA';
    return (isAbacus || isNonBca) && m.statusAktif.trim().toUpperCase() === 'AKTIF';
  });

  machines.forEach(m => {
    m.monthlyData.sort((a, b) => a.periode.localeCompare(b.periode));
  });

  return machines;
};
