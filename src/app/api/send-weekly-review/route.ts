import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type DailySummaryRow = {
  date: string;
  completion_rate: number;
  completed_tasks: number;
  total_tasks: number;
};

type TaskCategory = "work" | "personal" | "learning" | "admin";
type TaskRow = {
  category: TaskCategory;
  completed: boolean;
};

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDateWindow(days: number): { fromDate: string; toDate: string } {
  const now = new Date();
  const toDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  const start = new Date(now);
  start.setDate(now.getDate() - (days - 1));
  const fromDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(start.getDate()).padStart(2, "0")}`;

  return { fromDate, toDate };
}

function getRecommendation(
  averageCompletionRate: number,
  mostSkippedCategories: TaskCategory[],
): string {
  if (averageCompletionRate < 50) {
    return "Plan fewer high-impact tasks each day and leave buffer blocks to improve completion consistency.";
  }

  if (mostSkippedCategories.includes("admin")) {
    return "Batch admin tasks into one short daily block so they do not spill across your whole schedule.";
  }

  if (mostSkippedCategories.includes("learning")) {
    return "Schedule learning sessions as fixed calendar blocks earlier in the day when your energy is higher.";
  }

  return "Keep your current pace and add one focused deep-work block each morning to raise weekly output.";
}

function buildCompletionTableHtml(summaries: DailySummaryRow[]): string {
  if (summaries.length === 0) {
    return `
      <tr>
        <td colspan="3" style="padding: 10px; border: 1px solid #e4e4e7; text-align:center; color:#52525b;">
          No daily summary data for the last 7 days yet.
        </td>
      </tr>
    `;
  }

  return summaries
    .map(
      (summary) => `
        <tr>
          <td style="padding: 10px; border: 1px solid #e4e4e7; font-size: 13px; color: #18181b;">${formatDate(
            summary.date,
          )}</td>
          <td style="padding: 10px; border: 1px solid #e4e4e7; font-size: 13px; color: #18181b;">${
            summary.completed_tasks
          }/${summary.total_tasks}</td>
          <td style="padding: 10px; border: 1px solid #e4e4e7; font-size: 13px; color: #18181b;">${
            summary.completion_rate
          }%</td>
        </tr>
      `,
    )
    .join("");
}

function buildEmailHtml({
  summaries,
  bestDay,
  mostSkippedCategories,
  recommendation,
}: {
  summaries: DailySummaryRow[];
  bestDay: DailySummaryRow | null;
  mostSkippedCategories: TaskCategory[];
  recommendation: string;
}): string {
  const appUrl = "https://your-vercel-url.vercel.app";
  const skippedCategoriesText =
    mostSkippedCategories.length > 0
      ? mostSkippedCategories.join(", ")
      : "No strong skip pattern detected this week.";

  return `
    <div style="background:#f4f4f5; padding:24px; font-family: Inter, Arial, sans-serif; color:#18181b;">
      <div style="max-width:700px; margin:0 auto; background:#ffffff; border:1px solid #e4e4e7; border-radius:14px; overflow:hidden;">
        <div style="padding:24px; background:linear-gradient(135deg, #18181b, #3f3f46); color:#ffffff;">
          <h1 style="margin:0; font-size:24px; font-weight:700;">Your Weekly DayFlow Review</h1>
          <p style="margin:8px 0 0 0; font-size:14px; opacity:0.9;">Last 7 days performance snapshot</p>
        </div>

        <div style="padding:24px;">
          <h2 style="margin:0 0 10px 0; font-size:16px;">Completion Rate Chart</h2>
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <thead>
              <tr>
                <th style="padding:10px; border:1px solid #e4e4e7; text-align:left; background:#fafafa; font-size:12px; color:#52525b;">Day</th>
                <th style="padding:10px; border:1px solid #e4e4e7; text-align:left; background:#fafafa; font-size:12px; color:#52525b;">Done</th>
                <th style="padding:10px; border:1px solid #e4e4e7; text-align:left; background:#fafafa; font-size:12px; color:#52525b;">Completion</th>
              </tr>
            </thead>
            <tbody>
              ${buildCompletionTableHtml(summaries)}
            </tbody>
          </table>

          <div style="margin-bottom:14px; padding:12px; border:1px solid #e4e4e7; border-radius:10px; background:#fafafa;">
            <p style="margin:0; font-size:14px;"><strong>Best day:</strong> ${
              bestDay
                ? `${formatDate(bestDay.date)} (${bestDay.completion_rate}% complete)`
                : "No completed day recorded this week yet."
            }</p>
          </div>

          <div style="margin-bottom:14px; padding:12px; border:1px solid #e4e4e7; border-radius:10px; background:#fafafa;">
            <p style="margin:0; font-size:14px;"><strong>Most skipped task categories:</strong> ${skippedCategoriesText}</p>
          </div>

          <div style="margin-bottom:18px; padding:12px; border:1px solid #d4d4d8; border-radius:10px; background:#f9fafb;">
            <p style="margin:0; font-size:14px;"><strong>Recommendation for next week:</strong> ${recommendation}</p>
          </div>

          <a href="${appUrl}" style="display:inline-block; padding:10px 16px; border-radius:9999px; background:#18181b; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none;">
            Open DayFlow
          </a>
        </div>
      </div>
    </div>
  `;
}

async function sendWeeklyReview() {
  try {
    const supabaseUrl =
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          error:
            "Missing Supabase credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).",
        },
        { status: 500 },
      );
    }

    if (!resendApiKey) {
      return NextResponse.json(
        { error: "Missing RESEND_API_KEY environment variable." },
        { status: 500 },
      );
    }

    const { fromDate, toDate } = getDateWindow(7);
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: summaryData, error: summaryError } = await supabase
      .from("daily_summaries")
      .select("date, completion_rate, completed_tasks, total_tasks")
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date", { ascending: false });

    if (summaryError) {
      return NextResponse.json(
        { error: "Failed to load daily summaries for weekly review." },
        { status: 500 },
      );
    }

    const summaries = (summaryData as DailySummaryRow[]) ?? [];
    const bestDay =
      summaries.length > 0
        ? [...summaries].sort((a, b) => b.completion_rate - a.completion_rate)[0]
        : null;

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("category, completed")
      .gte("date", fromDate)
      .lte("date", toDate);

    if (taskError) {
      return NextResponse.json(
        { error: "Failed to load task categories for weekly review." },
        { status: 500 },
      );
    }

    const tasks = (taskData as TaskRow[]) ?? [];
    const skippedByCategory: Record<TaskCategory, number> = {
      work: 0,
      personal: 0,
      learning: 0,
      admin: 0,
    };

    for (const task of tasks) {
      if (!task.completed) {
        skippedByCategory[task.category] += 1;
      }
    }

    const maxSkipped = Math.max(...Object.values(skippedByCategory), 0);
    const mostSkippedCategories =
      maxSkipped === 0
        ? []
        : (Object.entries(skippedByCategory)
            .filter(([, count]) => count === maxSkipped)
            .map(([category]) => category) as TaskCategory[]);

    const averageCompletionRate =
      summaries.length === 0
        ? 0
        : summaries.reduce((sum, row) => sum + row.completion_rate, 0) / summaries.length;

    const recommendation = getRecommendation(
      averageCompletionRate,
      mostSkippedCategories,
    );

    const resend = new Resend(resendApiKey);
    const emailResult = await resend.emails.send({
      from: "DayFlow <onboarding@resend.dev>",
      to: ["vishwam.pathak85@gmail.com"],
      subject: "Your DayFlow Weekly Review",
      html: buildEmailHtml({
        summaries,
        bestDay,
        mostSkippedCategories,
        recommendation,
      }),
    });

    return NextResponse.json({
      success: true,
      from_date: fromDate,
      to_date: toDate,
      summary_days: summaries.length,
      best_day: bestDay,
      most_skipped_categories: mostSkippedCategories,
      recommendation,
      email: emailResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown weekly review send error";
    return NextResponse.json(
      { error: "Failed to send weekly review email.", details: message },
      { status: 500 },
    );
  }
}

export async function POST() {
  return sendWeeklyReview();
}

export async function GET() {
  return sendWeeklyReview();
}
