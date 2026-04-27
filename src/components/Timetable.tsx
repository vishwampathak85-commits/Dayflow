"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

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

type TimetableProps = {
  tasks: TimetableTask[];
  onToggleTaskCompleted?: (task: TimetableTask) => void;
  onUpdatePriority?: (task: TimetableTask, priority: TaskPriority) => void;
  onReorderTasks?: (tasks: TimetableTask[]) => void;
};

const categoryClasses: Record<TaskCategory, string> = {
  work: "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30",
  personal:
    "bg-green-100 text-green-700 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-400/30",
  learning:
    "bg-purple-100 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-400/30",
  admin:
    "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/30",
};

const priorityDotClasses: Record<TaskPriority, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-zinc-400",
};

const priorityLabelClasses: Record<TaskPriority, string> = {
  high: "text-red-600 dark:text-red-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-zinc-500",
};

// Individual sortable task card
function SortableTaskCard({
  task,
  onToggleTaskCompleted,
  onUpdatePriority,
}: {
  task: TimetableTask;
  onToggleTaskCompleted?: (task: TimetableTask) => void;
  onUpdatePriority?: (task: TimetableTask, priority: TaskPriority) => void;
}) {
  const [editingPriority, setEditingPriority] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id ?? task.title });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="relative">
      {/* Priority dot on the timeline */}
      <span className="absolute top-5 -left-6 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background ring-4 ring-background">
        <span
          className={`h-2.5 w-2.5 rounded-full ${priorityDotClasses[task.priority]}`}
        />
      </span>

      <article
        className={`rounded-xl border bg-background p-4 transition hover:shadow-sm ${
          task.completed ? "border-emerald-200/70 opacity-80" : "border-border"
        } ${isDragging ? "shadow-lg" : ""}`}
      >
        {/* Top row: drag handle + time + category + duration */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          {/* Drag handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="9" cy="5" r="1.5" />
              <circle cx="15" cy="5" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="19" r="1.5" />
              <circle cx="15" cy="19" r="1.5" />
            </svg>
          </button>

          <span className="rounded-md bg-muted px-2 py-1 text-foreground">
            {task.start_time} - {task.end_time}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 capitalize ring-1 ring-inset ${categoryClasses[task.category]}`}
          >
            {task.category}
          </span>
          <span className="rounded-md bg-muted px-2 py-1">
            {task.duration_minutes} min
          </span>
        </div>

        {/* Task title */}
        <h3
          className={`mt-3 text-base font-semibold ${
            task.completed ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {task.title}
        </h3>

        {/* Priority row — click to edit */}
        <div className="mt-2 flex items-center gap-2">
          {editingPriority ? (
            <select
              autoFocus
              value={task.priority}
              onChange={(e) => {
                onUpdatePriority?.(task, e.target.value as TaskPriority);
                setEditingPriority(false);
              }}
              onBlur={() => setEditingPriority(false)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setEditingPriority(true)}
              className={`text-xs capitalize hover:underline ${priorityLabelClasses[task.priority]} ${
                task.completed ? "line-through" : ""
              }`}
              title="Click to change priority"
            >
              Priority: {task.priority} ✎
            </button>
          )}
        </div>

        {/* Mark complete button */}
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() => onToggleTaskCompleted?.(task)}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              task.completed
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-border bg-muted text-foreground hover:bg-muted/80"
            }`}
          >
            {task.completed ? "Completed ✓" : "Mark complete"}
          </button>
        </div>
      </article>
    </li>
  );
}

export function Timetable({
  tasks,
  onToggleTaskCompleted,
  onUpdatePriority,
  onReorderTasks,
}: TimetableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const taskIds = tasks.map((t) => t.id ?? t.title);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => (t.id ?? t.title) === active.id);
    const newIndex = tasks.findIndex((t) => (t.id ?? t.title) === over.id);
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    onReorderTasks?.(reordered);
  }
  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Your schedule will appear here once generated.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight">Daily Timeline</h2>
        <p className="text-sm text-muted-foreground">
          Drag ⠿ to reorder · Click priority to change it.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <ol className="relative space-y-4 pl-6">
            <div className="absolute top-1 bottom-1 left-2.5 w-px bg-border" />
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id ?? task.title}
                task={task}
                onToggleTaskCompleted={onToggleTaskCompleted}
                onUpdatePriority={onUpdatePriority}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}
