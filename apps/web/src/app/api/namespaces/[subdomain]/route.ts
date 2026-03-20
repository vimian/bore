import { NextResponse } from "next/server";

import { getControlPlaneOrigin } from "@/lib/env";
import { getCurrentSessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ subdomain: string }> },
) {
  const token = await getCurrentSessionToken();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subdomain } = await context.params;
  const response = await fetch(
    `${getControlPlaneOrigin()}/api/v1/namespaces/${encodeURIComponent(subdomain)}`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => ({ error: undefined }))) as {
    error?: string;
    releasedSubdomain?: string;
    removedAccessHostnames?: string[];
  };

  if (!response.ok) {
    return NextResponse.json(
      { error: payload.error ?? "Unable to release namespace." },
      { status: response.status },
    );
  }

  return NextResponse.json(payload, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
