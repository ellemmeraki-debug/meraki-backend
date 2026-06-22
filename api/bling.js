async function kvGet(url, token, key) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    const data = await r.json();
    return data.result;
  } finally { clearTimeout(t); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const [dia, mes, ano] = hojeStr.split('/');
  const dataHoje = `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
  const data = req.query.data || dataHoje;

  try {
    console.log('[1] Lendo access_token do Redis...');
    const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
    if (!accessToken) {
      return res.status(401).json({ erro: 'Token expirado ou ausente. Acesse o link de convite do Bling para re-autorizar.' });
    }
    console.log('[2] Token ok, buscando Contas a Receber...');

    let pagina = 1, todos = [];
    while (true) {
      const url = new URL('https://www.bling.com.br/Api/v3/contas/receber');
      url.searchParams.set('pagina', pagina);
      url.searchParams.set('limite', 100);
      url.searchParams.set('dataVencimentoInicial', data);
      url.searchParams.set('dataVencimentoFinal', data);

      const resp = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${accessToken}` } });

      if (resp.status === 401) {
        return res.status(401).json({ erro: 'Access token expirado. Re-autorize via link de convite do Bling.' });
      }
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

    const filtrados = todos.filter(i => (i.categoria?.descricao || '').toLowerCase().includes('porcelana decorada'));
    const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);
    console.log('[3] Resultado:', faturamento, filtrados.length);

    return res.status(200).json({ faturamento, pedidos: filtrados.length, data });
  } catch (err) {
    console.error('[ERRO]', err.message);
    return res.status(500).json({ erro: err.message });
  }
}
