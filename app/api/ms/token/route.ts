export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken, getUserId } from "../_util";

/**
 * POST /api/ms/token
 * Body: { user_id: string, tenant_id: string }
 * Returns: { access_token, sharepoint: { tenantId, driveId, parentItemId } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const user_id = (body.user_id || getUserId(req) || "").trim();
    const tenant_id = (body.tenant_id || "").trim();

    if (!user_id || !tenant_id) {
      return NextResponse.json({ error: "Missing fields", need: ["user_id","tenant_id"] }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" },
        { status: 500 }
      );
    }

    // 1) Get a fresh Graph access token for this user+tenant
    const access_token = await refreshAccessToken(user_id, tenant_id);

    // 2) Pull the default folder (or the most recent one) for this user+tenant
    // First try is_default = true
    const qsDefault = new URLSearchParams({
      user_id: `eq.${user_id}`,
      tenant_id: `eq.${tenant_id}`,
      is_default: `eq.true`,
      select: "*",
      limit: "1",
      order: "updated_at.desc"
    }).toString();

    let r = await fetch(`${supabaseUrl}/rest/v1/sharepoint_folders?${qsDefault}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    let rows: any[] = await r.json();

    // Fallback: any folder for this user+tenant (newest)
    if (!Array.isArray(rows) || rows.length === 0) {
      const qsAny = new URLSearchParams({
        user_id: `eq.${user_id}`,
        tenant_id: `eq.${tenant_id}`,
        select: "*",
        limit: "1",
        order: "updated_at.desc"
      }).toString();
      r = await fetch(`${supabaseUrl}/rest/v1/sharepoint_folders?${qsAny}`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      rows = await r.json();
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "No saved folder for this user/tenant. Save one via /api/ms/folders/save first." },
        { status: 404 }
      );
    }

    const folder = rows[0];
    const driveId = folder.drive_id;
    const parentItemId = folder.item_id;

    return NextResponse.json({
      access_token,
      sharepoint: {
        tenantId: tenant_id,
        driveId,
        parentItemId
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
