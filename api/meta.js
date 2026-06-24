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

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const anoParam = req.query.ano || String(agora.getFullYear());
  const mesParam = req.query.mes ? String(req.query.mes).padStart(2, '0')
                                 : String(agora.getMonth() + 1).padStart(2, '0');

  const since = `${anoParam}-${mesParam}-01`;
  const lastDay = new Date(Number(anoParam), Number(mesParam), 0).getDate();
  const until = `${anoParam}-${mesParam}-${String(lastDay).padStart(2, '0')}`;

  const [accessToken, adAccountId] = await Promise.all([
    kvGet(KV_URL, KV_TOKEN, 'meta_access_token'),
    kvGet(KV_URL, KV_TOKEN, 'meta_ad_account_id')
  ]);

  if (!accessToken) return res.status(401).json({ erro: 'Token Meta ausente. Configure em /api/meta-setup.' });
  if (!adAccountId) return res.status(401).json({ erro: 'Ad Account ID ausente. Configure em /api/meta-setup.' });

  const accountId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const timeRange = JSON.stringify({ since, until });
  const url = `https://graph.facebook.com/v20.0/${accountId}/insights`
    + `?fields=spend`
    + `&time_range=${encodeURIComponent(timeRange)}`
    + `&level=account`
    + `&access_token=${accessToken}`;

  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return res.status(200).json({ erro: `Timeout Meta API: ${e.message}` });
  }

  const body = await r.json();

  if (body.error) {
    return res.status(200).json({
      erro: body.error.message,
      codigo: body.error.code,
      dica: body.error.code === 190 ? 'Token expirado — gere um novo em developers.facebook.com/tools/explorer' : null
    });
  }

  const spend = parseFloat(body.data?.[0]?.spend || '0');

  return res.status(200).json({
    mes: `${mesParam}/${anoParam}`,
    gasto: Math.round(spend * 100) / 100,
    moeda: 'BRL',
    periodo: `${since} → ${until}`
  });
}
