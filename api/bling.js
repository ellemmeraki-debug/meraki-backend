async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
}

// NUVEMSHOP DECORADA = conta contabil da Porcelana Decorada
const CONTA_PORCELANA_ID = 14888102402;

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

  // O filtro de data da URL do Bling nao funciona — filtramos por dataEmissao em JS.
  // Buscamos 2 paginas (200 registros) com filtro de emissao para reduzir carga.
  let todos = [];
  for (let pagina = 1; pagina <= 2; pagina++) {
    let r;
    try {
      r = await fetch(
        `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100&dataEmissaoInicial=${data}&dataEmissaoFinal=${data}`,
        {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'MerakiDashboard/1.0' },
          signal: AbortSignal.timeout(6000)
        }
      );
    } catch (e) {
      if (pagina === 1) return res.status(504).json({ erro: e.message });
      break; // se der timeout na pag 2, usa o que ja tem
    }
    if (!r.ok) {
      if (r.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
      break;
    }
    const body = await r.json();
    const items = body.data || [];
    todos = todos.concat(items);
    if (items.length < 100) break; // ultima pagina
  }

  // Filtra por conta contabil (NUVEMSHOP DECORADA) + data de emissao
  const filtrados = todos.filter(i =>
    i.contaContabil?.id === CONTA_PORCELANA_ID &&
    i.dataEmissao === data
  );

  const faturamento = filtrados.reduce((s, i) => s + (parseFloat(i.valor) || 0), 0);

  return res.status(200).json({
    faturamento,
    pedidos: filtrados.length,
    data,
    total_escaneado: todos.length
  });
                                                          }
