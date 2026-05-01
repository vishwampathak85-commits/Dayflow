"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type DailySummary = {
  id?: string;
  date: string;
  tasks_total: number;
  tasks_completed: number;
  completion_rate: number;
};

function getRatingClasses(rate: number): string {
  if (rate < 40) {
    return "bg-red-100 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30";
  }
  if (rate <= 70) {
    return "bg-yellow-100 text-yellow-700 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/30";
  }
  return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30";
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function HistoryPage() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSummaries() {
      if (!supabase) {
        setError(
          "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
        );
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("daily_summaries")
        .select("id, date, tasks_total, tasks_completed, completion_rate")
        .order("date", { ascending: false });

      if (fetchError) {
        setError("Failed to load daily summaries.");
        setIsLoading(false);
        return;
      }

      setSummaries((data as DailySummary[]) ?? []);
      setIsLoading(false);
    }

    void loadSummaries();
  }, []);

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              History
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Your day-by-day completion summaries.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            Back to Today
          </Link>
        </div>

        {!isSupabaseConfigured ? (
          <div className="mb-4 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Supabase is not configured yet. Add{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            to <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">.env.local</code> and restart
            <code className="ml-1 rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
              npm run dev
            </code>
            .
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            Loading summary history...
          </div>
        ) : summaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No daily summaries yet. Complete all your tasks for the day to save a summary.
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((summary) => (
              <article
                key={summary.id ?? summary.date}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold sm:text-base">
                    {formatDate(summary.date)}
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getRatingClasses(
                      summary.completion_rate,
                    )}`}
                  >
                    {summary.completion_rate}%
                  </span>
                </div>

                <p className="mb-3 text-sm text-muted-foreground">
                  {summary.tasks_completed} of {summary.tasks_total} tasks done
                </p>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.max(0, Math.min(100, summary.completion_rate))}%`,
                    }}
                  />
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
