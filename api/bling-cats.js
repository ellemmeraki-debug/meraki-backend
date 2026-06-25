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
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

  const CATEGORIA_ID = '14633100460'; // Recebimentos Porcelana Decorada
  const prefixo = '2026-06';
  let total = 0, registros = 0;
  const debug = [];

  for (let p = 1; p <= 50; p++) {
    const r = await fetch(
      `https://www.bling.com.br/Api/v3/contas/receber?pagina=${p}&limite=100&situacao=2&idCategoria=${CATEGORIA_ID}`,
      { headers, signal: AbortSignal.timeout(12000) }
    );
    const body = await r.json();
    const items = body.data || [];
    if (items.length === 0) { debug.push(`p${p}: vazio (fim)`); break; }
    
    const first = items[0].vencimento;
    const last  = items[items.length-1].vencimento;
    debug.push(`p${p}: ${first}..${last} (${items.length} items)`);
    
    for (const item of items) {
      if ((item.vencimento||'').startsWith(prefixo)) {
        total += parseFloat(item.valor) || 0;
        registros++;
      }
    }
    if (items.length < 100) break;
  }

  return res.status(200).json({
    categoria_id: CATEGORIA_ID,
    mes: '06/2026',
    faturamento: Math.round(total * 100) / 100,
    registros,
    debug
  });
}
