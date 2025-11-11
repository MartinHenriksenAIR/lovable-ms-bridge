export const runtime = "nodejs";
import crypto from "crypto";

// --- decrypt iv|tag|ciphertext (base64) from our callback storage ---
function decrypt(encB64: string) {
  const raw = Buffer.from(encB64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const key = Buffer.from(process.env.TOKEN_ENC_KEY!, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function refreshAccessToken(user_id: string, tenant_id: string) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const qs = new URLSearchParams({
    user_id: `eq.${user_id}`,
    tenant_id: `eq.${tenant_id}`
  }).toString();

  const r = await fetch(`${supabaseUrl}/rest/v1/sharepoint_connections?${qs}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  });
  const rows = await r.json();
  const row = rows?.[0];
  if (!row) throw new Error("No Microsoft connection found for this user/tenant.");

  const refresh_token = decrypt(row.refresh_token_enc);

  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    client_secret: process.env.MS_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token,
    redirect_uri: process.env.MS_REDIRECT_URI!
  });

  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok) throw new Error("Refresh failed: " + JSON.stringify(token));

  return token.access_token as string;
}

export function getUserId(req: Request) {
  // Dev: hardcode your UUID; Prod: pass real user id in 'x-user-id' header or session
  return (req.headers.get("x-user-id") || "1387b241-a55e-45e6-a091-072f64f8ffea").trim();
}
