async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente' });

  const pagina = req.query.pagina || '26';
  const url = `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100&situacao=2&idPortador=14888102402`;

  const t0 = Date.now();
  let r;
  try {
    r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
  } catch(e) {
    return res.status(200).json({ erro: e.message, ms: Date.now() - t0 });
  }
  const ms = Date.now() - t0;

  if (r.status === 401) return res.status(200).json({ erro: 'Token expirado (401)', ms });

  const body = await r.json();
  const items = body.data || [];
  return res.status(200).json({
    pagina, status: r.status, ms,
    count: items.length,
    primeiro: items[0]?.vencimento,
    ultimo: items[items.length-1]?.vencimento
  });
}
