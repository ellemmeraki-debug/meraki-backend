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

async function blingFetch(url, token) {
      const r = await fetch(`https://www.bling.com.br${url}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
              signal: AbortSignal.timeout(10000)
      });
      return r.json();
}

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

  const PORTADOR_ID = '14888102402';

  const accessToken = await kvGet(KV_URL, KV_TOKEN, 'bling_access_token');
      if (!accessToken) return res.status(401).json({ erro: 'Token ausente. Re-autorize.' });

  // Test 1: idPortador filter (internal param name)
  const t1 = await blingFetch(`/Api/v3/contas/receber?pagina=1&limite=5&situacao=2&idPortador=${PORTADOR_ID}`, accessToken);

  // Test 2: probe pages 5,10,15,20 to find where target month starts
  const probes = {};
      for (const pg of [5, 10, 15, 20, 25]) {
              try {
                        const d = await blingFetch(`/Api/v3/contas/receber?pagina=${pg}&limite=100&situacao=2`, accessToken);
                        const items = d.data || [];
                        probes[`p${pg}`] = {
                                    count: items.length,
                                    first_venc: items[0]?.vencimento,
                                    last_venc: items[items.length-1]?.vencimento,
                                    has_target: items.some(i => i.vencimento?.startsWith(prefixo))
                        };
              } catch(e) {
                        probes[`p${pg}`] = { erro: e.message };
              }
      }

  // Test 3: get detail of first record to see all available fields
  const firstId = (await blingFetch(`/Api/v3/contas/receber?pagina=1&limite=1&situacao=2`, accessToken))?.data?.[0]?.id;
      let detail = null;
      if (firstId) {
              detail = await blingFetch(`/Api/v3/contas/receber/${firstId}`, accessToken);
      }

  return res.status(200).json({
          mes_alvo: prefixo,
          idPortador_test: {
                    status_ok: !t1.error,
                    count: t1.data?.length,
                    conta_ids: t1.data?.slice(0,3).map(i => i.contaContabil?.id),
                    erro: t1.error?.message
          },
          page_probes: probes,
          detail_fields: detail?.data ? Object.keys(detail.data) : null,
          detail_portador: detail?.data?.portador || detail?.data?.contaContabil || null
  });
}
