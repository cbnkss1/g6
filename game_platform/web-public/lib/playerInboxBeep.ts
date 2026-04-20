/** 짧은 알림음 (자동재생 정책으로 첫 클릭 전 무시될 수 있음). */
let _lastMemo = 0;
let _lastSupport = 0;

export function playPlayerMemoBeep(): void {
  const now = Date.now();
  if (now - _lastMemo < 1800) return;
  _lastMemo = now;
  _beep(520, 720, "sine", 0.08);
}

export function playPlayerSupportReplyBeep(): void {
  const now = Date.now();
  if (now - _lastSupport < 1800) return;
  _lastSupport = now;
  _beep(620, 880, "triangle", 0.07);
}

function _beep(f0: number, f1: number, wave: OscillatorType, vol: number): void {
  try {
    const ACtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ACtx) return;
    const ctx = new ACtx();
    void ctx.resume().then(() => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(f0, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.22);
      setTimeout(() => void ctx.close().catch(() => {}), 400);
    });
  } catch {
    /* ignore */
  }
}
