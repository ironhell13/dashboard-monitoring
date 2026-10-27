import { useMemo } from 'react';
import { useDataStore, type MachineData } from '../store/useDataStore';
import { normalizePeriode } from '../utils/comprehensiveExporter';
import { cleanSektorName } from '../utils/dailyIncidentParser';

export function useFilteredData() {
  const {
    machines,
    selectedPeriode,
    selectedPeriodeStart,
    selectedPeriodeEnd,
    selectedKlien,
    selectedJenisMesin,
    sektorMode,
    selectedSektorWilayah
  } = useDataStore();

  return useMemo(() => {
    let filtered = machines;

    // 1. Filter Klien
    if (selectedKlien !== 'ALL') {
      filtered = filtered.filter(m => m.klienStatus === selectedKlien);
    }

    // 2. Filter Jenis Mesin
    if (selectedJenisMesin !== 'ALL') {
      filtered = filtered.filter(m => m.jenisMesin === selectedJenisMesin);
    }

    // 3. Filter Sektor / Wilayah
    if (selectedSektorWilayah.length > 0) {
      filtered = filtered.filter(m => {
        const val = sektorMode === 'SEKTOR_BCA' ? cleanSektorName(m.sektorBCA) : (m.wilayahOperasional || '').trim();
        return val && val !== '-' && selectedSektorWilayah.some(s => (sektorMode === 'SEKTOR_BCA' ? cleanSektorName(s) : s.trim()) === val);
      });
    }

    // 4. Transform Monthly Data based on Periode Range (Dari & Sampai)
    return filtered.map(machine => {
      let activeMonths = machine.monthlyData;
      if (selectedPeriodeStart !== 'ALL' || selectedPeriodeEnd !== 'ALL') {
        const startNorm = selectedPeriodeStart !== 'ALL' ? normalizePeriode(selectedPeriodeStart) : '';
        const endNorm = selectedPeriodeEnd !== 'ALL' ? normalizePeriode(selectedPeriodeEnd) : '';
        activeMonths = machine.monthlyData.filter(d => {
          const p = normalizePeriode(d.periode);
          if (startNorm && p < startNorm) return false;
          if (endNorm && p > endNorm) return false;
          return true;
        });
      } else if (selectedPeriode !== 'ALL') {
        const normSelected = normalizePeriode(selectedPeriode);
        activeMonths = machine.monthlyData.filter(d => normalizePeriode(d.periode) === normSelected);
      }

      // Aggregate if multiple months
      if (activeMonths.length === 0) {
        return {
          ...machine,
          aggregatedData: {
            periode: selectedPeriode,
            uh: 0, uhFrx: 0, uhDur: 0,
            kom: 0, komFrx: 0, komDur: 0,
            up: 0, upFrx: 0, upDur: 0,
            hw: 0, hwFrx: 0, hwDur: 0,
            ll: 0, llFrx: 0, llDur: 0,
            total: 0, frxTotal: 0, durTotal: 0,
            hwDetail: { P01: 0, P02: 0, P03: 0, P04: 0, P05: 0, P06: 0, P07: 0, P08: 0, P09: 0, P10: 0 },
            hwSubCategories: {}
          }
        };
      }

      const count = activeMonths.length;
      const aggregatedData = activeMonths.reduce((acc, curr) => {
        const newHwDetail: Record<string, number> = {};
        const newHwSub: Record<string, { frx: number; dur: number; pct: number }> = { ...(acc.hwSubCategories || {}) };

        for (let p = 1; p <= 10; p++) {
          const pKey = `P${p < 10 ? '0' + p : p}`;
          newHwDetail[pKey] = (acc.hwDetail?.[pKey] || 0) + (curr.hwDetail?.[pKey] || 0);

          const currSub = curr.hwSubCategories?.[pKey];
          if (currSub || newHwSub[pKey]) {
            newHwSub[pKey] = {
              frx: (newHwSub[pKey]?.frx || 0) + (currSub?.frx || 0),
              dur: (newHwSub[pKey]?.dur || 0) + (currSub?.dur || 0),
              pct: (newHwSub[pKey]?.pct || 0) + (currSub?.pct || 0)
            };
          }
        }

        return {
          periode: selectedPeriode === 'ALL' ? 'ALL' : curr.periode,
          uh: acc.uh + curr.uh,
          uhFrx: acc.uhFrx + curr.uhFrx,
          uhDur: acc.uhDur + curr.uhDur,
          kom: acc.kom + curr.kom,
          komFrx: acc.komFrx + curr.komFrx,
          komDur: acc.komDur + curr.komDur,
          up: acc.up + curr.up,
          upFrx: acc.upFrx + curr.upFrx,
          upDur: acc.upDur + curr.upDur,
          hw: acc.hw + curr.hw,
          hwFrx: acc.hwFrx + curr.hwFrx,
          hwDur: acc.hwDur + curr.hwDur,
          ll: acc.ll + curr.ll,
          llFrx: acc.llFrx + curr.llFrx,
          llDur: acc.llDur + curr.llDur,
          total: acc.total + curr.total,
          frxTotal: acc.frxTotal + curr.frxTotal,
          durTotal: acc.durTotal + curr.durTotal,
          hwDetail: newHwDetail,
          hwSubCategories: newHwSub
        };
      }, {
        periode: '', 
        uh: 0, uhFrx: 0, uhDur: 0,
        kom: 0, komFrx: 0, komDur: 0,
        up: 0, upFrx: 0, upDur: 0,
        hw: 0, hwFrx: 0, hwDur: 0,
        ll: 0, llFrx: 0, llDur: 0,
        total: 0, frxTotal: 0, durTotal: 0,
        hwDetail: {},
        hwSubCategories: {}
      } as any);

      // Average the percentages
      if (count > 0) {
        aggregatedData.uh /= count;
        aggregatedData.kom /= count;
        aggregatedData.up /= count;
        aggregatedData.hw /= count;
        aggregatedData.ll /= count;
        aggregatedData.total /= count;
        Object.keys(aggregatedData.hwDetail).forEach(k => {
          aggregatedData.hwDetail[k] /= count;
        });
        Object.keys(aggregatedData.hwSubCategories || {}).forEach(k => {
          aggregatedData.hwSubCategories[k].pct /= count;
        });
      }

      return {
        ...machine,
        aggregatedData
      };
    }).filter(Boolean) as (MachineData & { aggregatedData: any })[];
  }, [machines, selectedPeriode, selectedPeriodeStart, selectedPeriodeEnd, selectedKlien, selectedJenisMesin, sektorMode, selectedSektorWilayah]);
}
