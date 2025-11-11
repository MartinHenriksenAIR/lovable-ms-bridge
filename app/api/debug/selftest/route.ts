export const runtime = "nodejs";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const have = (k: string) => Boolean(process.env[k] && process.env[k]!.length > 8);

  // AES-256-GCM roundtrip test for TOKEN_ENC_KEY
  let encryption_roundtrip_ok = false, encryption_error: string | null = null;
  try {
    const key = Buffer.from(process.env.TOKEN_ENC_KEY || "", "base64");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update("test", "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const raw = Buffer.concat([iv, tag, enc]); // iv|tag|ciphertext

    const iv2 = raw.subarray(0, 12), tag2 = raw.subarray(12, 28), enc2 = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv2);
    decipher.setAuthTag(tag2);
    const dec = Buffer.concat([decipher.update(enc2), decipher.final()]).toString("utf8");
    encryption_roundtrip_ok = (dec === "test");
  } catch (e: any) {
    encryption_error = String(e?.message || e);
  }

  return NextResponse.json({
    env_present: {
      MS_CLIENT_ID: have("MS_CLIENT_ID"),
      MS_CLIENT_SECRET: have("MS_CLIENT_SECRET"),
      MS_REDIRECT_URI: process.env.MS_REDIRECT_URI || null,
      LOVABLE_APP_URL: process.env.LOVABLE_APP_URL || null,
      SUPABASE_URL: process.env.SUPABASE_URL || null,
      SUPABASE_SERVICE_ROLE_KEY: have("SUPABASE_SERVICE_ROLE_KEY"),
      TOKEN_ENC_KEY_len: (process.env.TOKEN_ENC_KEY || "").length
    },
    encryption_roundtrip_ok,
    encryption_error
  });
}
