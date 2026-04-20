/** 짧은 알림음 (브라우저 자동재생 정책으로 첫 클릭 전에는 무시될 수 있음). */
let _lastBeepAt = 0;
let _lastSupportAt = 0;

/** 1:1 문의 접수용 — 입금 알림과 다른 톤. */
export function playSupportTicketBeep(): void {
  const now = Date.now();
  if (now - _lastSupportAt < 1800) return;
  _lastSupportAt = now;
  try {
    const ACtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ACtx) return;
    const ctx = new ACtx();
    void ctx.resume().then(() => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.25);
      setTimeout(() => void ctx.close().catch(() => {}), 500);
    });
  } catch {
    /* ignore */
  }
}

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
