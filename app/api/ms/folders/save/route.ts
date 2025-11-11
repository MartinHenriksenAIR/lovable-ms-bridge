export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  // If you hit GET on this route, you *should* get 405 (method not allowed),
  // which proves the route exists and Next.js sees it.
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      user_id,          // required
      tenant_id,        // required
      site_id,
      site_name,
      drive_id,         // required
      drive_name,
      item_id,          // required (folder item id)
      display_name,     // required
      display_path = "",
      web_url,
      is_default = true
    } = body || {};

    if (!user_id || !tenant_id || !drive_id || !item_id || !display_name) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, tenant_id, drive_id, item_id, display_name" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" },
        { status: 500 }
      );
    }

    // Optional: clear any existing default for this user/tenant
    if (is_default) {
      const qs = new URLSearchParams({
        user_id: `eq.${user_id}`,
        tenant_id: `eq.${tenant_id}`
      }).toString();
      await fetch(`${supabaseUrl}/rest/v1/sharepoint_folders?${qs}`, {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ is_default: false })
      });
    }

    // Upsert the chosen folder (unique on user_id, tenant_id, drive_id, item_id)
    const url = `${supabaseUrl}/rest/v1/sharepoint_folders?on_conflict=user_id,tenant_id,drive_id,item_id`;
    const upsert = await fetch(url, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify({
        user_id,
        tenant_id,
        site_id,
        site_name,
        drive_id,
        drive_name,
        item_id,
        display_name,
        display_path,
        web_url,
        is_default
      })
    });

    const txt = await upsert.text();
    if (!upsert.ok) {
      return NextResponse.json({ error: "Upsert folder failed", detail: txt }, { status: 502 });
    }

    return NextResponse.json({ ok: true, row: JSON.parse(txt)[0] || null });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
