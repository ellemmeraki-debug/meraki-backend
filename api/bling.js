async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
}

// Busca todas as páginas de uma situação com filtro de data no servidor
async function fetchSituacao(accessToken, situacao, dataInicio, dataFim) {
  const idsVistos = new Set();
  let total = 0;
  let registros = 0;
  let pagina = 1;

  while (true) {
    const url =
      `https://www.bling.com.br/Api/v3/contas/receber` +
      `?pagina=${pagina}&limite=100` +
      `&situacao=${situacao}` +
      `&dataVencimentoInicial=${dataInicio}` +
      `&dataVencimentoFinal=${dataFim}`;

    let r;
    try {
      r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000)
      });
    } catch (e) {
      return { total, registros, erro: `Timeout p${pagina}: ${e.message}` };
    }

    if (r.status === 401) return { total, registros, erro: 'Token expirado' };
    if (!r.ok) return { total, registros, erro: `Bling ${r.status}` };

    const body = await r.json();
    const items = body.data || [];

    for (const item of items) {
      if (!idsVistos.has(item.id)) {
        idsVistos.add(item.id);
        total += parseFloat(item.valor) || 0;
        registros++;
      }
    }

    if (items.length < 100) break;
    pagina++;

    // Limite de segurança: 30 páginas por situação
    if (pagina > 30) break;
  }

  return { total: Math.round(total * 100) / 100, registros };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const ano = req.query.ano || String(agora.getFullYear());
  const mes = req.query.mes ? String(req.query.mes).padStart(2, '0')
                            : String(agora.getMonth() + 1).padStart(2, '0');

  // Primeiro e último dia do mês
  const dataInicio = `${ano}-${mes}-01`;
  const ultimoDia  = new Date(parseInt(ano), parseInt(mes), 0).getDate();
  const dataFim    = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  // Busca situacao=2 (Recebidas) e situacao=1 (Em aberto) em paralelo
  const [recebidas, emAberto] = await Promise.all([
    fetchSituacao(accessToken, 2, dataInicio, dataFim),
    fetchSituacao(accessToken, 1, dataInicio, dataFim)
  ]);

  const faturamento = Math.round(
    ((recebidas.total || 0) + (emAberto.total || 0)) * 100
  ) / 100;

  return res.status(200).json({
    mes: `${mes}/${ano}`,
    faturamento,
    recebidas: { valor: recebidas.total, registros: recebidas.registros },
    em_aberto: { valor: emAberto.total, registros: emAberto.registros },
    periodo: `${dataInicio} a ${dataFim}`,
    aviso: recebidas.erro || emAberto.erro || undefined
  });
}
