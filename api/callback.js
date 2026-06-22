// ── Meraki Backend · OAuth Callback ──────────────────────────
// Bling redireciona aqui após autorização com ?code=XXXX
// Troca o código pelo refresh_token e exibe na tela

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { code } = req.query;

  if (!code) {
    return res.status(400).send(`
      <h2>❌ Código de autorização não encontrado</h2>
      <p>Acesse o link de convite do Bling para autorizar o app.</p>
    `);
  }

  const CLIENT_ID     = process.env.BLING_CLIENT_ID;
  const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send(`
      <h2>❌ BLING_CLIENT_ID ou BLING_CLIENT_SECRET não configurados no Vercel</h2>
    `);
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  try {
    const resp = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '1.0'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).send(`
        <h2>❌ Erro ao trocar código por token</h2>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `);
    }

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Meraki · Autorização concluída</title>
        <style>
          body { font-family: sans-serif; max-width: 700px; margin: 60px auto; padding: 20px; background: #0f0f0f; color: #fff; }
          h2 { color: #4ade80; }
          .box { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .token { font-family: monospace; word-break: break-all; color: #facc15; font-size: 13px; }
          .label { color: #aaa; font-size: 12px; margin-bottom: 6px; }
          .step { background: #1a2e1a; border-left: 3px solid #4ade80; padding: 12px 16px; margin: 10px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h2>✅ Autorização concluída!</h2>
        <p>Copie o <strong>refresh_token</strong> abaixo e salve no Vercel como variável de ambiente.</p>

        <div class="box">
          <div class="label">BLING_REFRESH_TOKEN</div>
          <div class="token">${data.refresh_token}</div>
        </div>

        <h3>Próximos passos:</h3>
        <div class="step">1. Acesse <strong>vercel.com</strong> → seu projeto → Settings → Environment Variables</div>
        <div class="step">2. Adicione: <code>BLING_REFRESH_TOKEN</code> = o token acima</div>
        <div class="step">3. Clique em <strong>Redeploy</strong></div>
        <div class="step">4. Teste: <a href="/api/bling" style="color:#4ade80">/api/bling</a></div>

        <p style="color:#666; font-size:12px; margin-top:30px;">
          access_token expira em: ${data.expires_in}s · gerado em ${new Date().toLocaleString('pt-BR')}
        </p>
      </body>
      </html>
    `);

  } catch (err) {
    return res.status(500).send(`<h2>❌ Erro: ${err.message}</h2>`);
  }
}
