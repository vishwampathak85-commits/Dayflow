import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SummaryRequest = {
  date: string;
};

type TaskRow = {
  completed: boolean;
};

function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<SummaryRequest>;
    const date = body.date?.trim();

    if (!date || !isValidDateInput(date)) {
      return NextResponse.json(
        { error: "Request body must include a valid date (YYYY-MM-DD)." },
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

    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("completed")
      .eq("date", date);

    if (tasksError) {
      return NextResponse.json(
        { error: "Failed to load tasks for the requested date." },
        { status: 500 },
      );
    }

    const safeTasks = (tasks as TaskRow[]) ?? [];
    const totalTasks = safeTasks.length;
    const completedTasks = safeTasks.filter((task) => task.completed).length;
    const completionRate =
      totalTasks === 0 ? 0 : Number(((completedTasks / totalTasks) * 100).toFixed(2));

    const summaryPayload = {
      date,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      completion_rate: completionRate,
    };

    const { data: summary, error: summaryError } = await supabase
      .from("daily_summaries")
      .upsert(summaryPayload, { onConflict: "date" })
      .select("*")
      .single();

    if (summaryError) {
      return NextResponse.json(
        { error: "Failed to upsert daily summary." },
        { status: 500 },
      );
    }

    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown summary error";
    return NextResponse.json(
      { error: "Failed to generate summary.", details: message },
      { status: 500 },
    );
  }
}
