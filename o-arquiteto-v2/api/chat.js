export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const { messages, system, max_tokens } = req.body;

  if (!messages || !system) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  // A chave fica aqui no servidor — o aluno nunca a vê
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: max_tokens || 1800,
        system,
        messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Erro na API.' });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}
