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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const anoAtual = req.query.ano || String(agora.getFullYear());           // ex: 2026
  const mesAtual = req.query.mes ? String(req.query.mes).padStart(2,'0')
                                 : String(agora.getMonth()+1).padStart(2,'0'); // ex: 06
  const prefixoBuscado = `${anoAtual}-${mesAtual}`; // ex: "2026-06"

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  // Sem filtro de data na URL — deixa o Bling retornar em ordem natural
  // e filtramos pelo prefixo YYYY-MM correto em JS
  let todos = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    let r;
    try {
      r = await fetch(
        `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100`,
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
    if (items.length < 100) break;
  }

  const filtrados = todos.filter(i =>
    i.contaContabil?.id === CONTA_PORCELANA_ID &&
    (i.dataEmissao || '').startsWith(prefixoBuscado)
  );

  const faturamento = Math.round(
    filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0) * 100
  ) / 100;

  // Anos e meses únicos encontrados nos 2000 registros
  const anosEncontrados = [...new Set(todos.map(i => (i.dataEmissao || '').slice(0,7)))].sort();

  return res.status(200).json({
    faturamento,
    pedidos: filtrados.length,
    mes: `${mesAtual}/${anoAtual}`,
    total_escaneado: todos.length,
    // Diagnóstico: quais anos/meses estão nos dados do Bling
    anos_meses_no_bling: anosEncontrados,
    buscando_prefixo: prefixoBuscado
  });
}
