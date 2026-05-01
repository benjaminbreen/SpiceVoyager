import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

// Treat viewports up to this width as "narrow" — catches portrait phones and
// landscape phones (e.g. iPhone 14 Pro Max landscape ≈ 932px).
const NARROW_MAX = 900;

export type MobileInfo = {
  isMobile: boolean;
  isTouch: boolean;
  orientation: 'portrait' | 'landscape';
};

function readSnapshot(forceMobile: boolean): MobileInfo {
  if (typeof window === 'undefined') {
    return { isMobile: forceMobile, isTouch: false, orientation: 'landscape' };
  }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth <= NARROW_MAX;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  return {
    isMobile: forceMobile || narrow || coarse,
    isTouch: coarse,
    orientation: portrait ? 'portrait' : 'landscape',
  };
}

// Returns live mobile state. Driven by matchMedia + resize; overridable via
// the `forceMobileLayout` store flag for desktop preview.
export function useIsMobile(): MobileInfo {
  const forceMobile = useGameStore(s => s.forceMobileLayout);
  const [info, setInfo] = useState<MobileInfo>(() => readSnapshot(forceMobile));

  useEffect(() => {
    const update = () => setInfo(readSnapshot(forceMobile));
    update();

    const pointerMq = window.matchMedia('(pointer: coarse)');
    const orientMq = window.matchMedia('(orientation: portrait)');
    pointerMq.addEventListener('change', update);
    orientMq.addEventListener('change', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      pointerMq.removeEventListener('change', update);
      orientMq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [forceMobile]);

  return info;
}
