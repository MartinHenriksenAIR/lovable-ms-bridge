import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Expecting these from the frontend
    const user_id: string | undefined = body.user_id;
    const tenant_id: string | undefined = body.tenant_id;
    const filename: string | undefined = body.filename;
    const project_id: string | undefined = body.project_id; // optional

    if (!user_id || !tenant_id) {
      return NextResponse.json(
        { error: 'user_id and tenant_id are required' },
        { status: 400 },
      );
    }

    const safeFilename = (filename || 'building-report').toString();

    // IMPORTANT: set this in your .env
    const webhookUrl = process.env.N8N_BYGGE_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'N8N_BYGGE_WEBHOOK_URL is not configured' },
        { status: 500 },
      );
    }

    // Forward to n8n webhook
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id,
        tenant_id,
        filename: safeFilename,
        project_id,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('n8n error:', resp.status, text);
      return NextResponse.json(
        { error: 'Failed to trigger n8n workflow', detail: text },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: 'Unexpected error', detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
