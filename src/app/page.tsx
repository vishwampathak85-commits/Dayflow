"use client";

import confetti from "canvas-confetti";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrainDump, type ScheduledTask } from "@/components/BrainDump";
import { Timetable, type TimetableTask } from "@/components/Timetable";
import { supabase } from "@/lib/supabase";

// ── localStorage helpers (24-hour cache) ────────────────────────────────────
const LS_KEY = "dayflow_schedule";

function lsSave(date: string, tasks: TimetableTask[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ date, tasks, savedAt: Date.now() }));
  } catch {}
}

function lsLoad(date: string): TimetableTask[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date: string; tasks: TimetableTask[]; savedAt: number };
    const within24h = Date.now() - parsed.savedAt < 24 * 60 * 60 * 1000;
    return parsed.date === date && within24h ? parsed.tasks : null;
  } catch {
    return null;
  }
}

// ── Date / time helpers ──────────────────────────────────────────────────────
function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addMinutesToTime(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getCurrentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const today = useMemo(() => getTodayDate(), []);
  const [tasks, setTasks] = useState<TimetableTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskInput, setAddTaskInput] = useState("");
  const celebrationTimeoutRef = useRef<number | null>(null);

  // Load today's tasks: Supabase first, localStorage fallback
  const loadTodayTasks = useCallback(async () => {
    setIsLoadingTasks(true);

    if (supabase) {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, category, priority, start_time, end_time, duration_minutes, completed")
        .eq("date", today)
        .order("start_time", { ascending: true });

      if (!error && data && data.length > 0) {
        const loaded = data as TaskRecord[];
        setTasks(loaded);
        lsSave(today, loaded); // keep cache in sync
        setIsLoadingTasks(false);
        return;
      }
    }

    // Fall back to localStorage
    const cached = lsLoad(today);
    if (cached && cached.length > 0) setTasks(cached);
    setIsLoadingTasks(false);
  }, [today]);

  useEffect(() => { void loadTodayTasks(); }, [loadTodayTasks]);

  // Confetti when everything is done
  const allTasksCompleted = tasks.length > 0 && tasks.every((t) => t.completed);
  useEffect(() => {
    if (!allTasksCompleted) {
      if (celebrationTimeoutRef.current) window.clearTimeout(celebrationTimeoutRef.current);
      setShowCelebration(false);
      return;
    }

    if (supabase && tasks.length > 0) {
      const total = tasks.length;
      const completed = tasks.filter((t) => t.completed).length;
      void supabase.from("daily_summaries").upsert(
        { date: today, tasks_total: total, tasks_completed: completed, completion_rate: Math.round((completed / total) * 100) },
        { onConflict: "date" },
      );
    }

    setShowCelebration(true);
    void confetti({ particleCount: 180, spread: 85, origin: { y: 0.6 } });
    celebrationTimeoutRef.current = window.setTimeout(() => setShowCelebration(false), 4200);
    return () => { if (celebrationTimeoutRef.current) window.clearTimeout(celebrationTimeoutRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasksCompleted, today]); // intentionally omit `tasks` — fire only on the false→true transition, not on every reorder

  // Schedule generated: always show tasks immediately, save silently
  const handleScheduleGenerated = useCallback(
    async (generatedTasks: ScheduledTask[]) => {
      const tasksForUi: TimetableTask[] = generatedTasks.map((t) => ({ ...t, completed: false }));

      // Show immediately — no waiting on DB
      setTasks(tasksForUi);
      setShowBrainDump(false);
      lsSave(today, tasksForUi);

      // Try to persist to Supabase silently
      if (!supabase) return;
      await supabase.from("tasks").delete().eq("date", today);
      const { data } = await supabase
        .from("tasks")
        .insert(
          tasksForUi.map((task, i) => ({
            date: today,
            title: task.title,
            category: task.category,
            priority: task.priority,
            start_time: task.start_time,
            end_time: task.end_time,
            duration_minutes: task.duration_minutes,
            completed: task.completed,
            order_index: i,
          })),
        )
        .select("id, title, category, priority, start_time, end_time, duration_minutes, completed");

      // If DB gave us back IDs, use those (better for future updates)
      if (data && data.length > 0) {
        const withIds = data as TaskRecord[];
        setTasks(withIds);
        lsSave(today, withIds);
      }
    },
    [today],
  );

  const handleReorderTasks = useCallback(
    (reorderedTasks: TimetableTask[]) => {
      setTasks((prev: TimetableTask[]) => {
        // Use id ?? title as key so tasks without a UUID (localStorage-only) don't collide on undefined
        const completedById = new Map(prev.map((t: TimetableTask) => [t.id ?? t.title, t.completed]));
        const updated = reorderedTasks.map((t: TimetableTask) => ({
          ...t,
          completed: completedById.get(t.id ?? t.title) ?? t.completed,
        }));
        lsSave(today, updated);
        return updated;
      });

      if (!supabase) return;
      reorderedTasks.forEach((task, index) => {
        if (task.id) {
          void supabase!.from("tasks").update({ order_index: index }).eq("id", task.id);
        }
      });
    },
    [today],
  );

  const handleAddTask = useCallback(
    async (title: string) => {
      const latestEnd = tasks.reduce((latest: string, t: TimetableTask) => (t.end_time > latest ? t.end_time : latest), "");
      const startTime = latestEnd ? addMinutesToTime(latestEnd, 10) : getCurrentHHMM();
      const duration = 30;
      const newTask: TimetableTask = {
        title,
        category: "personal",
        priority: "medium",
        start_time: startTime,
        end_time: addMinutesToTime(startTime, duration),
        duration_minutes: duration,
        completed: false,
      };

      const updated = [...tasks, newTask];
      setTasks(updated);
      lsSave(today, updated);

      if (!supabase) return;
      const { data } = await supabase
        .from("tasks")
        .insert({
          date: today,
          title: newTask.title,
          category: newTask.category,
          priority: newTask.priority,
          start_time: newTask.start_time,
          end_time: newTask.end_time,
          duration_minutes: newTask.duration_minutes,
          completed: false,
          order_index: tasks.length,
        })
        .select("id, title, category, priority, start_time, end_time, duration_minutes, completed")
        .single();

      if (data) {
        setTasks((prev: TimetableTask[]) => {
          const idx = prev.findIndex((t: TimetableTask) => t.title === title && !t.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], id: (data as TaskRecord).id };
          lsSave(today, next);
          return next;
        });
      }
    },
    [tasks, today],
  );

  // Toggle completion (Kanban drag to completed column)
  const handleToggleTaskCompleted = useCallback(async (taskToToggle: TimetableTask) => {
    const nextCompleted = !taskToToggle.completed;
    setTasks((prev) => {
      const updated = prev.map((t) =>
        t.id === taskToToggle.id ? { ...t, completed: nextCompleted } : t,
      );
      lsSave(today, updated);
      return updated;
    });

    if (supabase && taskToToggle.id) {
      await supabase.from("tasks").update({ completed: nextCompleted }).eq("id", taskToToggle.id);
    }
  }, [today]);

  const showingKanban = !isLoadingTasks && tasks.length > 0 && !showBrainDump;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* Celebration overlay */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-[2px]">
          <div className="rounded-2xl border border-emerald-300/60 bg-card px-8 py-6 text-center shadow-xl">
            <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">
              All tasks complete!
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Incredible focus today. Keep the momentum going.
            </p>
          </div>
        </div>
      )}

      {/* ── Kanban view ── */}
      {showingKanban ? (
        <div className="p-6 lg:p-[124px]">
          <header className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">DayFlow</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Turn your brain dump into a realistic daily schedule.
              </p>
            </div>
            <button
              onClick={() => setShowBrainDump(true)}
              className="shrink-0 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted"
            >
              ← Edit tasks
            </button>
          </header>

          {/* Add additional task */}
          <div className="mb-6">
            {showAddTask ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = addTaskInput.trim();
                  if (!title) return;
                  void handleAddTask(title);
                  setAddTaskInput("");
                  setShowAddTask(false);
                }}
                className="flex gap-2"
              >
                <input
                  autoFocus
                  value={addTaskInput}
                  onChange={(e) => setAddTaskInput(e.target.value)}
                  placeholder="What do you need to add?"
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <button
                  type="submit"
                  disabled={!addTaskInput.trim()}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                >
                  Add task
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddTask(false); setAddTaskInput(""); }}
                  className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowAddTask(true)}
                className="rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground transition hover:border-foreground/40 hover:text-foreground"
              >
                + Add additional task
              </button>
            )}
          </div>

          <Timetable tasks={tasks} onToggleTaskCompleted={handleToggleTaskCompleted} onReorderTasks={handleReorderTasks} />
        </div>
      ) : (
        /* ── Brain dump view: vertically + horizontally centered ── */
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-2xl">
            {isLoadingTasks ? (
              <div className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                Loading today&apos;s tasks…
              </div>
            ) : (
              <>
                <header className="mb-6 text-center">
                  {tasks.length > 0 && (
                    <button
                      onClick={() => setShowBrainDump(false)}
                      className="mb-6 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted"
                    >
                      ← Back to schedule
                    </button>
                  )}
                  <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">DayFlow</h1>
                  <p className="mt-3 text-base text-muted-foreground">
                    Turn your brain dump into a realistic daily schedule.
                  </p>
                </header>
                <BrainDump onScheduleGenerated={handleScheduleGenerated} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
