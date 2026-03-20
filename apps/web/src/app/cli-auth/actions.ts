"use server";

import { redirect } from "next/navigation";

import { getControlPlaneOrigin } from "@/lib/env";
import { getCurrentSessionToken } from "@/lib/session";

export async function completeCliAuth(formData: FormData) {
  const requestId = formData.get("requestId");

  if (typeof requestId !== "string" || !requestId) {
    throw new Error("Missing CLI auth request ID.");
  }

  const token = await getCurrentSessionToken();

  if (!token) {
    redirect(`/cli-auth?request=${encodeURIComponent(requestId)}`);
  }

  const response = await fetch(
    `${getControlPlaneOrigin()}/auth/cli/complete?requestId=${encodeURIComponent(requestId)}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: undefined }))) as {
      error?: string;
    };
    throw new Error(payload.error ?? "Unable to complete CLI sign-in.");
  }

  const payload = (await response.json()) as { redirectTo: string };
  redirect(payload.redirectTo);
}
