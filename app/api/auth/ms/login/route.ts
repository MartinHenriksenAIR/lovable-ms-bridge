export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,              // from your .env.local
    response_type: "code",
    redirect_uri: process.env.MS_REDIRECT_URI!,        // must match Azure Redirect URI
    response_mode: "query",
    scope: "offline_access Sites.Read.All Files.ReadWrite",
    state: "csrf123"                                   // replace with real state/CSRF later
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  );
}
