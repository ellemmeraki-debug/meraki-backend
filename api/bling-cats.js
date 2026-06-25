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

  const situacao = req.query.situacao || '2';
  const pagina   = req.query.pagina   || '1';
  const di       = req.query.di       || '2026-06-01';
  const df       = req.query.df       || '2026-06-30';

  const url = `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100&situacao=${situacao}&dataVencimentoInicial=${di}&dataVencimentoFinal=${df}`;

  const t0 = Date.now();
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  const ms = Date.now() - t0;

  const body = await r.json();
  const items = body.data || [];

  return res.status(200).json({
    url,
    status: r.status,
    ms,
    total_items: items.length,
    datas: items.slice(0, 5).map(i => ({ id: i.id, vencimento: i.vencimento, valor: i.valor })),
    primeiro: items[0]?.vencimento,
    ultimo: items[items.length - 1]?.vencimento
  });
}
