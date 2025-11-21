export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

async function getAccessToken(user_id: string, tenant_id: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const tokenRes = await fetch(`${base}/api/ms/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, tenant_id }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    throw new Error(`token fetch failed: ${txt}`);
  }

  const json = await tokenRes.json();
  return json.access_token as string;
}

export async function OPTIONS() {
  // CORS preflight (so Lovable frontend can call this)
  const res = NextResponse.json({}, { status: 200 });
  res.headers.set("Access-Control-Allow-Origin", process.env.LOVABLE_APP_URL || "*");
  res.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const {
      user_id,
      tenant_id,
      drive_id,
      parent_item_id, // folder where we create the new folder
      folder_name,
    } = await req.json();

    if (!user_id || !tenant_id || !drive_id || !parent_item_id || !folder_name) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, tenant_id, drive_id, parent_item_id, folder_name" },
        { status: 400 },
      );
    }

    const accessToken = await getAccessToken(user_id, tenant_id);

    // Create folder in Graph
    const graphUrl =
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(drive_id)}` +
      `/items/${encodeURIComponent(parent_item_id)}/children`;

    const createRes = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folder_name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename",
      }),
    });

    const txt = await createRes.text();
    if (!createRes.ok) {
      return NextResponse.json(
        { error: "Graph create folder failed", status: createRes.status, detail: txt },
        { status: 502 },
      );
    }

    const folder = JSON.parse(txt);

    // basic shape that Lovable needs to then call /folders/save
    const result = {
      drive_id,
      item_id: folder.id as string,
      display_name: folder.name as string,
      web_url: folder.webUrl as string,
    };

    const res = NextResponse.json({ ok: true, folder: result });
    res.headers.set("Access-Control-Allow-Origin", process.env.LOVABLE_APP_URL || "*");
    return res;
  } catch (e: any) {
    const res = NextResponse.json(
      { error: "create folder failed", detail: String(e?.message || e) },
      { status: 500 },
    );
    res.headers.set("Access-Control-Allow-Origin", process.env.LOVABLE_APP_URL || "*");
    return res;
  }
}
