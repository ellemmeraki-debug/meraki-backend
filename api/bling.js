async function getAccessToken() {
  const CLIENT_ID     = process.env.BLING_CLIENT_ID;
  const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
  const KV_URL        = process.env.KV_REST_API_URL;
  const KV_TOKEN      = process.env.KV_REST_API_TOKEN;

  // Lê refresh_token do Redis
  const r = await fetch(`${KV_URL}/get/bling_refresh_token`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const { result: refreshToken } = await r.json();
  if (!refreshToken) throw new Error('bling_refresh_token não encontrado no Redis. Re-autorize o app.');

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const resp = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '1.0'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Falha ao renovar token: ${txt}`);
  }

  const data = await resp.json();

  // Atualiza tokens no Redis
  await fetch(`${KV_URL}/set/bling_refresh_token/${encodeURIComponent(data.refresh_token)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });

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
        return res.status(resp.status).json({ erro: `Bling retornou erro: ${txt}` });
      }

      const json = await resp.json();
      const items = json.data || [];
      todos = todos.concat(items);
      if (items.length < 100) break;
      pagina++;
    }

    const filtrados = todos.filter(item =>
      (item.categoria?.descricao || '').toLowerCase().includes('porcelana decorada')
    );

    const faturamento = filtrados.reduce((soma, i) => soma + (parseFloat(i.valor) || 0), 0);
    const pedidos = filtrados.length;

    return res.status(200).json({ faturamento, pedidos, data });

  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
