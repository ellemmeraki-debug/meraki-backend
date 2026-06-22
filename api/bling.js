async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    const j = await r.json();
    return j.result ?? null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const [dia, mes, ano] = hojeStr.split('/');
  const dataHoje = `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
  const data = req.query.data || dataHoje;

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) {
    return res.status(401).json({ erro: 'Token ausente. Re-autorize via link de convite do Bling.' });
  }

  // Busca apenas página 1 (sem loop de paginação) para evitar timeout
  const path = `/Api/v3/contas/receber?pagina=1&limite=100&dataVencimentoInicial=${data}&dataVencimentoFinal=${data}`;

  let blingResp;
  try {
    const t0 = Date.now();
    const r = await fetch(`https://www.bling.com.br${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'MerakiDashboard/1.0'
      },
      signal: AbortSignal.timeout(7000)
    });
    const body = await r.text();
    blingResp = { status: r.status, body, ms: Date.now() - t0 };
  } catch (e) {
    return res.status(504).json({ erro: e.message, data });
  }

  if (blingResp.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
  if (blingResp.status !== 200) {
    return res.status(blingResp.status).json({ erro: `Bling ${blingResp.status}`, raw: blingResp.body.slice(0, 300) });
  }

  let json;
  try { json = JSON.parse(blingResp.body); }
  catch { return res.status(500).json({ erro: 'JSON invalido', raw: blingResp.body.slice(0, 300) }); }

  const items = json.data || [];
  const filtrados = items.filter(i =>
    (i.categoria?.descricao || '').toLowerCase().includes('porcelana decorada')
  );
  const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);

  return res.status(200).json({
    faturamento,
    pedidos: filtrados.length,
    data,
    debug: {
      total_na_pagina: items.length,
      bling_ms: blingResp.ms,
      categorias: [...new Set(items.map(i => i.categoria?.descricao || 'sem categoria'))].slice(0, 10)
    }
  });
}
