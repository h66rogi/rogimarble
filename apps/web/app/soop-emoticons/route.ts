const catalogUrl = 'https://st.sooplive.com/api/emoticons.php';
const signatureUrl = 'https://live.sooplive.com/api/signature_emoticon_api.php';

export async function GET(request: Request) {
  try {
    const channelId = new URL(request.url).searchParams.get('channelId');
    if (channelId && !/^[A-Za-z0-9_-]{1,50}$/.test(channelId)) {
      return Response.json({ error: 'Invalid channel' }, { status: 400 });
    }
    const upstream = await fetch(catalogUrl, {
      headers: { Referer: 'https://play.sooplive.com/' },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    });
    if (!upstream.ok) return Response.json({ error: 'SOOP catalog unavailable' }, { status: 502 });
    const catalog = await upstream.json();
    if (catalog?.result !== 1 || !catalog?.data?.default?.groups) {
      return Response.json({ error: 'Invalid SOOP catalog' }, { status: 502 });
    }
    let signature = null;
    if (channelId) {
      const response = await fetch(signatureUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://play.sooplive.com/' },
        body: new URLSearchParams({ work: 'list', v: 'tier', szBjId: channelId }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (response?.ok) {
        const result = await response.json().catch(() => null);
        if (result?.result === 1) signature = result;
      }
    }
    return Response.json({ ...catalog, signature }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch {
    return Response.json({ error: 'SOOP catalog unavailable' }, { status: 502 });
  }
}
