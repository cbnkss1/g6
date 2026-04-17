interface Props {
  title: string;
  description?: string;
  icon?: string;
}

export function ComingSoon({ title, description, icon = "⚙" }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-up">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-3xl text-3xl mb-6"
        style={{
          background: "rgba(212,175,55,0.08)",
          border: "1px solid rgba(212,175,55,0.2)",
          boxShadow: "0 0 32px rgba(212,175,55,0.1)",
        }}
      >
        {icon}
      </div>
      <p className="text-premium-label mb-2">준비 중</p>
      <h2
        className="text-2xl font-semibold text-slate-200 mb-3"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        {title}
      </h2>
      {description && (
        <p className="text-sm text-slate-600 text-center max-w-sm">{description}</p>
      )}
      <div className="mt-8 h-px w-24" style={{ background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.3), transparent)" }} />
    </div>
  );
}
