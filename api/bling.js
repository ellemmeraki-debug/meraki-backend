async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
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
  const dataHoje = `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
  const data = req.query.data || dataHoje;

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  // Modo diagnóstico: lista contas contábeis únicas de hoje
  if (req.query.debug === '1') {
    const t0 = Date.now();
    const r = await fetch(
      `https://www.bling.com.br/Api/v3/contas/receber?pagina=1&limite=100&dataVencimentoInicial=${data}&dataVencimentoFinal=${data}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }
    );
    const body = await r.json();
    const items = body.data || [];
    const contas = [...new Map(items.map(i => [i.contaContabil?.id, i.contaContabil])).values()].filter(Boolean);
    const vencimentos = [...new Set(items.map(i => i.vencimento))];
    return res.status(200).json({ ms: Date.now()-t0, total: items.length, data_buscada: data, vencimentos_encontrados: vencimentos, contas_contabeis: contas });
  }

  // Produção: filtra por contaContabil + data em JS
  const contaId = req.query.contaId ? Number(req.query.contaId) : null;

  let pagina = 1, todos = [], timed = false;
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    let r;
    try {
      r = await fetch(
        `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100&dataVencimentoInicial=${data}&dataVencimentoFinal=${data}`,
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
      );
    } catch(e) { return res.status(504).json({ erro: e.message }); }
    if (!r.ok) return res.status(r.status).json({ erro: `Bling ${r.status}` });
    const body = await r.json();
    const items = body.data || [];
    todos = todos.concat(items);
    if (items.length < 100) break;
    pagina++;
  }

  // Filtra por contaContabil se passado, senão por "porcelana" no descricao
  const filtrados = todos.filter(i => {
    const desc = (i.contaContabil?.descricao || '').toLowerCase();
    if (contaId) return i.contaContabil?.id === contaId;
    return desc.includes('porcelana');
  });

  const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);
  return res.status(200).json({ faturamento, pedidos: filtrados.length, data, total_registros: todos.length });
}
