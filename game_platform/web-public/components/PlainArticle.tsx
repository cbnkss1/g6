"use client";

type Props = { title: string; body: string; fallback?: string };

export function PlainArticle({ title, body, fallback }: Props) {
  const text =
    body.trim() ||
    (fallback ??
      "관리자 화면의 「설정 → 사이트 운영 정책」에서 플레이어 안내 문구에 내용을 입력하면 여기에 표시됩니다.");
  return (
    <article className="glass-panel space-y-4 p-6 sm:p-8">
      <h1 className="font-display text-xl font-bold uppercase tracking-wider text-slate-100">{title}</h1>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{text}</div>
    </article>
  );
}
