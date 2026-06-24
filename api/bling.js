async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
}

function lastDay(ano, mes) { return new Date(ano, mes, 0).getDate(); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const anoParam = req.query.ano || String(agora.getFullYear());
  const mesParam = req.query.mes ? String(req.query.mes).padStart(2,'0')
                                 : String(agora.getMonth()+1).padStart(2,'0');
  const ultimo   = lastDay(Number(anoParam), Number(mesParam));

  const inicio = `01/${mesParam}/${anoParam}`; // 01/06/2026
  const fim    = `${ultimo}/${mesParam}/${anoParam}`; // 30/06/2026

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  // Usa endpoint de PEDIDOS DE VENDA — filtro de data funciona aqui
  let todos = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    let r;
    try {
      const url = `https://www.bling.com.br/Api/v3/pedidos/vendas?pagina=${pagina}&limite=100` +
        `&dataInicial=${inicio}&dataFinal=${fim}`;
      r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'MerakiDashboard/1.0' },
        signal: AbortSignal.timeout(8000)
      });
    } catch (e) {
      if (pagina === 1) return res.status(504).json({ erro: e.message });
      break;
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      if (r.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
      return res.status(r.status).json({ erro: `Bling ${r.status}`, raw: txt.slice(0,300) });
    }
    const body = await r.json();
    const items = body.data || [];
    todos = todos.concat(items);
    if (items.length < 100) break;
  }

  const resp = {
    mes: `${mesParam}/${anoParam}`,
    total_pedidos: todos.length,
    // Debug: estrutura do primeiro pedido para identificar campos e loja
    primeiro_pedido: todos[0] || null,
    lojas_unicas: [...new Set(todos.map(i => JSON.stringify(i.loja || i.canal || i.numeroPedidoLoja || i.tipoIntegracao || 'sem-loja')))].slice(0, 10),
    datas: [...new Set(todos.map(i => i.data || i.dataEmissao || i.dataPedido || '?'))].sort().slice(0, 10)
  };

  return res.status(200).json(resp);
        }
