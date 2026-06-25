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

  // Pega 3 registros da Nuvemshop Decorada (portador 14888102402)
  const listR = await fetch(
    'https://www.bling.com.br/Api/v3/contas/receber?pagina=30&limite=3&situacao=2&idPortador=14888102402',
    { headers, signal: AbortSignal.timeout(10000) }
  );
  const listBody = await listR.json();
  const ids = (listBody.data || []).map(r => r.id);

  // Busca detalhe do primeiro para ver categoria
  const results = [];
  for (const id of ids) {
    const dr = await fetch(`https://www.bling.com.br/Api/v3/contas/receber/${id}`,
      { headers, signal: AbortSignal.timeout(8000) });
    const d = await dr.json();
    const rec = d.data || d;
    results.push({
      id, valor: rec.valor, vencimento: rec.vencimento,
      contaContabil: rec.contaContabil,
      portador: rec.portador,
      categoria: rec.categoria
    });
  }

  return res.status(200).json({ nuvemshop_records: results });
}
