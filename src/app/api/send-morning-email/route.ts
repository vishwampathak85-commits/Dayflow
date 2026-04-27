import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type TaskRow = {
  title: string;
  start_time: string;
  end_time: string;
  category: "work" | "personal" | "learning" | "admin";
  priority: "high" | "medium" | "low";
};

function getTodayDateInputValue(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatReadableDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildEmailHtml({
  readableDate,
  tasks,
}: {
  readableDate: string;
  tasks: TaskRow[];
}): string {
  const appUrl = "https://your-vercel-url.vercel.app";
  const hasTasks = tasks.length > 0;

  const taskItemsHtml = hasTasks
    ? tasks
        .map(
          (task) => `
            <li style="margin: 0 0 12px 0; padding: 12px; border: 1px solid #e4e4e7; border-radius: 10px; background: #fafafa;">
              <p style="margin: 0; font-size: 15px; color: #18181b; font-weight: 600;">
                ${task.start_time} - ${task.end_time} · ${task.title}
              </p>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #52525b;">
                ${task.category} · ${task.priority} priority
              </p>
            </li>
          `,
        )
        .join("")
    : "";

  return `
    <div style="background:#f4f4f5; padding:24px; font-family: Inter, Arial, sans-serif; color:#18181b;">
      <div style="max-width:620px; margin:0 auto; background:#ffffff; border:1px solid #e4e4e7; border-radius:14px; overflow:hidden;">
        <div style="padding:24px; background:linear-gradient(135deg, #18181b, #3f3f46); color:#ffffff;">
          <h1 style="margin:0; font-size:24px; font-weight:700;">Good morning from DayFlow</h1>
          <p style="margin:8px 0 0 0; font-size:14px; opacity:0.9;">${readableDate}</p>
        </div>

        <div style="padding:24px;">
          <p style="margin:0 0 16px 0; font-size:15px; line-height:1.6;">
            Here is your plan for today:
          </p>

          ${
            hasTasks
              ? `<ul style="list-style:none; margin:0; padding:0;">${taskItemsHtml}</ul>`
              : `<div style="padding:14px; border:1px dashed #a1a1aa; border-radius:10px; background:#fafafa; color:#3f3f46; font-size:14px;">
                  You do not have any tasks scheduled yet. Visit DayFlow to generate your schedule for today.
                </div>`
          }

          <div style="margin-top:22px;">
            <a href="${appUrl}" style="display:inline-block; padding:10px 16px; border-radius:9999px; background:#18181b; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none;">
              Open DayFlow
            </a>
          </div>

          <p style="margin:20px 0 0 0; font-size:14px; color:#3f3f46; line-height:1.6;">
            One focused step at a time - you have got this.
          </p>
        </div>
      </div>
    </div>
  `;
}

async function sendMorningEmail() {
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

    const today = getTodayDateInputValue();
    const readableDate = formatReadableDate(today);

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("tasks")
      .select("title, start_time, end_time, category, priority")
      .eq("date", today)
      .order("start_time", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load today's tasks." },
        { status: 500 },
      );
    }

    const tasks = (data as TaskRow[]) ?? [];
    const resend = new Resend(resendApiKey);

    const emailResult = await resend.emails.send({
      from: "DayFlow <onboarding@resend.dev>",
      to: ["vishwam.pathak85@gmail.com"],
      subject: `DayFlow Morning Plan - ${readableDate}`,
      html: buildEmailHtml({ readableDate, tasks }),
    });

    return NextResponse.json({
      success: true,
      date: today,
      task_count: tasks.length,
      email: emailResult,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email send error";
    return NextResponse.json(
      { error: "Failed to send morning email.", details: message },
      { status: 500 },
    );
  }
}

export async function POST() {
  return sendMorningEmail();
}

export async function GET() {
  return sendMorningEmail();
}
