import https from 'https';

function kvGet(kvUrl, kvToken, key) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${kvUrl}/get/${key}`);
    const req = https.get({ hostname: url.hostname, path: url.pathname + url.search, headers: { Authorization: `Bearer ${kvToken}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).result); } catch(e) { resolve(null); } });
    });
    req.on('error', reject);
    req.setTimeout(4000, () => req.destroy(new Error('Redis timeout')));
  });
}

function blingGet(path, accessToken) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, val) => { if (!done) { done = true; clearTimeout(dl); fn(val); } };

    const req = https.get({ hostname: 'www.bling.com.br', path, headers: { Authorization: `Bearer ${accessToken}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => finish(resolve, { status: res.statusCode, body: d }));
    });
    req.on('error', err => finish(reject, err));

    // Timeout ABSOLUTO — destrói conexão após 10s independente de atividade
    const dl = setTimeout(() => { req.destroy(); finish(reject, new Error('Bling timeout absoluto 10s')); }, 10000);
  });
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

    let pagina = 1, todos = [];
    while (true) {
      const path = `/Api/v3/contas/receber?pagina=${pagina}&limite=100&dataVencimentoInicial=${data}&dataVencimentoFinal=${data}`;
      const { status, body } = await blingGet(path, accessToken);

      if (status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
      if (status !== 200) return res.status(status).json({ erro: `Bling ${status}: ${body}` });

      const json = JSON.parse(body);
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
