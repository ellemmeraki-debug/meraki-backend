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

function lastDayOfMonth(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1; // 1-12
  const mesStr = String(mes).padStart(2, '0');
  const ultimo = lastDayOfMonth(ano, mes);

  // Aceita ?mes=06&ano=2026 para filtrar mês específico
  const mesParam = req.query.mes ? String(req.query.mes).padStart(2,'0') : mesStr;
  const anoParam = req.query.ano || String(ano);
  const ultimoParam = lastDayOfMonth(Number(anoParam), Number(mesParam));

  const inicio = `01/${mesParam}/${anoParam}`; // ex: 01/06/2026
  const fim    = `${ultimoParam}/${mesParam}/${anoParam}`; // ex: 30/06/2026

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  // Busca até 10 páginas (1000 registros) — filtra mês em JS pois Bling ignora o ano
  let todos = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    let r;
    try {
      r = await fetch(
        `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100&dataEmissaoInicial=${inicio}&dataEmissaoFinal=${fim}`,
        {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'MerakiDashboard/1.0' },
          signal: AbortSignal.timeout(8000)
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
    if (items.length < 100) break; // última página
  }

  // Filtra NUVEMSHOP DECORADA + mês correto (ignora ano — Bling usa ano diferente do servidor)
  const filtrados = todos.filter(i =>
    i.contaContabil?.id === CONTA_PORCELANA_ID &&
    (i.dataEmissao || '').slice(5, 7) === mesParam
  );

  const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);

  const resp = {
    faturamento: Math.round(faturamento * 100) / 100,
    pedidos: filtrados.length,
    mes: `${mesParam}/${anoParam}`,
    total_escaneado: todos.length
  };

  if (req.query.debug === '1') {
    resp.range_enviado = `${inicio} a ${fim}`;
    resp.datas_unicas = [...new Set(todos.map(i => i.dataEmissao))].sort();
    resp.por_dia = filtrados.reduce((acc, i) => {
      const d = i.dataEmissao || 'sem data';
      acc[d] = (acc[d] || 0) + (parseFloat(i.valor) || 0);
      return acc;
    }, {});
  }

  return res.status(200).json(resp);
  }
