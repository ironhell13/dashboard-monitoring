import React, { useRef, useState, useEffect, useCallback } from 'react';

interface StickyTableWrapperProps {
  children: React.ReactNode;
  className?: string;
  tableWrapperClassName?: string;
}

/**
 * StickyTableWrapper
 * Membungkus tabel data yang lebar. Jika tabel memerlukan scroll horizontal
 * dan bagian bawah tabel berada di bawah layar (viewport monitor),
 * komponen ini menampilkan slide bar (horizontal scrollbar) yang selalu menempel (sticky/floating)
 * di bawah monitor, sehingga pengguna tidak perlu scroll vertikal ke bawah dulu untuk menggeser tabel ke kanan.
 */
export default function StickyTableWrapper({
  children,
  className = '',
  tableWrapperClassName = '',
}: StickyTableWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const floatingBarRef = useRef<HTMLDivElement>(null);

  const [scrollWidth, setScrollWidth] = useState(0);
  const [showFloating, setShowFloating] = useState(false);
  const [coords, setCoords] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const isSyncingRef = useRef(false);

  const checkVisibility = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const hasHorizontalOverflow = el.scrollWidth > el.clientWidth + 2;
    const vh = window.innerHeight;

    // Tabel berada di dalam viewport vertikal
    const isVisibleInView = rect.top < vh && rect.bottom > 60;
    // Bagian bawah tabel berada di bawah batas monitor
    const isBottomBelowFold = rect.bottom > vh + 5;

    if (hasHorizontalOverflow && isVisibleInView && isBottomBelowFold) {
      setShowFloating(true);
      setScrollWidth(el.scrollWidth);
      setCoords({
        left: Math.max(0, rect.left),
        width: Math.min(rect.width, window.innerWidth - Math.max(0, rect.left)),
      });

      // Sinkronisasi posisi scroll floating bar dengan kontainer tabel
      if (floatingBarRef.current && !isSyncingRef.current) {
        floatingBarRef.current.scrollLeft = el.scrollLeft;
      }
    } else {
      setShowFloating(false);
    }
  }, []);

  useEffect(() => {
    checkVisibility();

    const handleScroll = () => {
      checkVisibility();
    };

    const handleResize = () => {
      checkVisibility();
    };

    // Gunakan capture: true agar menangkap scroll event baik di window maupun container parent (seperti Layout)
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkVisibility();
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [checkVisibility]);

  useEffect(() => {
    if (showFloating && floatingBarRef.current && containerRef.current) {
      floatingBarRef.current.scrollLeft = containerRef.current.scrollLeft;
    }
  }, [showFloating]);

  // Handler saat user menggeser tabel asli
  const handleContainerScroll = () => {
    if (isSyncingRef.current) return;
    if (floatingBarRef.current && containerRef.current) {
      isSyncingRef.current = true;
      floatingBarRef.current.scrollLeft = containerRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
  };

  // Handler saat user menggeser scrollbar floating di bawah monitor
  const handleFloatingScroll = () => {
    if (isSyncingRef.current) return;
    if (floatingBarRef.current && containerRef.current) {
      isSyncingRef.current = true;
      containerRef.current.scrollLeft = floatingBarRef.current.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Container Tabel Asli */}
      <div
        ref={containerRef}
        onScroll={handleContainerScroll}
        className={`overflow-x-auto custom-scrollbar ${tableWrapperClassName}`}
      >
        {children}
      </div>

      {/* Floating Bottom Scrollbar yang menempel di bawah monitor */}
      {showFloating && (
        <div
          ref={floatingBarRef}
          onScroll={handleFloatingScroll}
          style={{
            position: 'fixed',
            bottom: 0,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 40,
          }}
          className="h-3 bg-slate-100/95 backdrop-blur-xs border-t border-slate-300 shadow-[0_-2px_6px_rgba(0,0,0,0.06)] overflow-x-auto overflow-y-hidden floating-scrollbar cursor-ew-resize"
          title="Geser scrollbar untuk melihat kolom tabel lainnya"
        >
          <div style={{ width: `${scrollWidth}px`, height: '1px' }} />
        </div>
      )}
    </div>
  );
}

