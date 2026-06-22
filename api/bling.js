const timeout = (ms, msg) => new Promise((_, r) => setTimeout(() => r(new Error(msg || `Timeout ${ms}ms`)), ms));

async function kvGet(url, token, key) {
  const fetch_p = fetch(`${url}/get/${key}`, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json())
    .then(d => d.result);
  return Promise.race([fetch_p, timeout(4000, `Redis GET timeout (${key})`)]);
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
    const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
    if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize via link de convite do Bling.' });

    // TESTE: retorna só o token (primeiros 10 chars) para confirmar Redis funciona
    // return res.json({ debug: 'redis ok', token_preview: String(accessToken).slice(0,10) });

    let pagina = 1, todos = [];
    while (true) {
      const url = new URL('https://www.bling.com.br/Api/v3/contas/receber');
      url.searchParams.set('pagina', pagina);
      url.searchParams.set('limite', 100);
      url.searchParams.set('dataVencimentoInicial', data);
      url.searchParams.set('dataVencimentoFinal', data);

      const fetch_p = fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      let resp;
      try {
        resp = await Promise.race([fetch_p, timeout(8000, `Bling API timeout página ${pagina}`)]);
      } catch (e) {
        return res.status(504).json({ erro: e.message });
      }

      if (resp.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
      if (!resp.ok) return res.status(resp.status).json({ erro: `Bling ${resp.status}: ${await resp.text()}` });

      const json = await resp.json();
      const items = json.data || [];
      todos = todos.concat(items);
      if (items.length < 100) break;
      pagina++;
    }

    const filtrados = todos.filter(i => (i.categoria?.descricao || '').toLowerCase().includes('porcelana decorada'));
    const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);
    return res.status(200).json({ faturamento, pedidos: filtrados.length, data });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
