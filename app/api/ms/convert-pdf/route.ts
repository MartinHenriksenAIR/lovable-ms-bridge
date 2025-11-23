export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

// --------------------------------------
// Small helpers (unchanged)
// --------------------------------------
function getBaseUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL;
  if (!fromEnv) return "http://localhost:3000";
  if (fromEnv.startsWith("http")) return fromEnv;
  return `https://${fromEnv}`;
}

async function getAccessToken(user_id: string, tenant_id: string) {
  const baseUrl = getBaseUrl();

  const resp = await fetch(`${baseUrl}/api/ms/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, tenant_id }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`token endpoint failed: ${resp.status} ${txt}`);
  }

  const json = await resp.json();
  const token = json.access_token as string;
  if (!token) throw new Error("token endpoint did not return access_token");
  return token;
}

async function getDefaultFolderRow(user_id: string, tenant_id: string) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
  }

  const qs = new URLSearchParams({
    user_id: `eq.${user_id}`,
    tenant_id: `eq.${tenant_id}`,
    is_default: "eq.true",
    limit: "1",
  }).toString();

  const resp = await fetch(`${supabaseUrl}/rest/v1/sharepoint_folders?${qs}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });

  const txt = await resp.text();
  if (!resp.ok) {
    throw new Error(`Supabase folder fetch failed: ${resp.status} ${txt}`);
  }

  const rows = JSON.parse(txt);
  if (!rows.length) {
    throw new Error("No default SharePoint folder found for this user/tenant");
  }
  return rows[0];
}

// --------------------------------------
// Main handler (UPDATED to item_id)
// --------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null as any);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const user_id = (body.user_id || "").trim();
    const tenant_id = (body.tenant_id || "").trim();
    const item_id = (body.item_id || "").trim();      // <-- REQUIRED NOW
    let drive_id = (body.drive_id || "").trim();      // <-- SHOULD BE SENT FROM n8n
    const filenameOverride = (body.filename || "").trim(); // optional fallback naming

    if (!user_id || !tenant_id || !item_id) {
      return NextResponse.json(
        { error: "Missing fields: user_id, tenant_id, item_id are required" },
        { status: 400 }
      );
    }

    // --------------------------------------
    // 1) Get token
    // --------------------------------------
    const accessToken = await getAccessToken(user_id, tenant_id);

    // --------------------------------------
    // 2) Resolve drive_id
    // Prefer request drive_id, else fallback to default folder row (old behavior)
    // --------------------------------------
    if (!drive_id) {
      const folderRow = await getDefaultFolderRow(user_id, tenant_id);
      drive_id = folderRow.drive_id as string;
      if (!drive_id) throw new Error("default folder row missing drive_id");
    }

    // --------------------------------------
    // 3) Fetch DOCX item metadata (name + parent folder)
    //    GET /drives/{drive_id}/items/{item_id}
    // --------------------------------------
    const itemResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        drive_id
      )}/items/${encodeURIComponent(item_id)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const itemTxt = await itemResp.text();
    if (!itemResp.ok) {
      return NextResponse.json(
        {
          error: "Graph item lookup failed",
          status: itemResp.status,
          detail: itemTxt,
        },
        { status: 502 }
      );
    }

    const docxItem = JSON.parse(itemTxt);
    const docxNameRaw: string =
      filenameOverride || docxItem?.name || "document.docx";

    const docxName = docxNameRaw.toLowerCase().endsWith(".docx")
      ? docxNameRaw
      : `${docxNameRaw}.docx`;

    const pdfName = docxName.replace(/\.docx$/i, ".pdf");

    const parentId: string | undefined = docxItem?.parentReference?.id;
    if (!parentId) {
      throw new Error("DOCX item missing parentReference.id (cannot upload PDF)");
    }

    // --------------------------------------
    // 4) Download converted PDF bytes
    //    GET /drives/{drive_id}/items/{item_id}/content?format=pdf
    // --------------------------------------
    const pdfResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        drive_id
      )}/items/${encodeURIComponent(item_id)}/content?format=pdf`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!pdfResp.ok) {
      const txt = await pdfResp.text();
      return NextResponse.json(
        {
          error: "Graph convert-to-PDF failed",
          status: pdfResp.status,
          detail: txt,
        },
        { status: 502 }
      );
    }

    const pdfArrayBuffer = await pdfResp.arrayBuffer();
    const pdfBuffer = Buffer.from(pdfArrayBuffer);

    // --------------------------------------
    // 5) Upload PDF to SAME parent folder
    //    PUT /drives/{drive_id}/items/{parentId}:/{pdfName}:/content
    // --------------------------------------
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
      drive_id
    )}/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(
      pdfName
    )}:/content`;

    const uploadResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/pdf",
      },
      body: pdfBuffer,
    });

    const uploadTxt = await uploadResp.text();
    if (!uploadResp.ok) {
      return NextResponse.json(
        {
          error: "Graph PDF upload failed",
          status: uploadResp.status,
          detail: uploadTxt,
        },
        { status: 502 }
      );
    }

    let pdfItem: any = null;
    try {
      pdfItem = JSON.parse(uploadTxt);
    } catch {
      // ignore parse error
    }

    return NextResponse.json({
      ok: true,
      docx_name: docxName,
      pdf_name: pdfName,
      drive_id,
      parent_id: parentId,
      docx_item: docxItem,
      pdf_item: pdfItem ?? uploadTxt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
