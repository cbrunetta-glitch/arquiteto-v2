// api/chat.js — proxy para a API da Anthropic.
// Exige autenticação: token de aluno (Bearer) OU token de painel (professora).
// Modelo: claude-sonnet-4-5

const h = require('../helpers/index.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const alunoAuth = await h.authenticateRequest(req);
    const painelAuth = alunoAuth ? null : await h.authenticatePainel(req);
    if (!alunoAuth && !painelAuth) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const { messages, system, max_tokens } = req.body || {};
    if (!messages || !system) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes (system, messages).' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Chave de API da Anthropic não configurada.' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: max_tokens || 1800,
        system,
        messages
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Erro na API da Anthropic.'
      });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};
