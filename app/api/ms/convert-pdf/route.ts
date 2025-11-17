export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

// --------------------------------------
// Small helpers
// --------------------------------------
function getBaseUrl() {
  // We used this pattern before – update if you have a different env name
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
    throw new Error(
      `Supabase folder fetch failed: ${resp.status} ${txt}`
    );
  }

  const rows = JSON.parse(txt);
  if (!rows.length) {
    throw new Error("No default SharePoint folder found for this user/tenant");
  }
  return rows[0];
}

// Build a Graph path safely encoded: root:/Bygge%20Test%20Folder/file.docx:/content
function buildGraphPath(display_path: string, filename: string) {
  // display_path e.g. "/Bygge Test Folder"
  const trimmed = (display_path || "").replace(/^\/+/, ""); // remove leading slash
  const pieces = trimmed ? trimmed.split("/") : [];
  pieces.push(filename); // append filename

  const encoded = pieces
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join("/");

  // We only want the part after root:/
  return `root:/${encoded}:/content`;
}

// --------------------------------------
// Main handler
// --------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null as any);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const user_id = (body.user_id || "").trim();
    const tenant_id = (body.tenant_id || "").trim();
    const filename = (body.filename || "").trim(); // DOCX filename in SharePoint

    if (!user_id || !tenant_id || !filename) {
      return NextResponse.json(
        { error: "Missing fields: user_id, tenant_id, filename are required" },
        { status: 400 }
      );
    }

    // Make sure filename has .docx
    const docxName = filename.toLowerCase().endsWith(".docx")
      ? filename
      : `${filename}.docx`;

    // --------------------------------------
    // 1) Get token
    // --------------------------------------
    const accessToken = await getAccessToken(user_id, tenant_id);

    // --------------------------------------
    // 2) Get default folder from Supabase
    // --------------------------------------
    const folderRow = await getDefaultFolderRow(user_id, tenant_id);
    const drive_id = folderRow.drive_id as string;
    const display_path = (folderRow.display_path as string) || "";

    if (!drive_id) {
      throw new Error("default folder row missing drive_id");
    }

    // --------------------------------------
    // 3) Download PDF bytes from Graph
    //    GET /drives/{drive_id}/root:/path/file.docx:/content?format=pdf
    // --------------------------------------
    const graphPathDocx = buildGraphPath(display_path, docxName);

    const pdfResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        drive_id
      )}/${graphPathDocx}?format=pdf`,
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
    // 4) Upload PDF to same folder with .pdf extension
    //    PUT /drives/{drive_id}/root:/path/file.pdf:/content
    // --------------------------------------
    const pdfName = docxName.replace(/\.docx$/i, ".pdf");
    const graphPathPdf = buildGraphPath(display_path, pdfName);

    const uploadResp = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        drive_id
      )}/${graphPathPdf}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/pdf",
        },
        body: pdfBuffer,
      }
    );

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

    // Graph returns driveItem JSON for the uploaded PDF
    let pdfItem: any = null;
    try {
      pdfItem = JSON.parse(uploadTxt);
    } catch {
      // ignore parse error, still return raw text
    }

    return NextResponse.json({
      ok: true,
      docx_name: docxName,
      pdf_name: pdfName,
      drive_id,
      display_path,
      pdf_item: pdfItem ?? uploadTxt,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
