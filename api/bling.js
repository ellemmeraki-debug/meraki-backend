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
          const prefixo = `${anoParam}-${mesParam}`;

  // NUVEMSHOP DECORADA portador id
  const PORTADOR_ID = '14888102402';

  // Start page: based on profiling, page 22 = Feb 2026 with this filter.
  // Override with ?startPage= for other months.
  const startPage = parseInt(req.query.startPage || '22', 10);
          const endPage = parseInt(req.query.endPage || '36', 10);

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
          if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  let totalFaturamento = 0;
          let totalRegistros = 0;
          let paginasLidas = 0;
          const debugDatas = [];

  for (let pagina = startPage; pagina <= endPage; pagina++) {
              let r;
              try {
                            r = await fetch(
                                            `https://www.bling.com.br/Api/v3/contas/receber?pagina=${pagina}&limite=100&situacao=2&idPortador=${PORTADOR_ID}`,
                                    {
                                                      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
                                                      signal: AbortSignal.timeout(12000)
                                    }
                                          );
              } catch (e) {
                            // Return partial result on timeout
                return res.status(200).json({
                                mes: `${mesParam}/${anoParam}`,
                                faturamento: Math.round(totalFaturamento * 100) / 100,
                                registros: totalRegistros,
                                paginas_lidas: paginasLidas,
                                aviso: `Timeout na página ${pagina}: ${e.message}`,
                                datas_debug: debugDatas
                });
              }

            if (r.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
              if (!r.ok) {
                            const txt = await r.text().catch(() => '');
                            return res.status(r.status).json({ erro: `Bling ${r.status}`, raw: txt.slice(0, 200) });
              }

            const body = await r.json();
              const items = body.data || [];
              paginasLidas++;

            if (items.length === 0) break;

            // Collect all records matching target month (data not strictly sorted)
            for (const item of items) {
                          if ((item.vencimento || '').startsWith(prefixo)) {
                                          totalFaturamento += parseFloat(item.valor) || 0;
                                          totalRegistros++;
                          }
            }

            if (items.length > 0) {
                          debugDatas.push(`p${pagina}:${items[0].vencimento}..${items[items.length-1].vencimento}`);
            }

            if (items.length < 100) break;
  }

  return res.status(200).json({
              mes: `${mesParam}/${anoParam}`,
              faturamento: Math.round(totalFaturamento * 100) / 100,
              registros: totalRegistros,
              paginas_lidas: paginasLidas,
              paginas_range: `${startPage}-${endPage}`,
              datas_debug: debugDatas
  });
}
