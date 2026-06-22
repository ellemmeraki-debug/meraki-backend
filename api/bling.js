async function kvGet(kvUrl, kvToken, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: controller.signal
    });
    const j = await r.json();
    return j.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function blingGet(path, accessToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const r = await fetch(`https://www.bling.com.br${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'MerakiDashboard/1.0'
      },
      signal: controller.signal
    });
    const body = await r.text();
    return { status: r.status, body };
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Bling timeout 7s' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Metodo nao permitido' });

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

  let pagina = 1, todos = [];
  while (true) {
    const path = `/Api/v3/contas/receber?pagina=${pagina}&limite=100&dataVencimentoInicial=${data}&dataVencimentoFinal=${data}`;
    let r;
    try {
      r = await blingGet(path, accessToken);
    } catch(e) {
      return res.status(504).json({ erro: e.message });
    }

    if (r.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
    if (r.status !== 200) return res.status(r.status).json({ erro: `Bling ${r.status}: ${r.body.slice(0,200)}` });

    let json;
    try { json = JSON.parse(r.body); } catch { return res.status(500).json({ erro: 'Resposta invalida do Bling', raw: r.body.slice(0,200) }); }

    const items = json.data || [];
    todos = todos.concat(items);
    if (items.length < 100) break;
    pagina++;
  }

  const filtrados = todos.filter(i =>
    (i.categoria?.descricao || '').toLowerCase().includes('porcelana decorada')
  );
  const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);

  return res.status(200).json({ faturamento, pedidos: filtrados.length, data, total_registros: todos.length });
}
