import * as XLSX from 'xlsx';

export interface MasterRow {
  WSID: string;
  Klien: string;
  'Jenis Mesin': string;
  'Tipe Mesin': string;
  Status: string;
  Sektor: string;
  Wilayah: string;
  'Nama Lokasi': string;
  Hari?: string;
  Jam?: string | number;
  [key: string]: any;
}

export interface UptimeRow {
  WSID: string;
  DESCKCU: string; // Used for Wilayah Operasional
  KWW: string;
  LOKASI: string;
  VDR: string;
  // Dynamic categories will be mapped directly here:
  // e.g. UH_frx, UH_dur, UH_pct
  [key: string]: any;
}

export interface ParsedUptimeFile {
  periode: string; // e.g. "2026-08"
  atmData: UptimeRow[];
  atsData: UptimeRow[];
  rekapUptimeATM: number;
  rekapUptimeCRM: number;
}

const monthMap2: Record<string, string> = {
  januari: '01', january: '01', jan: '01',
  februari: '02', february: '02', feb: '02',
  maret: '03', march: '03', mar: '03',
  april: '04', apr: '04',
  mei: '05', may: '05',
  juni: '06', june: '06', jun: '06',
  juli: '07', july: '07', jul: '07',
  agustus: '08', august: '08', agt: '08', agu: '08', aug: '08',
  september: '09', sep: '09',
  oktober: '10', october: '10', okt: '10', oct: '10',
  november: '11', nopember: '11', nov: '11', nop: '11',
  desember: '12', december: '12', des: '12', dec: '12'
};

export const extractPeriodeFromFilename = (filename: string): string | null => {
  const lower = filename.toLowerCase();

  // 1. Match YYYY-MM or YYYY_MM (e.g. 2026-04, 2026_04)
  const y4m = lower.match(/(?:^|[^0-9])(20\d{2})[-_](0[1-9]|1[0-2])(?:[^0-9]|$)/);
  if (y4m) return `${y4m[1]}-${y4m[2]}`;

  // 2. Match MM-YYYY or MM_YYYY (e.g. 04-2026)
  const my4 = lower.match(/(?:^|[^0-9])(0[1-9]|1[0-2])[-_](20\d{2})(?:[^0-9]|$)/);
  if (my4) return `${my4[2]}-${my4[1]}`;

  // 3. Match YYYYMM (e.g. 202604)
  const y4mCompact = lower.match(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(?:[^0-9]|$)/);
  if (y4mCompact) return `${y4mCompact[1]}-${y4mCompact[2]}`;

  // 4. Match UT <Month>'<Year> or UT <Month> <Year> (e.g. UT Apr'26, UT April 2026, UT Apr 26)
  const utMatch = lower.match(/ut[\s_-]*([a-z]+)[\s'_]*(\d{2,4})/);
  if (utMatch) {
    const mStr = utMatch[1];
    let yStr = utMatch[2];
    if (yStr.length === 2) yStr = `20${yStr}`;
    let mNum = null;
    for (const [k, v] of Object.entries(monthMap2)) {
      if (mStr.startsWith(k)) { mNum = v; break; }
    }
    if (mNum) return `${yStr}-${mNum}`;
  }

  // 5. General fallback: look for ANY month name and ANY 4-digit or 2-digit year (like 2026 or 26)
  let foundMonth: string | null = null;
  let foundYear: string | null = null;

  for (const [key, val] of Object.entries(monthMap2)) {
    const r = new RegExp(`(?:^|[^a-z])(${key})(?:[^a-z]|$)`, 'i');
    if (lower.match(r)) {
      foundMonth = val;
      break;
    }
  }
  
  const y4Match = lower.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/);
  if (y4Match) {
    foundYear = y4Match[1];
  } else {
    // Look for 2 digit year (20-99)
    const y2Match = lower.match(/(?:^|[^0-9])([2-9]\d)(?:[^0-9]|$)/);
    if (y2Match) {
      foundYear = '20' + y2Match[1];
    }
  }

  if (foundMonth && foundYear) {
    return `${foundYear}-${foundMonth}`;
  }

  return null;
};

const extractPeriodeFromWorkbook = (workbook: XLSX.WorkBook): string | null => {
  const sheetName = workbook.SheetNames.find(n => {
    const u = n.toUpperCase();
    return u === 'ATM' || u === 'CRM' || u === 'ATS' || u.includes('REKAP');
  }) || workbook.SheetNames[0];
  if (!sheetName) return null;
  
  const rawData = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
  
  // scan first 20 rows
  for (let i = 0; i < Math.min(20, rawData.length); i++) {
    const rowStr = (rawData[i] || []).join(' ').toLowerCase();
    
    // Check YYYY-MM
    const y4m = rowStr.match(/(?:^|[^0-9])(20\d{2})[-_](0[1-9]|1[0-2])(?:[^0-9]|$)/);
    if (y4m) return `${y4m[1]}-${y4m[2]}`;

    let foundMonth: string | null = null;
    let foundYear: string | null = null;
    
    for (const [key, val] of Object.entries(monthMap2)) {
      const r = new RegExp(`(?:^|[^a-z])(${key})(?:[^a-z]|$)`, 'i');
      if (rowStr.match(r)) {
        foundMonth = val;
        break;
      }
    }
    
    const y4Match = rowStr.match(/(20\d{2})/);
    if (y4Match) foundYear = y4Match[1];
    
    if (foundMonth && foundYear) {
      return `${foundYear}-${foundMonth}`;
    }
  }
  return null;
};

export const parseMasterData = async (file: File): Promise<MasterRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // 1. Try finding by known names first
        let sheetName = workbook.SheetNames.find(n => {
          const upper = n.toUpperCase();
          return upper.includes('DATA ATM') || upper.includes('MASTER') || upper.includes('MESIN');
        });

        // 2. If not found by name, inspect each sheet to see if it has 'WSID' column
        if (!sheetName) {
          for (const sName of workbook.SheetNames) {
            const ws = workbook.Sheets[sName];
            const sample = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
            for (let r = 0; r < Math.min(10, sample.length); r++) {
              if (Array.isArray(sample[r]) && sample[r].some((c: any) => String(c).trim().toUpperCase() === 'WSID')) {
                sheetName = sName;
                break;
              }
            }
            if (sheetName) break;
          }
        }

        // 3. Fallback to first sheet
        if (!sheetName && workbook.SheetNames.length > 0) {
          sheetName = workbook.SheetNames[0];
        }

        if (!sheetName) {
          throw new Error('File Master Data tidak memiliki sheet yang dapat dibaca.');
        }

        const worksheet = workbook.Sheets[sheetName];
        const rawGrid = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
        
        let headerRowIndex = 0;
        for (let r = 0; r < Math.min(15, rawGrid.length); r++) {
          if (Array.isArray(rawGrid[r]) && rawGrid[r].some((c: any) => String(c).trim().toUpperCase() === 'WSID')) {
            headerRowIndex = r;
            break;
          }
        }

        const jsonData = XLSX.utils.sheet_to_json<MasterRow>(worksheet, { range: headerRowIndex, defval: '' });
        
        // Filter rows that actually have a WSID and normalize keys
        const validData: MasterRow[] = [];
        for (const row of jsonData) {
          const cleanRow: any = {};
          let wsid = '';
          for (const [k, v] of Object.entries(row)) {
            const trimmedKey = k.trim();
            cleanRow[trimmedKey] = v;
            if (trimmedKey.toUpperCase() === 'WSID') {
              wsid = String(v).trim();
            }
          }
          if (wsid) {
            cleanRow.WSID = wsid;
            validData.push(cleanRow as MasterRow);
          }
        }

        if (validData.length === 0) {
          throw new Error('Kolom "WSID" tidak ditemukan atau tidak ada data mesin di file Master Data.');
        }

        resolve(validData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

const parseUptimeSheet = (worksheet: XLSX.WorkSheet): UptimeRow[] => {
  const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
  if (rawData.length < 5) return [];

  // Dinamis mencari baris header yang mengandung WSID
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(25, rawData.length); r++) {
    if (Array.isArray(rawData[r]) && rawData[r].some(c => String(c).trim().toUpperCase() === 'WSID')) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = rawData.length >= 6 ? 5 : 0;
  }

  const columnsRow = rawData[headerRowIndex] || [];
  const categoriesRow = headerRowIndex > 0 ? (rawData[headerRowIndex - 1] || []) : [];

  // Identify categories and their column ranges
  const categoryMap: { colIndex: number; category: string }[] = [];
  let currentCategory = '';
  
  for (let c = 0; c < categoriesRow.length; c++) {
    const cellVal = String(categoriesRow[c]).trim();
    if (cellVal && cellVal !== '') {
      currentCategory = cellVal;
      // We found a category, it should span 3 columns: frx, dur, %
      categoryMap.push({ colIndex: c, category: currentCategory });
      categoryMap.push({ colIndex: c + 1, category: currentCategory });
      categoryMap.push({ colIndex: c + 2, category: currentCategory });
    }
  }

  // Refine mapping by looking at columnsRow
  const columnMapping: Record<number, string> = {};

  for (let c = 0; c < columnsRow.length; c++) {
    const colName = String(columnsRow[c]).trim();
    if (!colName) continue;

    // Fixed columns
    if (['No.', 'WSID', 'VDR', 'LOK', 'LOKASI', 'Klien', 'Tipe Mesin', 'STATUS', 'SEKTOR', 'KWW', 'DESCKCU', 'DESCKCP', 'M', 'HARI', 'JAM', 'OPR'].includes(colName)) {
      columnMapping[c] = colName;
    } else if (colName === 'FRX' || colName === 'DUR' || colName === '%') {
      const mappedCat = categoryMap.find(m => m.colIndex === c);
      let catName = mappedCat ? mappedCat.category : 'Unknown';
      
      if (!mappedCat) {
        for (let i = c - 1; i >= 0; i--) {
          const prev = categoryMap.find(m => m.colIndex === i);
          if (prev) {
            catName = prev.category;
            categoryMap.push({ colIndex: c, category: catName });
            break;
          }
        }
      }

      const suffix = colName === '%' ? 'pct' : colName.toLowerCase();
      columnMapping[c] = `${catName}_${suffix}`;
    } else {
      columnMapping[c] = colName;
    }
  }

  // Parse data rows starting after headerRowIndex
  const parsedRows: UptimeRow[] = [];
  const wsidColIdx = Object.keys(columnMapping).find(k => columnMapping[Number(k)] === 'WSID');

  for (let r = headerRowIndex + 1; r < rawData.length; r++) {
    const rowData = rawData[r];
    if (!rowData) continue;
    const wsidVal = wsidColIdx !== undefined ? rowData[Number(wsidColIdx)] : null;
    
    if (!wsidVal || String(wsidVal).trim() === '') continue; // Skip empty WSID

    const rowObj: any = {};
    for (const [colIdx, colName] of Object.entries(columnMapping)) {
      let val = rowData[Number(colIdx)];
      // treat empty or #N/A as 0 for numeric columns
      if (colName.includes('_pct') || colName.includes('_dur') || colName.includes('_frx')) {
        if (val === '#N/A' || val === '' || val == null) val = 0;
        val = Number(val) || 0;
      }
      rowObj[colName] = val;
    }
    parsedRows.push(rowObj as UptimeRow);
  }

  return parsedRows;
};

const parseRekapSheet = (worksheet: XLSX.WorkSheet) => {
  const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
  let atmUptime = 0;
  let atsUptime = 0;

  let atmDescIdx = -1, atmTtlIdx = -1;
  let atsDescIdx = -1, atsTtlIdx = -1;
  let headerRowIdx = -1;

  for (let r = 0; r < Math.min(25, rawData.length); r++) {
    const row = rawData[r];
    if (Array.isArray(row) && row.some(c => String(c).trim().toUpperCase() === 'DESCKCU')) {
      headerRowIdx = r;
      atmDescIdx = row.findIndex(c => String(c).trim().toUpperCase() === 'DESCKCU');
      atmTtlIdx = row.findIndex((c, idx) => idx > atmDescIdx && String(c).trim().toUpperCase() === 'TTL');
      
      const secondDescIdx = row.findIndex((c, idx) => idx > atmDescIdx && String(c).trim().toUpperCase() === 'DESCKCU');
      if (secondDescIdx !== -1) {
        atsDescIdx = secondDescIdx;
        atsTtlIdx = row.findIndex((c, idx) => idx > atsDescIdx && String(c).trim().toUpperCase() === 'TTL');
      }
      break;
    }
  }

  if (headerRowIdx !== -1) {
    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row) continue;
      const atmDesc = atmDescIdx !== -1 ? String(row[atmDescIdx] || '').trim().toUpperCase() : '';
      const atsDesc = atsDescIdx !== -1 ? String(row[atsDescIdx] || '').trim().toUpperCase() : '';

      if (atmDesc === 'ABACUS JAKARTA' && atmTtlIdx !== -1) {
        atmUptime = Number(row[atmTtlIdx]) || 0;
      }
      if (atsDesc === 'ABACUS JAKARTA' && atsTtlIdx !== -1) {
        atsUptime = Number(row[atsTtlIdx]) || 0;
      }
    }
  }

  return { atmUptime, atsUptime };
};

export const parseUptimeFile = async (file: File): Promise<ParsedUptimeFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        let atmData: UptimeRow[] = [];
        let atsData: UptimeRow[] = [];
        let rekapUptimeATM = 0;
        let rekapUptimeCRM = 0;

        const atmSheet = workbook.SheetNames.find(n => {
          const u = n.trim().toUpperCase();
          return u === 'ATM' || u.startsWith('ATM');
        });
        const atsSheet = workbook.SheetNames.find(n => {
          const u = n.trim().toUpperCase();
          return u === 'ATS' || u === 'CRM' || u.includes('ATS') || u.includes('CRM');
        });
        const rekapSheet = workbook.SheetNames.find(n => n.trim().toUpperCase().includes('REKAP'));

        if (atmSheet) {
          atmData = parseUptimeSheet(workbook.Sheets[atmSheet]);
        }
        if (atsSheet) {
          atsData = parseUptimeSheet(workbook.Sheets[atsSheet]);
        }
        if (rekapSheet) {
          const rekapData = parseRekapSheet(workbook.Sheets[rekapSheet]);
          rekapUptimeATM = rekapData.atmUptime;
          rekapUptimeCRM = rekapData.atsUptime;
        }

        // Hitung fallback uptime jika Rekap sheet kosong
        if (rekapUptimeATM === 0 && atmData.length > 0) {
          const abacusAtm = atmData.filter(r => String(r.DESCKCU || r.KWW || '').trim().toUpperCase() === 'ABACUS JAKARTA');
          const targetAtm = abacusAtm.length > 0 ? abacusAtm : atmData;
          const sum = targetAtm.reduce((acc, r) => acc + (Number(r.Total_pct || r.UP_pct) || 0), 0);
          rekapUptimeATM = +(sum / targetAtm.length).toFixed(2);
        }
        if (rekapUptimeCRM === 0 && atsData.length > 0) {
          const abacusAts = atsData.filter(r => String(r.DESCKCU || r.KWW || '').trim().toUpperCase() === 'ABACUS JAKARTA');
          const targetAts = abacusAts.length > 0 ? abacusAts : atsData;
          const sum = targetAts.reduce((acc, r) => acc + (Number(r.Total_pct || r.UP_pct) || 0), 0);
          rekapUptimeCRM = +(sum / targetAts.length).toFixed(2);
        }

        let periode = extractPeriodeFromFilename(file.name);
        if (!periode) {
          periode = extractPeriodeFromWorkbook(workbook);
        }
        // Jika masih belum ketemu, fallback ke bulan saat ini daripada 'Unknown' yang menyebabkan error
        if (!periode) {
          periode = new Date().toISOString().slice(0, 7);
        }

        resolve({ periode, atmData, atsData, rekapUptimeATM, rekapUptimeCRM });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
