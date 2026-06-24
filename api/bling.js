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
  const ultimo   = lastDay(Number(anoParam), Number(mesParam));

  const inicio = `01/${mesParam}/${anoParam}`;
  const fim    = `${ultimo}/${mesParam}/${anoParam}`;

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
  if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  // Filtra diretamente pelo portador (NUVEMSHOP DECORADA) — drásticamente menos registros
  let todos = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    let r;
    try {
      const url = `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100` +
        `&portador=${CONTA_PORCELANA_ID}` +
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

  // Se portador funcionou, todos os registros já são da conta certa.
  // Filtra pelo mês em JS como segurança (Bling ignora o ano no filtro de URL).
  const filtrados = todos.filter(i => (i.dataEmissao || '').slice(5, 7) === mesParam);

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
    resp.range_enviado = `${inicio} a ${fim}`;
    resp.datas_unicas = [...new Set(todos.map(i => i.dataEmissao))].sort();
    resp.contas_unicas = [...new Set(todos.map(i => i.contaContabil?.descricao))];
    resp.por_dia = filtrados.reduce((acc, i) => {
      const d = (i.dataEmissao || 'sem-data').slice(8); // DD
      acc[d] = Math.round(((acc[d] || 0) + (parseFloat(i.valor) || 0)) * 100) / 100;
      return acc;
    }, {});
  }

  return res.status(200).json(resp);
}
