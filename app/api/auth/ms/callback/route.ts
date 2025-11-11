export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/** ----- AES-256-GCM helpers for token encryption ----- */
function getKey() {
  // TOKEN_ENC_KEY must be base64 of 32 raw bytes
  const b64 = process.env.TOKEN_ENC_KEY || "";
  if (!b64) throw new Error("TOKEN_ENC_KEY missing");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("Invalid TOKEN_ENC_KEY length (need 32 bytes)");
  return key;
}
function aeadEncrypt(plaintext: string) {
  const key = getKey();
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64"); // iv|tag|ciphertext
}

/** ----- OAuth callback ----- */
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl;
    const code = url.searchParams.get("code");
    const stateB64 = url.searchParams.get("state") || "";

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    // extract uid from state (if present)
    let user_id = "";
    try {
      const st = JSON.parse(Buffer.from(stateB64, "base64").toString("utf8"));
      user_id = (st?.uid || "").trim();
    } catch {
      /* ignore */
    }
    // optional dev fallback (remove if you never want a default):
    if (!user_id) {
      user_id = "1387b241-a55e-45e6-a091-072f64f8ffea";
    }

    const clientId     = process.env.MS_CLIENT_ID!;
    const clientSecret = process.env.MS_CLIENT_SECRET!;
    const redirectUri  = process.env.MS_REDIRECT_URI!;
    const supabaseUrl  = process.env.SUPABASE_URL!;
    const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const lovableUrl   = process.env.LOVABLE_APP_URL!; // where to send user after success

    // 1) Exchange auth code → tokens
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      return NextResponse.json({ error: "token exchange failed", detail: tokenJson }, { status: 400 });
    }

    const access_token  = tokenJson.access_token as string;
    const refresh_token = tokenJson.refresh_token as string;
    const expires_in    = Number(tokenJson.expires_in || 3600);

    // 2) Read tenant (tid) + oid from access token (JWT)
    const [, payloadB64] = access_token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8"));
    const tenant_id = payload.tid as string;
    const oid       = payload.oid as string;

    const expires_at = new Date(Date.now() + (expires_in - 120) * 1000).toISOString();

    // 3) Encrypt and upsert connection into Supabase
    const access_token_enc  = aeadEncrypt(access_token);
    const refresh_token_enc = aeadEncrypt(refresh_token);

    // unique constraint assumed on (user_id, tenant_id, oid)
    const upsertUrl = `${supabaseUrl}/rest/v1/sharepoint_connections?on_conflict=user_id,tenant_id,oid`;
    const upsert = await fetch(upsertUrl, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id,
        tenant_id,
        oid,
        access_token_enc,
        refresh_token_enc,
        expires_at,
      }),
    });

    const txt = await upsert.text();
    if (!upsert.ok) {
      return NextResponse.json({ error: "Supabase upsert failed", detail: txt }, { status: 500 });
    }

    // 4) Redirect user back to your Lovable app (signals success to UI)
    const redirect = new URL("/integrations/microsoft", lovableUrl);
    redirect.searchParams.set("connected", "1");
    redirect.searchParams.set("tenant_id", tenant_id);
    return NextResponse.redirect(redirect.toString());
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
