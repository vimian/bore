import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/bore-db";
import { clearSession, getCurrentSessionToken } from "@/lib/session";

export async function POST() {
  clearSession(await getCurrentSessionToken());
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
