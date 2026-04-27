type ProgressBarProps = {
  completed: number;
  total: number;
};

function getMotivationMessage(percentage: number): string {
  if (percentage >= 100) {
    return "You crushed it today! 🎉";
  }
  if (percentage >= 75) {
    return "Almost done!";
  }
  if (percentage >= 50) {
    return "Halfway there!";
  }
  if (percentage >= 25) {
    return "Good start!";
  }
  return "Let's go!";
}

export function ProgressBar({ completed, total }: ProgressBarProps) {
  const safeCompleted = Math.max(0, completed);
  const safeTotal = Math.max(0, total);
  const normalizedCompleted = Math.min(safeCompleted, safeTotal);
  const percentage =
    safeTotal === 0 ? 0 : Math.round((normalizedCompleted / safeTotal) * 100);
  const message = getMotivationMessage(percentage);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          {normalizedCompleted} of {safeTotal} tasks done
        </p>
        <p className="text-xs font-semibold text-muted-foreground">{percentage}%</p>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
          aria-hidden="true"
        />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </section>
  );
}
