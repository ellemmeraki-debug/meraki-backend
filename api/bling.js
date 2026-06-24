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
    const ultimo = lastDay(Number(anoParam), Number(mesParam));
    const prefixo = `${anoParam}-${mesParam}`;
    const dataIni = `${anoParam}-${mesParam}-01`;
    const dataFim = `${anoParam}-${mesParam}-${String(ultimo).padStart(2,'0')}`;

  const CONTA_ID = '14888102402';

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
    if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  const tests = [
        `/Api/v3/contas/receber?pagina=1&limite=100&situacao=2&idContaContabil=${CONTA_ID}`,
        `/Api/v3/contas/receber?pagina=1&limite=100&situacao=2`,
        `/Api/v3/contas/receber?pagina=1&limite=100&contaContabil=${CONTA_ID}`,
        `/Api/v3/contas/receber?pagina=1&limite=100&situacao=2&dataPagamentoInicial=${dataIni}&dataPagamentoFinal=${dataFim}`,
        `/Api/v3/contas/receber?pagina=1&limite=100&situacao=2&dataVencimentoInicial=${dataIni}&dataVencimentoFinal=${dataFim}`,
      ];

  const results = [];
    for (const url of tests) {
          try {
                  const r = await fetch(`https://www.bling.com.br${url}`, {
                            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
                            signal: AbortSignal.timeout(10000)
                  });
                  const body = await r.json();
                  const items = body.data || [];
                  const first = items[0] || null;
                  results.push({
                            url: url.split('?')[1],
                            status: r.status,
                            count: items.length,
                            target_mes: prefixo,
                            vencimentos_sample: items.slice(0,3).map(i => i.vencimento),
                            conta_sample: items.slice(0,3).map(i => i.contaContabil?.id || 'no-conta'),
                            situacao_sample: items.slice(0,3).map(i => i.situacao),
                            campos_first: first ? Object.keys(first) : [],
                            erro: body.error?.message || null
                  });
          } catch(e) {
                  results.push({ url: url.split('?')[1], erro: e.message });
          }
    }

  return res.status(200).json({ mes: `${mesParam}/${anoParam}`, tests: results });
}
