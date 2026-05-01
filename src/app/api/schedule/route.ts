import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ScheduleRequest = {
  brainDump: string;
  date: string;
  startTime?: string;
  endTime?: string;
};

type TaskCategory = "work" | "personal" | "learning" | "admin";
type TaskPriority = "high" | "medium" | "low";

type ScheduledTask = {
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  order_index: number;
};

type DailySummaryRow = {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  completion_rate: number;
};

type BrainDumpItem = {
  text: string;
  category: TaskCategory;
  priority: TaskPriority;
};

const TASK_JSON_SCHEMA = `[
  {
    "title": "string",
    "description": "string",
    "category": "work|personal|learning|admin",
    "priority": "high|medium|low",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "duration_minutes": 30,
    "order_index": 0
  }
]`;

function extractJsonArray(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const unfenced = fencedMatch ? fencedMatch[1] : trimmed;
  const arrayMatch = unfenced.match(/\[[\s\S]*\]/);
  return arrayMatch ? arrayMatch[0] : unfenced;
}

function validateTask(task: unknown): task is ScheduledTask {
  if (!task || typeof task !== "object") {
    return false;
  }

  const candidate = task as Record<string, unknown>;
  const categories: TaskCategory[] = ["work", "personal", "learning", "admin"];
  const priorities: TaskPriority[] = ["high", "medium", "low"];
  const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  return (
    typeof candidate.title === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.category === "string" &&
    categories.includes(candidate.category as TaskCategory) &&
    typeof candidate.priority === "string" &&
    priorities.includes(candidate.priority as TaskPriority) &&
    typeof candidate.start_time === "string" &&
    hhmmRegex.test(candidate.start_time) &&
    typeof candidate.end_time === "string" &&
    hhmmRegex.test(candidate.end_time) &&
    typeof candidate.duration_minutes === "number" &&
    Number.isFinite(candidate.duration_minutes) &&
    candidate.duration_minutes > 0 &&
    typeof candidate.order_index === "number" &&
    Number.isInteger(candidate.order_index) &&
    candidate.order_index >= 0
  );
}

function formatUserCapacityContext(rows: DailySummaryRow[]): string {
  if (rows.length === 0) {
    return "No recent history is available yet. Start with a conservative, realistic workload.";
  }

  const averageCompletionRate =
    rows.reduce((sum, row) => sum + row.completion_rate, 0) / rows.length;
  const averageCompletedTasks =
    rows.reduce((sum, row) => sum + row.completed_tasks, 0) / rows.length;
  const averageTotalTasks =
    rows.reduce((sum, row) => sum + row.total_tasks, 0) / rows.length;

  const historyLines = rows
    .map(
      (row) =>
        `- ${row.date}: ${row.completed_tasks}/${row.total_tasks} tasks completed (${row.completion_rate}%)`,
    )
    .join("\n");

  return `Recent completion history (latest first):
${historyLines}

Patterns:
- Average completion rate: ${averageCompletionRate.toFixed(1)}%
- Typically completes about ${averageCompletedTasks.toFixed(1)} tasks/day
- Typically planned about ${averageTotalTasks.toFixed(1)} tasks/day`;
}

function toHHMM(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function inferCategory(text: string): TaskCategory {
  const value = text.toLowerCase();
  if (/(meeting|client|project|deadline|work|email|report|presentation)/.test(value)) {
    return "work";
  }
  if (/(learn|study|course|read|practice|tutorial)/.test(value)) {
    return "learning";
  }
  if (/(bill|bank|tax|paperwork|form|invoice|admin|plan)/.test(value)) {
    return "admin";
  }
  return "personal";
}

function inferPriority(text: string): TaskPriority {
  const value = text.toLowerCase();
  if (/(urgent|asap|important|deadline|critical|must)/.test(value)) {
    return "high";
  }
  if (/(maybe|later|optional|if time|someday)/.test(value)) {
    return "low";
  }
  return "medium";
}

function normalizeBrainDump(brainDump: string): BrainDumpItem[] {
  const roughItems = brainDump
    .split(/\n|,|;/)
    .map((item) => item.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);

  return roughItems.map((text) => ({
    text,
    category: inferCategory(text),
    priority: inferPriority(text),
  }));
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 9) * 60 + (m ?? 0);
}

function buildFallbackSchedule(
  brainDump: string,
  summaryRows: DailySummaryRow[],
  startTime = "09:00",
  endTime = "18:00",
): ScheduledTask[] {
  const items = normalizeBrainDump(brainDump);
  if (items.length === 0) {
    return [];
  }

  const averageCompletedTasks =
    summaryRows.length > 0
      ? summaryRows.reduce((sum, row) => sum + row.completed_tasks, 0) / summaryRows.length
      : 6;
  const maxTasks = Math.max(3, Math.min(10, Math.round(averageCompletedTasks) + 1));

  const highWork = items.filter(
    (item) => item.category === "work" && item.priority === "high",
  );
  const mediumThenLow = items.filter(
    (item) => !(item.category === "work" && item.priority === "high"),
  );
  const ordered = [...highWork, ...mediumThenLow].slice(0, maxTasks);

  const scheduled: ScheduledTask[] = [];
  const windowEnd = timeToMinutes(endTime);
  let currentMinute = timeToMinutes(startTime);

  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index];
    const duration =
      item.priority === "high" ? 60 : item.category === "learning" ? 50 : 40;
    const start = currentMinute;
    const end = start + duration;

    if (end > windowEnd) break;

    scheduled.push({
      title: item.text,
      description: `Planned from brain dump (${item.category}, ${item.priority} priority).`,
      category: item.category,
      priority: item.priority,
      start_time: toHHMM(start),
      end_time: toHHMM(end),
      duration_minutes: duration,
      order_index: index,
    });

    currentMinute = end + 10;
    if (currentMinute >= windowEnd) {
      break;
    }
  }

  return scheduled;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    const body = (await req.json()) as Partial<ScheduleRequest>;
    const brainDump = body.brainDump?.trim();
    const date = body.date?.trim();
    const startTime = body.startTime?.trim() ?? "09:00";
    const endTime = body.endTime?.trim() ?? "18:00";

    if (!brainDump || !date) {
      return NextResponse.json(
        { error: "Request body must include non-empty brainDump and date." },
        { status: 400 },
      );
    }

    const supabaseUrl =
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error:
            "Missing Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).",
        },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: summaryRows, error: summaryError } = await supabase
      .from("daily_summaries")
      .select("date, total_tasks, completed_tasks, completion_rate")
      .order("date", { ascending: false })
      .limit(5);

    const recentSummaryRows =
      !summaryError && Array.isArray(summaryRows)
        ? (summaryRows as DailySummaryRow[])
        : [];

    const userCapacityContext = formatUserCapacityContext(recentSummaryRows);

    const fallbackSchedule = buildFallbackSchedule(brainDump, recentSummaryRows, startTime, endTime);

    if (!apiKey) {
      return NextResponse.json(fallbackSchedule);
    }

    try {
      const anthropic = new Anthropic({ apiKey });

      const stream = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        temperature: 0.2,
        stream: true,
        system:
          "You are an expert daily planning assistant. Always output valid JSON only.",
        messages: [
          {
            role: "user",
            content: `Create a realistic day schedule for date: ${date}.
The user's available working window is ${startTime} to ${endTime}. All tasks must be scheduled within this window.

Tasks to schedule:
${brainDump}

Rules:
1) Return ONLY a JSON array that follows this schema exactly:
${TASK_JSON_SCHEMA}
2) Use category values only from: work, personal, learning, admin.
3) Use priority values only from: high, medium, low.
4) Schedule tasks in chronological order within the ${startTime}–${endTime} window.
5) Do not schedule any task to start before ${startTime} or end after ${endTime}.
6) Leave realistic buffer time between tasks.
7) Place high-priority work tasks earlier in the window whenever possible.
8) Ensure times are realistic and duration_minutes matches the gap between start_time and end_time.
9) order_index must start at 0 and increment by 1.
10) Use the user's recent performance context to keep the plan realistic for this user's capacity.

User performance context:
${userCapacityContext}`,
          },
        ],
      });

      let responseText = "";
      for await (const event of stream as AsyncIterable<any>) {
        if (
          event?.type === "content_block_delta" &&
          event?.delta?.type === "text_delta"
        ) {
          responseText += event.delta.text;
        }
      }

      const jsonText = extractJsonArray(responseText);
      const parsed = JSON.parse(jsonText) as unknown;

      if (!Array.isArray(parsed) || !parsed.every(validateTask)) {
        return NextResponse.json(fallbackSchedule);
      }

      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(fallbackSchedule);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scheduling error";
    return NextResponse.json(
      { error: "Failed to generate schedule.", details: message },
      { status: 500 },
    );
  }
}
