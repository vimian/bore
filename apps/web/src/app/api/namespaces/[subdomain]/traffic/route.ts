import { NextResponse } from "next/server";

import { getControlPlaneOrigin } from "@/lib/env";
import { getCurrentSessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

type DeleteTrafficBody =
  | {
      scope: "direct";
    }
  | {
      scope: "child";
      label: string;
    };

export async function DELETE(
  request: Request,
  context: { params: Promise<{ subdomain: string }> },
) {
  const token = await getCurrentSessionToken();

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as DeleteTrafficBody | null;

  if (!body || (body.scope === "child" && !body.label?.trim())) {
    return NextResponse.json({ error: "Invalid traffic target." }, { status: 400 });
  }

  const { subdomain } = await context.params;
  const response = await fetch(
    `${getControlPlaneOrigin()}/api/v1/namespaces/${encodeURIComponent(subdomain)}/traffic`,
    {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => ({ error: undefined }))) as {
    error?: string;
    namespace?: unknown;
  };

  if (!response.ok) {
    return NextResponse.json(
      { error: payload.error ?? "Unable to clean traffic." },
      { status: response.status },
    );
  }

  return NextResponse.json(payload, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
