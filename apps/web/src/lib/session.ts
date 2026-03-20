import { cookies } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  authenticateUser,
  createSession,
  createUserAccount,
  deleteSession,
  getUserBySessionToken,
} from "@/lib/bore-db";
import type { UserRecord } from "@/lib/bore-db";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function getCurrentSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getCurrentUser(): Promise<UserRecord | null> {
  const token = await getCurrentSessionToken();

  if (!token) {
    return null;
  }

  return getUserBySessionToken(token);
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ user: UserRecord; sessionToken: string } | null> {
  const user = authenticateUser(email, password);

  if (!user) {
    return null;
  }

  return {
    user,
    sessionToken: createSession(user.id),
  };
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ user: UserRecord; sessionToken: string }> {
  const user = createUserAccount(input);
  return {
    user,
    sessionToken: createSession(user.id),
  };
}

export function clearSession(token: string | null): void {
  if (token) {
    deleteSession(token);
  }
}
