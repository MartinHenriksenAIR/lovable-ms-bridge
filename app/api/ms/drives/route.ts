export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken, getUserId } from "../_util";

export async function GET(req: NextRequest) {
  const user_id = getUserId(req);
  const tenant_id = req.nextUrl.searchParams.get("tenantId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!tenant_id || !siteId) {
    return NextResponse.json({ error: "tenantId and siteId required" }, { status: 400 });
  }

  try {
    // Ensure we can get a fresh token
    const access = await refreshAccessToken(user_id, tenant_id);

    // Primary: list document libraries (drives) for the site
    const url = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drives`;
    const g = await fetch(url, {
      headers: { Authorization: `Bearer ${access}`, Accept: "application/json" }
    });

    const txt = await g.text();
    let js: any;
    try { js = JSON.parse(txt); } catch { js = { raw: txt }; }

    if (!g.ok) {
      return NextResponse.json(
        { error: "Graph drives query failed", status: g.status, detail: js },
        { status: 502 }
      );
    }

    const drives = (js.value || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      driveType: d.driveType,
      webUrl: d.webUrl
    }));

    return NextResponse.json({ drives });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
