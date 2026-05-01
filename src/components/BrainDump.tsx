"use client";

import { useState } from "react";

type TaskCategory = "work" | "personal" | "learning" | "admin";
type TaskPriority = "high" | "medium" | "low";

export type ScheduledTask = {
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  order_index: number;
};

type BrainDumpProps = {
  onScheduleGenerated: (tasks: ScheduledTask[]) => void;
};

function getTodayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function BrainDump({ onScheduleGenerated }: BrainDumpProps) {
  const [brainDump, setBrainDump] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!brainDump.trim()) {
      setError("Please add your tasks before generating a schedule.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brainDump: brainDump.trim(),
          date: getTodayDateInputValue(),
        }),
      });

      if (!response.ok) {
        let message = "Failed to generate schedule.";
        try {
          const errorBody = (await response.json()) as { error?: string };
          if (errorBody?.error) message = errorBody.error;
        } catch {
          // keep fallback message
        }
        throw new Error(message);
      }

      const tasks = (await response.json()) as ScheduledTask[];
      onScheduleGenerated(tasks);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to generate schedule.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      {/* Perplexity-style input box */}
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 dark:bg-[#1a1a1a]">
        <textarea
          id="brain-dump"
          value={brainDump}
          onChange={(e) => setBrainDump(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="What do you need to do today? Just brain dump it all here..."
          rows={5}
          className="w-full resize-none bg-transparent px-5 pt-5 pb-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          disabled={isLoading}
        />

        {/* Toolbar row */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {brainDump.trim() ? `${brainDump.trim().split(/\n+/).filter(Boolean).length} task${brainDump.trim().split(/\n+/).filter(Boolean).length === 1 ? "" : "s"} detected` : "One task per line, or just free-form"}
          </p>

          <button
            type="submit"
            disabled={isLoading || !brainDump.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                Generate My Schedule
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </form>
  );
}
