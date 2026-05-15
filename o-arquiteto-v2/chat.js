// api/chat.js — função serverless Node.js (Vercel)
// A chave da API NUNCA é exposta ao navegador: fica em process.env.ANTHROPIC_API_KEY
//
// Modelo: Claude Sonnet 4.5 (claude-sonnet-4-5)
// Para trocar de modelo no futuro, edite apenas a string 'model' abaixo.
// Modelos atuais (maio/2026): claude-sonnet-4-5, claude-sonnet-4-6, claude-opus-4-6, claude-opus-4-7.
// Observação: para usar 'claude-sonnet-4-6' a chave da Anthropic precisa ter acesso ao modelo
// (verifique em console.anthropic.com → Workspace → Settings → Permissions).

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const { messages, system, max_tokens } = req.body || {};

  if (!messages || !system) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes (system, messages).' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave de API não configurada no servidor.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: max_tokens || 1800,
        system,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Erro na API da Anthropic.',
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
