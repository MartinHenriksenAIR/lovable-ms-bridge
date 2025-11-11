export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// --- AES-256-GCM helpers (TOKEN_ENC_KEY must be 32 bytes, base64 in .env.local) ---
function getKey() {
  return Buffer.from(process.env.TOKEN_ENC_KEY!, "base64");
}
function aeadEncrypt(plaintext: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store iv|tag|ciphertext as one base64 string
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // 1) Exchange authorization code → tokens
  const tokenBody = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    client_secret: process.env.MS_CLIENT_SECRET!,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.MS_REDIRECT_URI!
  });

  const tokenRes = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody
    }
  );

  const tokenText = await tokenRes.text();
  let tokenJson: any;
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    tokenJson = { raw: tokenText };
  }
  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: "Token exchange failed", detail: tokenJson },
      { status: 400 }
    );
  }

  const access_token = tokenJson.access_token as string;
  const refresh_token = tokenJson.refresh_token as string;
  const expires_in = tokenJson.expires_in as number;

  // 2) Decode access token (JWT) to get tenant id (tid) + user object id (oid)
  const [, payloadB64] = access_token.split(".");
  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64").toString("utf8")
  );
  const tid = payload.tid as string;
  const oid = payload.oid as string;

  // TODO: replace this with your real Lovable user id from session/cookie/JWT.
  // (Header fallback allows you to pass it later via fetch(..., { headers: { 'x-user-id': '...' } }))
  const user_id =
    req.headers.get("x-user-id") ||
    "40d98392-261c-4cf6-a4f0-1a28234aa079"; // <-- your dev UUID

  const expires_at = new Date(
    Date.now() + (expires_in - 120) * 1000
  ).toISOString();

  // 3) Encrypt tokens
  const access_token_enc = aeadEncrypt(access_token);
  const refresh_token_enc = aeadEncrypt(refresh_token);

  // 4) Upsert in Supabase (robust): POST upsert w/ on_conflict → PATCH on duplicate
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const record = {
    user_id,
    tenant_id: tid,
    oid,
    access_token_enc,
    refresh_token_enc,
    expires_at
  };

  // Try POST upsert (multi-column unique via on_conflict)
  const postUrl = `${supabaseUrl}/rest/v1/sharepoint_connections?on_conflict=user_id,tenant_id,oid`;
  let upsert = await fetch(postUrl, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      // resolution=merge-duplicates enables upsert; return=representation is helpful when debugging
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(record)
  });

  if (!upsert.ok) {
    const txt = await upsert.text();
    const duplicate =
      upsert.status === 409 ||
      txt.includes("duplicate key value") ||
      txt.includes("23505");

    if (duplicate) {
      // Row exists → PATCH (update tokens/expiry)
      const qs = new URLSearchParams({
        user_id: `eq.${user_id}`,
        tenant_id: `eq.${tid}`,
        oid: `eq.${oid}`
      }).toString();

      const patchUrl = `${supabaseUrl}/rest/v1/sharepoint_connections?${qs}`;
      const patch = await fetch(patchUrl, {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          access_token_enc,
          refresh_token_enc,
          expires_at
        })
      });

      if (!patch.ok) {
        const ptxt = await patch.text();
        return NextResponse.json(
          {
            error: "Supabase PATCH failed",
            status: patch.status,
            response: ptxt
          },
          { status: 500 }
        );
      }
      // PATCH OK → continue to redirect
    } else {
      // Another error (not duplicate) → surface details
      return NextResponse.json(
        { error: "Supabase upsert failed", status: upsert.status, detail: txt },
        { status: 500 }
      );
    }
  }
  // POST upsert OK or PATCH succeeded → finalize

  // 5) Redirect the user back to your Lovable app
  const base = (process.env.LOVABLE_APP_URL || "").replace(/\/+$/, "");
  const to = `${base}/integrations/microsoft?connected=1`;
  return NextResponse.redirect(to);
}
