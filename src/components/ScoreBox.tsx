// reusable score/best box

type Props = {
  primary?: boolean;
  label: string;
  value: number | string;
};

export function ScoreBox({ primary, label, value }: Props) {
  return (
    <div
      class={`flex min-w-0 grow basis-0 items-center justify-between gap-2 rounded-xl px-4 py-2 text-sm font-bold text-tan
        sm:h-[52px] sm:flex-auto sm:flex-col sm:justify-center sm:gap-0 sm:py-0 sm:text-xl
        ${primary ? 'bg-sand' : 'border-2 border-sand'}`}
    >
      <span class='min-w-0 shrink-[500] grow basis-[20px] truncate text-xs font-medium uppercase sm:flex-initial'>
        {label}
      </span>
      <span class='shrink-1 truncate'>{value}</span>
    </div>
  );
}