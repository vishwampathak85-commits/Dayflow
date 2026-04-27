"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

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
  const [date, setDate] = useState(getTodayDateInputValue);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!brainDump.trim()) {
      setError("Please add your brain dump before generating a schedule.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brainDump: brainDump.trim(),
          date,
        }),
      });

      if (!response.ok) {
        let message = "Failed to generate schedule.";
        try {
          const errorBody = (await response.json()) as { error?: string };
          if (errorBody?.error) {
            message = errorBody.error;
          }
        } catch {
          // Ignore JSON parse errors and keep fallback message.
        }
        throw new Error(message);
      }

      const tasks = (await response.json()) as ScheduledTask[];
      onScheduleGenerated(tasks);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to generate schedule.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="brain-dump" className="text-sm font-medium">
          Brain dump
        </label>
        <textarea
          id="brain-dump"
          value={brainDump}
          onChange={(event) => setBrainDump(event.target.value)}
          placeholder="What do you need to do today? Just brain dump it all here..."
          className="min-h-56 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="schedule-date" className="text-sm font-medium">
          Date
        </label>
        <input
          id="schedule-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          disabled={isLoading}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" size="lg" disabled={isLoading}>
        {isLoading ? "Generating..." : "Generate My Schedule"}
      </Button>
    </form>
  );
}
