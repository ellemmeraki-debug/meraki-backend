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

  // Pega lista de registros na página 30 (tem junho 2026)
  const listR = await fetch(
    'https://www.bling.com.br/Api/v3/contas/receber?pagina=30&limite=5&situacao=2',
    { headers, signal: AbortSignal.timeout(10000) }
  );
  const listBody = await listR.json();
  const firstId = listBody.data?.[0]?.id;

  if (!firstId) return res.status(200).json({ erro: 'Sem registros', listBody });

  // Busca o registro completo pelo ID
  const detailR = await fetch(
    `https://www.bling.com.br/Api/v3/contas/receber/${firstId}`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  const detail = await detailR.json();

  return res.status(200).json({ id: firstId, full_record: detail });
}
