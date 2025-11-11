import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');
  const tenantId = searchParams.get('tenantId');
  const siteId = searchParams.get('siteId');
  const driveId = searchParams.get('driveId');
  const itemId = searchParams.get('itemId') || 'root';

  if (!uid || !tenantId || !siteId || !driveId)
    return NextResponse.json({ error: 'uid, tenantId, siteId, driveId required' }, { status: 400 });

  // fetch an access token via your own token endpoint
  const tokenResp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ms/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: uid, tenant_id: tenantId }),
    cache: 'no-store',
  });
  const tokenJson = await tokenResp.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) return NextResponse.json({ error: 'no access_token' }, { status: 500 });

  const graphUrl = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drives/${encodeURIComponent(driveId)}/${itemId === 'root' ? 'root' : `items/${encodeURIComponent(itemId)}`}/children`;

  const r = await fetch(graphUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!r.ok) {
    const t = await r.text();
    return NextResponse.json({ error: 'graph_error', detail: t }, { status: r.status });
  }
  const data = await r.json();
  return NextResponse.json(data);
}
