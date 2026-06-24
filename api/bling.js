async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
}

const CONTA_PORCELANA_ID = 14888102402; // NUVEMSHOP DECORADA

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
  const ultimo = lastDay(Number(anoParam), Number(mesParam));

  const inicio = `01/${mesParam}/${anoParam}`; // ex: 01/06/2026
  const fim    = `${ultimo}/${mesParam}/${anoParam}`; // ex: 30/06/2026

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  let todos = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    let r;
    try {
      // Tenta filtrar por data de PAGAMENTO (liquidacao) + situacao Recebida
      const url = `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100` +
        `&situacoes[]=2` +
        `&dataPagamentoInicial=${inicio}&dataPagamentoFinal=${fim}`;
      r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'MerakiDashboard/1.0' },
        signal: AbortSignal.timeout(8000)
      });
    } catch (e) {
      if (pagina === 1) return res.status(504).json({ erro: e.message });
      break;
    }
    if (!r.ok) {
      if (r.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
      break;
    }
    const body = await r.json();
    const items = body.data || [];
    todos = todos.concat(items);
    if (items.length < 100) break;
  }

  const prefixo = `${anoParam}-${mesParam}`;
  const filtrados = todos.filter(i => i.contaContabil?.id === CONTA_PORCELANA_ID);

  const faturamento = Math.round(
    filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0) * 100
  ) / 100;

  const resp = {
    faturamento,
    pedidos: filtrados.length,
    mes: `${mesParam}/${anoParam}`,
    total_escaneado: todos.length
  };

  if (req.query.debug === '1') {
    resp.range = `${inicio} a ${fim}`;
    // Mostra todos os campos do primeiro registro para diagnóstico
    resp.primeiro_registro_raw = todos[0] || null;
    resp.vencimentos = [...new Set(todos.map(i => i.vencimento))].sort().slice(0, 10);
    resp.contas = [...new Set(todos.map(i => i.contaContabil?.descricao))].filter(Boolean);
  }

  return res.status(200).json(resp);
}
