// api/painel-excluir-sessao.js — exclusão de sessão pela professora.

const h = require('../helpers/index.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    const auth = await h.authenticatePainel(req);
    if (!auth) return res.status(401).json({ error: 'Não autenticado.' });

    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId obrigatório.' });

    const sess = await h.kvGet('sessao:' + sessionId);
    if (!sess) return res.status(404).json({ error: 'Sessão não encontrada.' });

    await h.kvDel('sessao:' + sessionId);
    if (sess.cpfHash) {
      await h.kvSRem('aluno_sessoes:' + sess.cpfHash, sessionId);
    }
    await h.kvSRem('todas_sessoes', sessionId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro: ' + err.message });
  }
};
