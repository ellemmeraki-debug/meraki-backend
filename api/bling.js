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
  const mesParam = req.query.mes ? String(req.query.mes).padStart(2,'0') : String(agora.getMonth()+1).padStart(2,'0');
  const anoParam = req.query.ano || String(agora.getFullYear());

  // Bling usa um ano diferente do servidor — detectamos dinamicamente fazendo
  // a primeira request sem filtro de data e pegando o ano do primeiro registro.
  // Por simplicidade, subtraímos 1 ano se servidor > 2025 (Bling ainda usa 2025).
  // Pode ser sobrescrito via ?blingAno=2025
  const serverYear = parseInt(anoParam);
  const blingAno   = req.query.blingAno ? parseInt(req.query.blingAno) : (serverYear > 2025 ? serverYear - 1 : serverYear);
  const ultimo     = lastDay(blingAno, Number(mesParam));

  const inicio = `01/${mesParam}/${blingAno}`;
  const fim    = `${ultimo}/${mesParam}/${blingAno}`;

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  let todos = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    let r;
    try {
      const url = `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100` +
        `&dataEmissaoInicial=${inicio}&dataEmissaoFinal=${fim}`;
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

  // Filtra: NUVEMSHOP DECORADA + mês correto
  const filtrados = todos.filter(i =>
    i.contaContabil?.id === CONTA_PORCELANA_ID &&
    (i.dataEmissao || '').slice(5, 7) === mesParam
  );

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
    resp.bling_range = `${inicio} a ${fim}`;
    resp.datas_unicas = [...new Set(todos.map(i => i.dataEmissao))].sort();
    resp.por_dia = filtrados.reduce((acc, i) => {
      const d = (i.dataEmissao || '').slice(8); // DD
      acc[d] = Math.round(((acc[d] || 0) + (parseFloat(i.valor) || 0)) * 100) / 100;
      return acc;
    }, {});
  }

  return res.status(200).json(resp);
}
