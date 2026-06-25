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

  // Testa vários endpoints de categorias para achar o certo
  const endpoints = [
    '/Api/v3/categorias/receitas',
    '/Api/v3/planosContas',
    '/Api/v3/planoContas',
    '/Api/v3/categorias',
  ];

  const results = {};
  for (const ep of endpoints) {
    try {
      const r = await fetch(`https://www.bling.com.br${ep}?pagina=1&limite=5`, {
        headers, signal: AbortSignal.timeout(6000)
      });
      const body = await r.json();
      results[ep] = { status: r.status, data: body };
    } catch(e) {
      results[ep] = { erro: e.message };
    }
  }

  // Também pega um registro de contas a receber para ver os campos de categoria
  const rc = await fetch(
    'https://www.bling.com.br/Api/v3/contas/receber?pagina=30&limite=1&situacao=2&idPortador=14888102402',
    { headers, signal: AbortSignal.timeout(8000) }
  );
  const rcBody = await rc.json();
  const sample = rcBody.data?.[0] || null;

  return res.status(200).json({ endpoints: results, sample_record: sample });
}
