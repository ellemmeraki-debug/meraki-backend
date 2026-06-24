// Retorna o gasto do Google Ads no mês atual

async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
}

async function kvSet(kvUrl, kvToken, key, value) {
  try {
    const r = await fetch(`${kvUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['SET', key, value]]),
      signal: AbortSignal.timeout(5000)
    });
    const data = await r.json();
    return data[0]?.result === 'OK';
  } catch { return false; }
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token'
    }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await r.json();
  return data.access_token || null;
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

  const [clientId, clientSecret, refreshToken, developerToken, customerId] = await Promise.all([
    kvGet(KV_URL, KV_TOKEN, 'google_client_id'),
    kvGet(KV_URL, KV_TOKEN, 'google_client_secret'),
    kvGet(KV_URL, KV_TOKEN, 'google_refresh_token'),
    kvGet(KV_URL, KV_TOKEN, 'google_developer_token'),
    kvGet(KV_URL, KV_TOKEN, 'google_customer_id')
  ]);

  if (!refreshToken) return res.status(401).json({ erro: 'Conta Google não autorizada.', instrucao: 'Acesse /api/google-oauth' });
  if (!clientId || !clientSecret || !developerToken || !customerId) {
    return res.status(401).json({ erro: 'Credenciais incompletas.', instrucao: 'Acesse /api/google-setup' });
  }

  const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
  if (!accessToken) return res.status(401).json({ erro: 'Falha ao obter access token. Reautorize em /api/google-oauth' });

  const query = `SELECT metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`;

  let r;
  try {
    r = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    return res.status(200).json({ erro: `Timeout Google Ads API: ${e.message}` });
  }

  const body = await r.json();
  if (body.error) return res.status(200).json({ erro: body.error.message, codigo: body.error.code });

  const rows = body.results || [];
  const totalMicros = rows.reduce((acc, row) => acc + parseInt(row.metrics?.costMicros || '0', 10), 0);
  const gasto = Math.round(totalMicros / 10000) / 100;

  return res.status(200).json({
    mes: `${mesParam}/${anoParam}`,
    gasto, moeda: 'BRL',
    periodo: `${since} → ${until}`,
    linhas: rows.length
  });
                              }
