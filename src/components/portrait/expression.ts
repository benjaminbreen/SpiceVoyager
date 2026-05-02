import type { Personality } from '../../utils/portraitConfig';

export interface ExprCtrl {
  setMouthCurve: (v: number) => void;
  setMouthAsym: (v: number) => void;
  setBrowL: (i: number, o: number) => void;
  setBrowR: (i: number, o: number) => void;
}

export function applyPersonality(p: Personality, rng: () => number, c: ExprCtrl) {
  switch (p) {
    case 'Friendly':   c.setMouthCurve(-2.5 - rng() * 2); c.setBrowL(-1, 1); c.setBrowR(-1, 1); break;
    case 'Stern':      c.setMouthCurve(1.5 + rng()); c.setBrowL(3, -2); c.setBrowR(3, -2); break;
    case 'Curious':    c.setMouthCurve(-0.5); c.setBrowL(-3, -1); c.setBrowR(0, 0); break;
    case 'Smug':       c.setMouthCurve(-1); c.setMouthAsym(2); c.setBrowL(-1, -1); c.setBrowR(-1, -1); break;
    case 'Melancholy': c.setMouthCurve(2); c.setBrowL(-2, 2); c.setBrowR(-2, 2); break;
    case 'Weathered':  c.setMouthCurve(0.5); c.setBrowL(1, 0); c.setBrowR(1, 0); break;
    case 'Fierce':     c.setMouthCurve(1); c.setMouthAsym(rng() * 1.5); c.setBrowL(4, -3); c.setBrowR(4, -3); break;
    case 'Rage':       c.setMouthCurve(0.2); c.setMouthAsym((rng() - 0.5) * 1.2); c.setBrowL(7, -5); c.setBrowR(7, -5); break;
    default: break;
  }
}
