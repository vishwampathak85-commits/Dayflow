"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";

type TaskCategory = "work" | "personal" | "learning" | "admin";
type TaskPriority = "high" | "medium" | "low";

export type TimetableTask = {
  id?: string;
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  completed: boolean;
};

type Status = "ongoing" | "due" | "completed";

type TimetableProps = {
  tasks: TimetableTask[];
  onToggleTaskCompleted?: (task: TimetableTask) => void;
  onReorderTasks?: (tasks: TimetableTask[]) => void;
};

const COLUMN_IDS: Status[] = ["ongoing", "due", "completed"];

const COLUMN_CONFIG: Record<
  Status,
  { title: string; accent: string; dot: string; overClass: string }
> = {
  ongoing: {
    title: "Ongoing",
    accent: "text-blue-700 bg-blue-50 border-blue-200",
    dot: "bg-blue-500",
    overClass: "border-blue-400/50 bg-blue-50/40",
  },
  due: {
    title: "Due",
    accent: "text-amber-700 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
    overClass: "border-amber-400/50 bg-amber-50/40",
  },
  completed: {
    title: "Completed",
    accent: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
    overClass: "border-emerald-400/50 bg-emerald-50/40",
  },
};

function getTaskId(task: TimetableTask): string {
  return task.id ?? task.title;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  if (minutes === 60) return "~1 hr";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `~${h} hr${h > 1 ? "s" : ""}` : `~${h}h ${m}m`;
}

function computeInitialStatus(task: TimetableTask): Status {
  if (task.completed) return "completed";
  if (new Date().getHours() >= 16) return "due";
  return "ongoing";
}

// ── Plain card rendered inside DragOverlay ───────────────────────────────────
function TaskCard({ task }: { task: TimetableTask }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3.5 shadow-lg ring-1 ring-black/5">
      <p className="text-sm font-medium leading-snug text-zinc-800">{task.title}</p>
      <p className="mt-1.5 text-xs text-zinc-400">{formatDuration(task.duration_minutes)}</p>
    </div>
  );
}

// ── Sortable card ────────────────────────────────────────────────────────────
function SortableTaskCard({ task }: { task: TimetableTask }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: getTaskId(task) });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`cursor-grab select-none rounded-xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-0" : "opacity-100"
      }`}
    >
      <p className="text-sm font-medium leading-snug text-zinc-800">{task.title}</p>
      <p className="mt-1.5 text-xs text-zinc-400">{formatDuration(task.duration_minutes)}</p>
    </div>
  );
}

// ── Column with its own droppable zone ───────────────────────────────────────
function KanbanColumn({ status, tasks }: { status: Status; tasks: TimetableTask[] }) {
  const cfg = COLUMN_CONFIG[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* Header */}
      <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${cfg.accent}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
          <h3 className="text-sm font-semibold">{cfg.title}</h3>
        </div>
        <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
          {tasks.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2.5 rounded-xl border-2 border-dashed p-3 transition-colors ${
          isOver ? cfg.overClass : "border-border/40 bg-muted/10"
        }`}
        style={{ minHeight: 300 }}
      >
        <SortableContext items={tasks.map(getTaskId)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={getTaskId(task)} task={task} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-10">
            <p className="text-xs text-muted-foreground/50">Drop tasks here</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export function Timetable({ tasks, onToggleTaskCompleted, onReorderTasks }: TimetableProps) {
  // Single source of truth: column membership and order
  const [columnOrder, setColumnOrder] = useState<Record<Status, string[]>>(() => {
    const map: Record<Status, string[]> = { ongoing: [], due: [], completed: [] };
    for (const task of tasks) {
      map[computeInitialStatus(task)].push(getTaskId(task));
    }
    return map;
  });

  // Ref so handleDragEnd can read the latest committed columnOrder without functional-updater tricks
  const columnOrderRef = useRef(columnOrder);
  columnOrderRef.current = columnOrder;

  // When tasks are added externally (e.g. "Add additional task"), slot them into "ongoing"
  useEffect(() => {
    setColumnOrder((prev: Record<Status, string[]>) => {
      const known = new Set(COLUMN_IDS.flatMap((s) => prev[s]));
      const newIds = tasks.map(getTaskId).filter((id) => !known.has(id));
      if (newIds.length === 0) return prev;
      return { ...prev, ongoing: [...prev.ongoing, ...newIds] };
    });
  }, [tasks]);

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTask = activeId
    ? (tasks.find((t) => getTaskId(t) === activeId) ?? null)
    : null;

  // Always use latest state via functional-update helpers
  function colOf(taskId: string, order: Record<Status, string[]>): Status | null {
    return COLUMN_IDS.find((s) => order[s].includes(taskId)) ?? null;
  }

  function columnTasks(status: Status, order: Record<Status, string[]>): TimetableTask[] {
    return order[status]
      .map((id) => tasks.find((t) => getTaskId(t) === id))
      .filter(Boolean) as TimetableTask[];
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  // Provide live visual feedback as the card hovers over a new column
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const aId = active.id as string;
    const oId = over.id as string;

    setColumnOrder((prev) => {
      const src = colOf(aId, prev);
      const dest = COLUMN_IDS.includes(oId as Status)
        ? (oId as Status)
        : colOf(oId, prev);
      if (!src || !dest || src === dest) return prev;

      const next = { ...prev };
      next[src] = next[src].filter((id) => id !== aId);
      const overIdx = next[dest].indexOf(oId);
      if (overIdx !== -1) {
        next[dest] = [
          ...next[dest].slice(0, overIdx),
          aId,
          ...next[dest].slice(overIdx),
        ];
      } else {
        next[dest] = [...next[dest], aId];
      }
      return next;
    });
  }

  // Finalise: sort within column if dropped on a sibling task
  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;

    const aId = active.id as string;
    const oId = over.id as string;
    const prev = columnOrderRef.current;
    const col = colOf(aId, prev);
    if (!col) return;

    // Within-column reorder when dropped directly onto a sibling
    let next = prev;
    if (!COLUMN_IDS.includes(oId as Status) && prev[col].includes(oId)) {
      const oldIdx = prev[col].indexOf(aId);
      const newIdx = prev[col].indexOf(oId);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        next = { ...prev, [col]: arrayMove(prev[col], oldIdx, newIdx) };
      }
    }
    setColumnOrder(next);

    // Defer parent setState calls out of dnd-kit's internal flushSync context.
    // Calling them synchronously here triggers React's "setState during render" error.
    const finalCol = col;
    const draggedTask = tasks.find((t) => getTaskId(t) === aId);
    const frozenNext = next;
    const frozenTasks = tasks;
    setTimeout(() => {
      if (draggedTask) {
        if (finalCol === "completed" && !draggedTask.completed) onToggleTaskCompleted?.(draggedTask);
        if (finalCol !== "completed" && draggedTask.completed) onToggleTaskCompleted?.(draggedTask);
      }

      if (onReorderTasks) {
        const reordered = COLUMN_IDS.flatMap((s) =>
          frozenNext[s]
            .map((id: string) => frozenTasks.find((t) => getTaskId(t) === id))
            .filter(Boolean) as TimetableTask[]
        );
        onReorderTasks(reordered);
      }
    }, 0);
  }

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-12">
        <p className="text-sm text-muted-foreground">
          Your schedule will appear here once generated.
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-3 gap-5">
        {COLUMN_IDS.map((s) => (
          <KanbanColumn key={s} status={s} tasks={columnTasks(s, columnOrder)} />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
        {activeTask ? <TaskCard task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
