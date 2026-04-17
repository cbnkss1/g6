/** 짧은 알림음 (브라우저 자동재생 정책으로 첫 클릭 전에는 무시될 수 있음). */
let _lastBeepAt = 0;

export function playCashRequestBeep(): void {
  const now = Date.now();
  if (now - _lastBeepAt < 1800) return;
  _lastBeepAt = now;
  try {
    const ACtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ACtx) return;
    const ctx = new ACtx();
    void ctx.resume().then(() => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.2);
      setTimeout(() => void ctx.close().catch(() => {}), 400);
    });
  } catch {
    /* ignore */
  }
}
