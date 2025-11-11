export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "../_util";

export async function GET(req: NextRequest) {
  try {
    const user_id = getUserId(req);
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const qs = new URLSearchParams({ user_id: `eq.${user_id}` }).toString();
    const r = await fetch(`${supabaseUrl}/rest/v1/sharepoint_connections?${qs}&select=tenant_id,oid`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    const rows = await r.json();

    const tenants = Array.from(new Set(rows.map((x: any) => x.tenant_id)));
    return NextResponse.json({ user_id, tenants, rows });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
