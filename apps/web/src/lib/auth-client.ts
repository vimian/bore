"use client";

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return (await response.json()) as T;
}

export const authClient = {
  signIn: {
    email: async (input: { email: string; password: string }) =>
      postJson<{ data?: unknown; error?: { message?: string } }>(
        "/api/auth/sign-in",
        input,
      ),
  },
  signUp: {
    email: async (input: { email: string; password: string; name?: string }) =>
      postJson<{ data?: unknown; error?: { message?: string } }>(
        "/api/auth/sign-up",
        input,
      ),
  },
  signOut: async () => postJson<{ ok: boolean }>("/api/auth/sign-out"),
};
