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

  const CATEGORIA_ID = '14633100460';
  const probe = [202, 205, 208, 211, 214, 217, 220, 223, 226, 230];
  const debug = [];

  for (const p of probe) {
    try {
      const r = await fetch(
        `https://www.bling.com.br/Api/v3/contas/receber?pagina=${p}&limite=100&situacao=2&idCategoria=${CATEGORIA_ID}`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      const body = await r.json();
      const items = body.data || [];
      if (items.length === 0) { debug.push(`p${p}: VAZIO`); break; }
      const junhoCount = items.filter(i => (i.vencimento||'').startsWith('2026-06')).length;
      debug.push(`p${p}: ${items[0].vencimento}..${items[items.length-1].vencimento} | junho: ${junhoCount}`);
    } catch(e) {
      debug.push(`p${p}: ERRO ${e.message}`);
    }
  }

  return res.status(200).json({ debug });
}
