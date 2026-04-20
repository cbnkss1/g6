"use client";

type Props = {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  className?: string;
  /** 기본: 기간 시작 / 기간 종료 */
  labelFrom?: string;
  labelTo?: string;
};

/**
 * KST 달력 기준 YYYY-MM-DD (`input type="date"`).
 * API에는 `date_from`, `date_to` 로 그대로 넘기면 됩니다.
 */
export function KstDateRangeFields({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  className,
  labelFrom = "기간 시작 (KST)",
  labelTo = "기간 종료 (KST)",
}: Props) {
  return (
    <div className={className ?? "flex flex-wrap items-end gap-3"}>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        {labelFrom}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        {labelTo}
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
        />
      </label>
    </div>
  );
}
