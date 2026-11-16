/**
 * Zero-asset procedural WebAudio cues. Every call is a safe no-op when audio is unavailable or suspended.
 */
export interface SpatialAudioCues {
  playWoodFrameClick: (positionM?: [number, number, number]) => void;
  playCompliancePassChord: () => void;
  playViolationPulse: (positionM?: [number, number, number]) => void;
}

export function createSpatialAudioCues(): SpatialAudioCues {
  let ctx: AudioContext | null = null;

  const getCtx = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const ready = (): AudioContext | null => {
    const c = getCtx();
    if (!c) return null;
    if (c.state === "suspended") {
      try {
        void c.resume();
      } catch {
        /* ignored */
      }
      return null;
    }
    return c;
  };

  const panner = (c: AudioContext, pos?: [number, number, number]): AudioNode => {
    if (!pos || typeof c.createPanner !== "function") return c.destination;
    const p = c.createPanner();
    p.panningModel = "HRTF";
    p.positionX.value = pos[0];
    p.positionY.value = pos[1];
    p.positionZ.value = pos[2];
    p.connect(c.destination);
    return p;
  };

  const tone = (
    c: AudioContext,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    out: AudioNode
  ): void => {
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  return {
    playWoodFrameClick(pos) {
      const c = ready();
      if (c) tone(c, "sine", 180, 95, 0.09, 0.35, panner(c, pos));
    },
    playCompliancePassChord() {
      const c = ready();
      if (!c) return;
      for (const f of [523.25, 659.25, 783.99]) tone(c, "triangle", f, f, 0.26, 0.12, c.destination);
    },
    playViolationPulse(pos) {
      const c = ready();
      if (c) tone(c, "sine", 220, 220, 0.22, 0.22, panner(c, pos));
    },
  };
}
