async function kvGet(url, token, key) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal
    });
    const data = await r.json();
    return data.result;
  } finally {
    clearTimeout(t);
  }
}

async function kvSet(url, token, key, value) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(`${url}/set/${key}/${encodeURIComponent(value)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal
    });
  } finally {
    clearTimeout(t);
  }
}

async function getAccessToken() {
  const CLIENT_ID     = process.env.BLING_CLIENT_ID;
  const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
  const KV_URL        = process.env.KV_REST_API_URL;
  const KV_TOKEN      = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) throw new Error(`KV não configurado. KV_URL=${KV_URL ? 'ok' : 'FALTANDO'}`);

  const refreshToken = await kvGet(KV_URL, KV_TOKEN, 'bling_refresh_token');
  if (!refreshToken) throw new Error('Nenhum token no Redis. Acesse /api/callback via link de convite do Bling.');

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  let data;
  try {
    const resp = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '1.0'
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      signal: ctrl.signal
    });
    data = await resp.json();
    if (!resp.ok) throw new Error(`Bling token error: ${JSON.stringify(data)}`);
  } finally {
    clearTimeout(t);
  }

  await kvSet(KV_URL, KV_TOKEN, 'bling_refresh_token', data.refresh_token);
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

  const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const [dia, mes, ano] = hojeStr.split('/');
  const dataHoje = `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
  const data = req.query.data || dataHoje;

  try {
    const accessToken = await getAccessToken();
    let pagina = 1, todos = [];

    while (true) {
      const url = new URL('https://www.bling.com.br/Api/v3/contas/receber');
      url.searchParams.set('pagina', pagina);
      url.searchParams.set('limite', 100);
      url.searchParams.set('dataVencimentoInicial', data);
      url.searchParams.set('dataVencimentoFinal', data);

      const resp = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return res.status(resp.status).json({ erro: `Bling API: ${txt}` });
      }
      const json = await resp.json();
      const items = json.data || [];
      todos = todos.concat(items);
      if (items.length < 100) break;
      pagina++;
    }

    const filtrados = todos.filter(i =>
      (i.categoria?.descricao || '').toLowerCase().includes('porcelana decorada')
    );
    const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);

    return res.status(200).json({ faturamento, pedidos: filtrados.length, data });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
