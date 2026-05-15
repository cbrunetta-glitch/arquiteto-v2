// api/sessoes.js — CRUD de sessões do aluno autenticado.
//
//   GET    /api/sessoes         → lista sessões do aluno (sem conteúdo completo)
//   GET    /api/sessoes?id=xxx  → retorna sessão completa
//   POST   /api/sessoes         → cria/atualiza sessão (body com id)
//   DELETE /api/sessoes?id=xxx  → exclui sessão

const h = require('../helpers/index.js');

function resumir(s) {
  // Versão enxuta para listagem (evita transferir refinamento inteiro)
  return {
    id: s.id,
    title: s.title,
    etapaAtual: s.etapaAtual,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    temProtocolo: !!s.protocoloFinal,
    designNome: s.designEscolhido ? s.designEscolhido.nome : null
  };
}

module.exports = async function handler(req, res) {
  try {
    const auth = await h.authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'Não autenticado.' });

    const { cpfHash } = auth;
    const sessionId = (req.query && req.query.id) || (req.body && req.body.id);

    // ---------- GET ----------
    if (req.method === 'GET') {
      if (sessionId) {
        const sess = await h.kvGet('sessao:' + sessionId);
        if (!sess || sess.cpfHash !== cpfHash) {
          return res.status(404).json({ error: 'Sessão não encontrada.' });
        }
        return res.status(200).json({ sessao: sess });
      }
      const ids = await h.kvSMembers('aluno_sessoes:' + cpfHash);
      if (!ids.length) return res.status(200).json({ sessoes: [] });
      const sessoes = await Promise.all(ids.map(id => h.kvGet('sessao:' + id)));
      const validas = sessoes
        .filter(s => s)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map(resumir);
      return res.status(200).json({ sessoes: validas });
    }

    // ---------- POST ----------
    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.id) return res.status(400).json({ error: 'ID da sessão obrigatório.' });

      const existente = await h.kvGet('sessao:' + body.id);
      if (existente && existente.cpfHash !== cpfHash) {
        return res.status(403).json({ error: 'Sessão pertence a outro usuário.' });
      }

      const now = Date.now();
      const sessao = {
        ...body,
        cpfHash,
        updatedAt: now,
        createdAt: (existente && existente.createdAt) || body.createdAt || now
      };

      await h.kvSet('sessao:' + body.id, sessao);
      await h.kvSAdd('aluno_sessoes:' + cpfHash, body.id);
      await h.kvSAdd('todas_sessoes', body.id);

      return res.status(200).json({ ok: true, sessao: resumir(sessao) });
    }

    // ---------- DELETE ----------
    if (req.method === 'DELETE') {
      if (!sessionId) return res.status(400).json({ error: 'ID obrigatório.' });
      const sess = await h.kvGet('sessao:' + sessionId);
      if (!sess || sess.cpfHash !== cpfHash) {
        return res.status(404).json({ error: 'Sessão não encontrada.' });
      }
      await h.kvDel('sessao:' + sessionId);
      await h.kvSRem('aluno_sessoes:' + cpfHash, sessionId);
      await h.kvSRem('todas_sessoes', sessionId);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro: ' + err.message });
  }
};
