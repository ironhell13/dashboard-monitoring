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

  // 1. Try standard match first (UT Aug'26)
  const match = lower.match(/ut\s+([a-z]+)'(\d{2})/);
  if (match) {
    const monthStr = match[1];
    const yearStr = match[2];
    
    let monthNum = '01';
    for (const [key, val] of Object.entries(monthMap2)) {
      if (monthStr.startsWith(key)) {
        monthNum = val;
        break;
      }
    }
    return `20${yearStr}-${monthNum}`;
  }

  // 2. Fallback: look for ANY month name and ANY 4-digit or 2-digit year (like 2026 or 26)
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
  const sheetName = workbook.SheetNames.find(n => n.toUpperCase() === 'ATM' || n.toUpperCase() === 'CRM');
  if (!sheetName) return null;
  
  const rawData = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
  
  // scan first 15 rows
  for (let i = 0; i < Math.min(15, rawData.length); i++) {
    const rowStr = rawData[i].join(' ').toLowerCase();
    
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
        const sheetName = workbook.SheetNames.find(n => n.includes('DATA ATM - CRM') || n.includes('MASTER'));
        
        if (!sheetName) {
          throw new Error('Sheet "DATA ATM - CRM" tidak ditemukan di file Master.');
        }

        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<MasterRow>(worksheet, { defval: '' });
        
        // Filter rows that actually have a WSID
        const validData = jsonData.filter(row => row.WSID && String(row.WSID).trim() !== '');
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
  // Use sheet_to_json with header: 1 to get a 2D array of cells
  const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
  
  if (rawData.length < 7) return []; // Not enough rows to contain the structure

  const categoriesRow = rawData[4]; // Baris 5 (0-indexed 4)
  const columnsRow = rawData[5];    // Baris 6 (0-indexed 5)

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
    } else if (currentCategory && !categoryMap.find(m => m.colIndex === c)) {
       // if merged cells didn't fill the array, we force fill it based on assumption it's 3 cols
       // But usually xlsx header: 1 only outputs the first cell of a merge.
       // We'll rely on the columnsRow (FRX, DUR, %)
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
      // Find the corresponding category from categoryMap
      const mappedCat = categoryMap.find(m => m.colIndex === c);
      let catName = mappedCat ? mappedCat.category : 'Unknown';
      
      // If xlsx didn't give us the category in that exact column due to merge, we infer
      if (!mappedCat) {
          // Find the last known category before this column
          for (let i = c - 1; i >= 0; i--) {
              const prev = categoryMap.find(m => m.colIndex === i);
              if (prev) {
                  catName = prev.category;
                  // add it to our map so next cols find it too
                  categoryMap.push({colIndex: c, category: catName});
                  break;
              }
          }
      }

      // Convert '%' to 'pct' for safer object keys
      const suffix = colName === '%' ? 'pct' : colName.toLowerCase();
      columnMapping[c] = `${catName}_${suffix}`;
    } else {
        columnMapping[c] = colName; // fallback
    }
  }

  // Now parse the actual data rows (Baris 7 dst -> index 6 dst)
  const parsedRows: UptimeRow[] = [];
  for (let r = 6; r < rawData.length; r++) {
    const rowData = rawData[r];
    const wsidVal = rowData[Object.keys(columnMapping).find(k => columnMapping[Number(k)] === 'WSID') as any];
    
    if (!wsidVal || String(wsidVal).trim() === '') continue; // Skip empty WSID

    const rowObj: any = {};
    for (const [colIdx, colName] of Object.entries(columnMapping)) {
      let val = rowData[Number(colIdx)];
      // treat empty or #N/A as 0 for numeric columns
      if (colName.includes('_pct') || colName.includes('_dur') || colName.includes('_frx')) {
        if (val === '#N/A' || val === '' || val == null) val = 0;
        // ensure it's a number
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

  // Temukan header TTL dan DESCKCU
  // Kita cari baris yang punya 'DESCKCU' lebih dari 1 kali (baris 7/index 6)
  let atmDescIdx = -1, atmTtlIdx = -1;
  let atsDescIdx = -1, atsTtlIdx = -1;
  let headerRowIdx = -1;

  for (let r = 0; r < Math.min(20, rawData.length); r++) {
    const row = rawData[r];
    if (row.includes('DESCKCU')) {
      headerRowIdx = r;
      atmDescIdx = row.indexOf('DESCKCU');
      atmTtlIdx = row.indexOf('TTL', atmDescIdx);
      
      atsDescIdx = row.indexOf('DESCKCU', atmDescIdx + 1);
      if (atsDescIdx !== -1) {
        atsTtlIdx = row.indexOf('TTL', atsDescIdx);
      }
      break;
    }
  }

  if (headerRowIdx !== -1) {
    // Cari Abacus Jakarta
    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      const atmDesc = String(row[atmDescIdx]).trim().toUpperCase();
      const atsDesc = atsDescIdx !== -1 ? String(row[atsDescIdx]).trim().toUpperCase() : '';

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

        const atmSheet = workbook.SheetNames.find(n => n.toUpperCase() === 'ATM');
        const atsSheet = workbook.SheetNames.find(n => n.toUpperCase() === 'ATS' || n.toUpperCase() === 'CRM');
        const rekapSheet = workbook.SheetNames.find(n => n.toUpperCase() === 'REKAP');

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

        let periode = extractPeriodeFromFilename(file.name);
        if (!periode) {
          periode = extractPeriodeFromWorkbook(workbook) || 'Unknown';
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
