"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrainDump, type ScheduledTask } from "@/components/BrainDump";
import { Timetable, type TimetableTask } from "@/components/Timetable";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type TaskRecord = {
  id: string;
  title: string;
  category: TimetableTask["category"];
  priority: TimetableTask["priority"];
  start_time: string;
  end_time: string;
  duration_minutes: number;
  completed: boolean;
};

function getTodayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Home() {
  const today = useMemo(() => getTodayDateInputValue(), []);
  const [tasks, setTasks] = useState<TimetableTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationTimeoutRef = useRef<number | null>(null);

  const loadTodayTasks = useCallback(async () => {
    if (!supabase) {
      setLoadError(
        "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
      );
      setIsLoadingTasks(false);
      return;
    }

    setIsLoadingTasks(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id, title, category, priority, start_time, end_time, duration_minutes, completed",
      )
      .eq("date", today)
      .order("start_time", { ascending: true });

if (error) {
  // Ignore "no rows" — just show the brain dump form
  setIsLoadingTasks(false);
  return;
}
    setTasks((data as TaskRecord[]) ?? []);
    setIsLoadingTasks(false);
  }, [today]);

  useEffect(() => {
    void loadTodayTasks();
  }, [loadTodayTasks]);

  const allTasksCompleted =
    tasks.length > 0 && tasks.every((task) => task.completed);

  useEffect(() => {
    if (!allTasksCompleted) {
      if (celebrationTimeoutRef.current) {
        window.clearTimeout(celebrationTimeoutRef.current);
        celebrationTimeoutRef.current = null;
      }
      setShowCelebration(false);
      return;
    }

    setShowCelebration(true);
    void confetti({
      particleCount: 180,
      spread: 85,
      origin: { y: 0.6 },
    });

    celebrationTimeoutRef.current = window.setTimeout(() => {
      setShowCelebration(false);
    }, 4200);

    return () => {
      if (celebrationTimeoutRef.current) {
        window.clearTimeout(celebrationTimeoutRef.current);
      }
    };
  }, [allTasksCompleted]);

  const handleScheduleGenerated = useCallback(
    async (generatedTasks: ScheduledTask[]) => {
      if (!supabase) {
        setLoadError(
          "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
        );
        return;
      }

      const tasksForUi: TimetableTask[] = generatedTasks.map((task) => ({
        ...task,
        completed: false,
      }));
      setTasks(tasksForUi);

      const recordsToInsert = tasksForUi.map((task, index) => ({
        date: today,
        title: task.title,
        category: task.category,
        priority: task.priority,
        start_time: task.start_time,
        end_time: task.end_time,
        duration_minutes: task.duration_minutes,
        completed: task.completed,
        order_index: index,
      }));

      await supabase.from("tasks").delete().eq("date", today);
      const { data, error } = await supabase
        .from("tasks")
        .insert(recordsToInsert)
        .select(
          "id, title, category, priority, start_time, end_time, duration_minutes, completed",
        );

      if (error) {
        setLoadError("Schedule generated, but failed to save tasks.");
      } else {
        setLoadError(null);
        if (data) {
          setTasks(data as TaskRecord[]);
        }
      }
    },
    [today],
  );

  const handleToggleTaskCompleted = useCallback(
    async (taskToToggle: TimetableTask) => {
      if (!supabase) {
        setLoadError(
          "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
        );
        return;
      }

      if (!taskToToggle.id) {
        setLoadError("Task is missing UUID and cannot be updated.");
        return;
      }

      const nextCompleted = !taskToToggle.completed;

      setTasks((prevTasks) =>
        prevTasks.map((task) => {
          return task.id === taskToToggle.id
            ? { ...task, completed: nextCompleted }
            : task;
        }),
      );

      const { error } = await supabase
        .from("tasks")
        .update({ completed: nextCompleted })
        .eq("id", taskToToggle.id);

      if (error) {
        setLoadError("Task updated locally, but failed to save completion status.");
        setTasks((prevTasks) =>
          prevTasks.map((task) => {
            return task.id === taskToToggle.id
              ? { ...task, completed: taskToToggle.completed }
              : task;
          }),
        );
      } else {
        setLoadError(null);
      }
    },
    [],
  );

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      {showCelebration ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-[2px]">
          <div className="rounded-2xl border border-emerald-300/60 bg-white px-8 py-6 text-center shadow-xl dark:border-emerald-500/40 dark:bg-zinc-900">
            <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">
              All tasks complete!
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Incredible focus today. Keep the momentum going.
            </p>
          </div>
        </div>
      ) : null}

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              DayFlow
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Turn your brain dump into a realistic daily schedule.
            </p>
          </div>
          <Link
            href="/history"
            className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted"
          >
            View History
          </Link>
        </header>

        {!isSupabaseConfigured ? (
          <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Supabase is not configured. Add{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            and{" "}
            <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            to <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">.env.local</code>, then restart
            <code className="ml-1 rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">
              npm run dev
            </code>
            .
          </div>
        ) : null}

        {loadError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {isLoadingTasks ? (
          <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
            Loading today&apos;s tasks...
          </div>
        ) : tasks.length > 0 ? (
          <Timetable tasks={tasks} onToggleTaskCompleted={handleToggleTaskCompleted} />
        ) : (
          <BrainDump onScheduleGenerated={handleScheduleGenerated} />
        )}
      </main>
    </div>
  );
}
