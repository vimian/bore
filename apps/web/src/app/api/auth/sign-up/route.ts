import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/bore-db";
import { getSessionCookieOptions, signUpWithEmail } from "@/lib/session";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    name?: string;
  };

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: { message: "Email and password are required." } },
      { status: 400 },
    );
  }

  try {
    const result = await signUpWithEmail({
      email: body.email,
      password: body.password,
      name: body.name,
    });
    const response = NextResponse.json({ data: { user: result.user } });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      result.sessionToken,
      getSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Unable to create account.",
        },
      },
      { status: 400 },
    );
  }
}
