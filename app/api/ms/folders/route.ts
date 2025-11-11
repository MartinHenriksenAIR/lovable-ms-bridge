// app/api/ms/folders/route.ts
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken, getUserId } from "../_util";

export async function GET(req: NextRequest) {
  const user_id = getUserId(req);
  const tenant_id = req.nextUrl.searchParams.get("tenantId");
  const driveId   = req.nextUrl.searchParams.get("driveId");
  const parentId  = req.nextUrl.searchParams.get("parentId") || "root";

  if (!tenant_id || !driveId) {
    return NextResponse.json({ error: "tenantId and driveId required" }, { status: 400 });
  }

  try {
    const access = await refreshAccessToken(user_id, tenant_id);

    const base = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}`;
    const url =
      parentId === "root"
        ? `${base}/root/children?$top=200`
        : `${base}/items/${encodeURIComponent(parentId)}/children?$top=200`;

    const g = await fetch(url, {
      headers: { Authorization: `Bearer ${access}`, Accept: "application/json" }
    });

    const txt = await g.text();
    let js: any;
    try { js = JSON.parse(txt); } catch { js = { raw: txt }; }

    if (!g.ok) {
      return NextResponse.json(
        { error: "Graph list children failed", status: g.status, detail: js, url },
        { status: 502 }
      );
    }

    const folders = (js.value || [])
      .filter((it: any) => it.folder)  // only folders
      .map((it: any) => ({
        id: it.id,
        name: it.name,
        path: it.parentReference?.path || "",
        webUrl: it.webUrl
      }));

    return NextResponse.json({ folders });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
