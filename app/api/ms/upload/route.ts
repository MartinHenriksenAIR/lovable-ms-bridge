// app/api/ms/upload/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

type TokenResponse = {
  access_token: string;
  sharepoint?: {
    tenantId?: string;
    driveId?: string;
    parentItemId?: string;
  };
};

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const {
      user_id,
      tenant_id,
      docx_url,
      filename,
    } = body || {};

    if (!user_id || !tenant_id || !docx_url || !filename) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: user_id, tenant_id, docx_url, filename",
        },
        { status: 400 }
      );
    }

    const backendBase =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : ""; // fallback if needed

    if (!backendBase) {
      return NextResponse.json(
        {
          error:
            "Server misconfigured: cannot determine backend base URL (set NEXT_PUBLIC_BASE_URL or VERCEL_URL).",
        },
        { status: 500 }
      );
    }

    // 1) Get fresh token + default SharePoint folder from your existing /api/ms/token
    const tokenResp = await fetch(`${backendBase}/api/ms/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, tenant_id }),
    });

    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      return NextResponse.json(
        { error: "Token fetch failed", detail: txt },
        { status: 502 }
      );
    }

    const tokenJson = (await tokenResp.json()) as TokenResponse;
    const accessToken = tokenJson.access_token;
    const driveId = tokenJson.sharepoint?.driveId;
    const parentItemId = tokenJson.sharepoint?.parentItemId;

    if (!accessToken || !driveId || !parentItemId) {
      return NextResponse.json(
        {
          error:
            "Token endpoint did not return access_token/driveId/parentItemId",
          detail: tokenJson,
        },
        { status: 500 }
      );
    }

    // 2) Download DOCX from Supabase (or wherever docx_url points)
    const docxResp = await fetch(docx_url);
    if (!docxResp.ok) {
      const txt = await docxResp.text();
      return NextResponse.json(
        { error: "Failed to download DOCX", status: docxResp.status, detail: txt },
        { status: 502 }
      );
    }
    const docxArrayBuf = await docxResp.arrayBuffer();
    const docxBuffer = Buffer.from(docxArrayBuf);

    // 3) Upload DOCX to SharePoint using Microsoft Graph
    const graphUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
      driveId
    )}/items/${encodeURIComponent(
      parentItemId
    )}:/${encodeURIComponent(filename)}:/content`;

    const upResp = await fetch(graphUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      body: docxBuffer,
    });

    const upText = await upResp.text();
    if (!upResp.ok) {
      return NextResponse.json(
        {
          error: "Graph upload failed",
          status: upResp.status,
          detail: upText,
        },
        { status: 502 }
      );
    }

    // Graph normally returns JSON describing the driveItem
    let upJson: any = null;
    try {
      upJson = JSON.parse(upText);
    } catch {
      upJson = { raw: upText };
    }

    return NextResponse.json({
      ok: true,
      item: upJson,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
