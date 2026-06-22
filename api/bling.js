async function kvGet(url, token, key) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    const data = await r.json();
    return data.result;
  } finally { clearTimeout(t); }
}

async function blingFetch(url, accessToken) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    return await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal });
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
    console.log('[1] Lendo access_token...');
    const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
    if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize via link de convite do Bling.' });

    console.log('[2] Chamando Bling API...');
    let pagina = 1, todos = [];

    while (true) {
      const url = new URL('https://www.bling.com.br/Api/v3/contas/receber');
      url.searchParams.set('pagina', pagina);
      url.searchParams.set('limite', 100);
      url.searchParams.set('dataVencimentoInicial', data);
      url.searchParams.set('dataVencimentoFinal', data);

      let resp;
      try {
        resp = await blingFetch(url.toString(), accessToken);
      } catch (e) {
        return res.status(504).json({ erro: `Bling API timeout na página ${pagina}: ${e.message}` });
      }

      if (resp.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize via link de convite.' });
      if (!resp.ok) {
        const txt = await resp.text();
        return res.status(resp.status).json({ erro: `Bling API ${resp.status}: ${txt}` });
      }

      const json = await resp.json();
      const items = json.data || [];
      todos = todos.concat(items);
      if (items.length < 100) break;
      pagina++;
    }

    const filtrados = todos.filter(i => (i.categoria?.descricao || '').toLowerCase().includes('porcelana decorada'));
    const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);
    console.log('[3] OK:', faturamento, filtrados.length);

    return res.status(200).json({ faturamento, pedidos: filtrados.length, data });
  } catch (err) {
    console.error('[ERRO]', err.message);
    return res.status(500).json({ erro: err.message });
  }
}
