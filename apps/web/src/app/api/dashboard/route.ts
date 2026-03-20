import { NextResponse } from "next/server";

import { getDashboardOverview } from "@/lib/bore-db";
import { getPublicDomain } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(getDashboardOverview(user.id, getPublicDomain()), {
    headers: {
      "cache-control": "no-store",
    },
  });
}
