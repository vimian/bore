import { NextResponse } from "next/server";
import { getUserUsage, usageMonth } from "@bore/database";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let month: string;
  try { month = usageMonth(new URL(request.url).searchParams.get("month") ?? undefined); }
  catch { return NextResponse.json({ error: "Month must be YYYY-MM" }, { status: 400 }); }
  return NextResponse.json(await getUserUsage(user.id, month), { headers: { "cache-control": "no-store" } });
}
