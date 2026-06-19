// ── Meraki Backend · Bling API ───────────────────────────────
// Endpoint: GET /api/bling?data=YYYY-MM-DD (padrão: hoje)
// Retorna: { faturamento, pedidos, data }

export default async function handler(req, res) {

  // CORS — permite chamadas do dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

  const BLING_API_KEY = process.env.BLING_API_KEY;
  if (!BLING_API_KEY) {
    return res.status(500).json({ erro: 'BLING_API_KEY não configurada no Vercel' });
  }

  // Data de hoje no fuso de São Paulo (ou data informada na query)
  const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const [dia, mes, ano] = hojeStr.split('/');
  const dataHoje = `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
  const data = req.query.data || dataHoje;

  try {
    let pagina = 1;
    let todos = [];

    while (true) {
      const url = new URL('https://www.bling.com.br/Api/v3/contas/receber');
      url.searchParams.set('pagina', pagina);
      url.searchParams.set('limite', 100);
      url.searchParams.set('dataVencimentoInicial', data);
      url.searchParams.set('dataVencimentoFinal', data);

      const resp = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${BLING_API_KEY}` }
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

    // Filtra somente "Recebimentos Porcelana Decorada"
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
