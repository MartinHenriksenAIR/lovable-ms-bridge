export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

/**
 * Usage:
 *   /api/auth/ms/login?uid=YOUR_LOVABLE_USER_ID
 *   /api/auth/ms/login?uid=...&force=1   // forces Microsoft account picker
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const uid   = (params.get("uid") || "").trim(); // Lovable/n8n user_id to bind connection to
  const force = params.get("force") === "1";       // force account picker

  const clientId = process.env.MS_CLIENT_ID!;
  const redirect = process.env.MS_REDIRECT_URI!;

  const scopes = [
    "offline_access",
    "Files.ReadWrite",
    "Sites.Read.All",
    "User.Read",
  ].join(" ");

  // carry uid in the state param (base64-encoded JSON)
  const stateObj = { csrf: "csrf123", uid };
  const state    = Buffer.from(JSON.stringify(stateObj)).toString("base64");

  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  if (force) url.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(url.toString());
}
