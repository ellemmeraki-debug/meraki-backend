// ── Meraki Backend · Bling API ───────────────────────────────
// Endpoint: GET /api/bling?data=YYYY-MM-DD (padrão: hoje)
// Retorna: { faturamento, pedidos, data }

async function getAccessToken() {
  const CLIENT_ID     = process.env.BLING_CLIENT_ID;
  const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.BLING_REFRESH_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Variáveis BLING_CLIENT_ID, BLING_CLIENT_SECRET ou BLING_REFRESH_TOKEN não configuradas');
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const resp = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '1.0'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN
    })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Falha ao renovar token Bling: ${txt}`);
  }

  const data = await resp.json();
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

    let pagina = 1;
    let todos = [];

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
    const pedidos     = filtrados.length;

    return res.status(200).json({ faturamento, pedidos, data });

  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
