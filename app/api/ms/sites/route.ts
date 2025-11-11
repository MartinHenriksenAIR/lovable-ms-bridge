export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken, getUserId } from "../_util";

export async function GET(req: NextRequest) {
  const user_id = getUserId(req);
  const tenant_id = req.nextUrl.searchParams.get("tenantId");
  if (!tenant_id) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  try {
    const access = await refreshAccessToken(user_id, tenant_id);

    // Primary: broad search (needs ConsistencyLevel header)
    let url = "https://graph.microsoft.com/v1.0/sites?search=*";
    let g = await fetch(url, {
      headers: {
        Authorization: `Bearer ${access}`,
        "ConsistencyLevel": "eventual",
        Accept: "application/json"
      }
    });
    let txt = await g.text();
    let js: any;
    try { js = JSON.parse(txt); } catch { js = { raw: txt }; }

    if (!g.ok) {
      // Fallback: root site + subsites (works in many tenants)
      const root = await fetch("https://graph.microsoft.com/v1.0/sites/root", {
        headers: { Authorization: `Bearer ${access}`, Accept: "application/json" }
      });
      const rootJs = await root.json();

      const subs = await fetch("https://graph.microsoft.com/v1.0/sites/root/sites?$top=200", {
        headers: { Authorization: `Bearer ${access}`, Accept: "application/json" }
      });
      const subsJs = await subs.json();

      if (root.ok) {
        const sites = [
          {
            id: rootJs.id,
            name: rootJs.name || rootJs.displayName,
            displayName: rootJs.displayName || rootJs.name,
            webUrl: rootJs.webUrl
          },
          ...((subsJs.value || []).map((s: any) => ({
            id: s.id,
            name: s.name || s.displayName,
            displayName: s.displayName || s.name,
            webUrl: s.webUrl
          })))
        ];
        return NextResponse.json({ sites, note: "search fallback used", errorFromSearch: js }, { status: 200 });
      }

      return NextResponse.json(
        { error: "Graph sites search failed", status: g.status, detail: js },
        { status: 502 }
      );
    }

    const sites = (js.value || []).map((s: any) => ({
      id: s.id, // "{hostname},{siteId}" form
      name: s.name || s.displayName,
      displayName: s.displayName || s.name,
      webUrl: s.webUrl
    }));

    return NextResponse.json({ sites });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
