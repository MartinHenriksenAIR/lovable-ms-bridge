export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/ms/upload
 *
 * JSON body:
 * {
 *   "user_id": "uuid",                  // required
 *   "tenant_id": "tenant-guid",         // required (for now)
 *   "docx_url": "https://...",          // required: URL to the DOCX file
 *   "filename": "MyReport.docx",        // required: how it should be named in SharePoint
 *
 *   // Optional overrides (normally taken from default folder)
 *   "drive_id": "b!....",
 *   "parent_item_id": "01WNW..."
 * }
 *
 * Behavior:
 *  - Calls /api/ms/token to get a fresh access_token and default SharePoint folder
 *  - Downloads the DOCX from docx_url
 *  - Uploads it to Microsoft Graph in the chosen folder
 *  - Returns the Graph DriveItem JSON
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    let {
      user_id,
      tenant_id,
      docx_url,
      filename,
      drive_id,
      parent_item_id,
    } = body as {
      user_id?: string;
      tenant_id?: string;
      docx_url?: string;
      filename?: string;
      drive_id?: string;
      parent_item_id?: string;
    };

    user_id = (user_id || "").trim();
    tenant_id = (tenant_id || "").trim();
    docx_url = (docx_url || "").trim();
    filename = (filename || "").trim();

    if (!user_id || !tenant_id || !docx_url || !filename) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: user_id, tenant_id, docx_url, filename",
        },
        { status: 400 }
      );
    }

    // 1) Call our own /api/ms/token to get access_token + default folder
    const origin = req.nextUrl.origin; // e.g., https://lovable-ms-bridge.vercel.app

    const tokenResp = await fetch(`${origin}/api/ms/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ user_id, tenant_id }),
    });

    const tokenJson = await tokenResp.json().catch(() => null);

    if (!tokenResp.ok || !tokenJson || !tokenJson.access_token) {
      return NextResponse.json(
        {
          error: "Failed to get Microsoft token from /api/ms/token",
          detail: tokenJson || null,
        },
        { status: 502 }
      );
    }

    const access_token = String(tokenJson.access_token);

    // Prefer overrides from body, otherwise use the sharepoint.default folder
    const sp = tokenJson.sharepoint || {};
    const driveId = drive_id || sp.driveId;
    const parentItemId = parent_item_id || sp.parentItemId;

    if (!driveId || !parentItemId) {
      return NextResponse.json(
        {
          error:
            "No SharePoint folder configured. Either set a default in sharepoint_folders or pass drive_id + parent_item_id.",
        },
        { status: 500 }
      );
    }

    // 2) Download the DOCX from docx_url
    const docxResp = await fetch(docx_url);

    if (!docxResp.ok) {
      const text = await docxResp.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Failed to download DOCX from docx_url",
          status: docxResp.status,
          detail: text.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const arrayBuffer = await docxResp.arrayBuffer();
    const docxBuffer = Buffer.from(arrayBuffer);

    // 3) Upload to Microsoft Graph
    const encodedName = encodeURIComponent(filename);
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
      driveId
    )}/items/${encodeURIComponent(
      parentItemId
    )}:/${encodedName}:/content`;

    const graphResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      body: docxBuffer,
    });

    const graphText = await graphResp.text().catch(() => "");

    if (!graphResp.ok) {
      let detail: any = graphText;
      try {
        detail = JSON.parse(graphText);
      } catch {
        // leave as text
      }

      return NextResponse.json(
        {
          error: "Failed to upload DOCX to SharePoint",
          status: graphResp.status,
          detail,
        },
        { status: 502 }
      );
    }

    // Successful upload: Graph returns a DriveItem JSON
    let driveItem: any = {};
    try {
      driveItem = JSON.parse(graphText);
    } catch {
      driveItem = { raw: graphText };
    }

    return NextResponse.json(driveItem);
  } catch (e: any) {
    return NextResponse.json(
      { error: "Unexpected server error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
