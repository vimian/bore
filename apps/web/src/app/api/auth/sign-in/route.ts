import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/bore-db";
import { getSessionCookieOptions, signInWithEmail } from "@/lib/session";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: { message: "Email and password are required." } },
      { status: 400 },
    );
  }

  const result = await signInWithEmail(body.email, body.password);

  if (!result) {
    return NextResponse.json(
      { error: { message: "Invalid email or password." } },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ data: { user: result.user } });
  response.cookies.set(
    SESSION_COOKIE_NAME,
    result.sessionToken,
    getSessionCookieOptions(),
  );
  return response;
}
