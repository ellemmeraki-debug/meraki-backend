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
        // Max pages to scan (safety limit to avoid timeout)
  const MAX_PAGES = 25;

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
        if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  let totalFaturamento = 0;
        let totalRegistros = 0;
        let paginasLidas = 0;
        let encontrouMes = false;
        let passouMes = false;
        const debugDatas = [];

  for (let pagina = 1; pagina <= MAX_PAGES && !passouMes; pagina++) {
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
                        return res.status(504).json({ erro: `Timeout página ${pagina}: ${e.message}`, faturamento: totalFaturamento, registros: totalRegistros });
            }

          if (r.status === 401) return res.status(401).json({ erro: 'Token expirado. Re-autorize.' });
            if (!r.ok) {
                        const txt = await r.text().catch(() => '');
                        return res.status(r.status).json({ erro: `Bling ${r.status}`, raw: txt.slice(0, 200) });
            }

          const body = await r.json();
            const items = body.data || [];
            paginasLidas++;

          if (items.length === 0) break; // no more data

          for (const item of items) {
                      const venc = item.vencimento || '';
                      if (venc.startsWith(prefixo)) {
                                    encontrouMes = true;
                                    totalFaturamento += parseFloat(item.valor) || 0;
                                    totalRegistros++;
                      } else if (encontrouMes && venc > prefixo) {
                                    // Records past target month (sorted ascending by vencimento)
                        passouMes = true;
                                    break;
                      }
          }

          // Collect sample dates for debug
          if (items.length > 0) {
                      debugDatas.push(`p${pagina}:${items[0].vencimento}..${items[items.length-1].vencimento}`);
          }

          // If we haven't found the month yet and last record is past it, stop
          const lastVenc = items[items.length - 1]?.vencimento || '';
            if (!encontrouMes && lastVenc > prefixo + '-31') {
                        passouMes = true;
            }

          if (items.length < 100) break; // last page
  }

  return res.status(200).json({
            mes: `${mesParam}/${anoParam}`,
            faturamento: Math.round(totalFaturamento * 100) / 100,
            registros: totalRegistros,
            paginas_lidas: paginasLidas,
            encontrou: encontrouMes,
            datas_debug: debugDatas
  });
}
