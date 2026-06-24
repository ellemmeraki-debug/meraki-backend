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

// Converte YYYY-MM-DD para DD/MM/YYYY (formato esperado pelo Bling)
function toBrDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const hojeStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const [dia, mes, ano] = hojeStr.split('/');
  const dataIso  = req.query.data || `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
  const dataBr   = toBrDate(dataIso); // ex: 22/06/2026

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  let todos = [];
  for (let pagina = 1; pagina <= 3; pagina++) {
    let r;
    try {
      r = await fetch(
        `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100&dataEmissaoInicial=${encodeURIComponent(dataBr)}&dataEmissaoFinal=${encodeURIComponent(dataBr)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'MerakiDashboard/1.0' },
          signal: AbortSignal.timeout(6000)
        }
      );
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

  const filtrados = todos.filter(i => i.contaContabil?.id === CONTA_PORCELANA_ID);
  const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);

  const debugMode = req.query.debug === '1';
  const resp = { faturamento, pedidos: filtrados.length, data: dataIso, total_escaneado: todos.length };
  if (debugMode) {
    resp.data_br_enviada = dataBr;
    resp.datas_emissao = [...new Set(todos.map(i => i.dataEmissao))].sort();
    resp.contas = [...new Map(todos.map(i => [i.contaContabil?.id, i.contaContabil?.descricao])).entries()]
      .map(([id, desc]) => ({ id, desc }));
  }
  return res.status(200).json(resp);
    }
