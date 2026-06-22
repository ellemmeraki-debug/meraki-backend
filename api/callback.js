export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { code } = req.query;
  if (!code) return res.status(400).send('<h2>❌ Código não encontrado</h2>');

  const CLIENT_ID     = process.env.BLING_CLIENT_ID;
  const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
  const KV_URL        = process.env.KV_REST_API_URL;
  const KV_TOKEN      = process.env.KV_REST_API_TOKEN;

  if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).send('<h2>❌ Credenciais não configuradas</h2>');

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  try {
    const resp = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '1.0'
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code })
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).send(`<h2>❌ Erro Bling</h2><pre>${JSON.stringify(data)}</pre>`);

    // Salva tokens no Redis
    await fetch(`${KV_URL}/set/bling_refresh_token/${encodeURIComponent(data.refresh_token)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    await fetch(`${KV_URL}/set/bling_access_token/${encodeURIComponent(data.access_token)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });

    return res.status(200).send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Meraki · Autorizado</title>
      <style>body{font-family:sans-serif;max-width:600px;margin:60px auto;padding:20px;background:#0f0f0f;color:#fff}
      h2{color:#4ade80}.step{background:#1a2e1a;border-left:3px solid #4ade80;padding:12px 16px;margin:10px 0;border-radius:4px}</style>
      </head><body>
      <h2>✅ Autorização concluída!</h2>
      <p>Tokens salvos automaticamente no Redis. Agora é só testar:</p>
      <div class="step">Acesse: <a href="/api/bling" style="color:#4ade80">meraki-backend-i8fo.vercel.app/api/bling</a></div>
      </body></html>
    `);

  } catch (err) {
    return res.status(500).send(`<h2>❌ Erro: ${err.message}</h2>`);
  }
}
