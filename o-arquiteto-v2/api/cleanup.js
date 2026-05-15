// api/cleanup.js — chamado pela Vercel diariamente.
// Apaga dados de alunos com inatividade > 6 meses.

const h = require('../helpers/index.js');

const SEIS_MESES_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~180 dias

module.exports = async function handler(req, res) {
  try {
    // Proteção: se CRON_SECRET estiver definido, exige header Authorization correspondente.
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const provided = req.headers && req.headers.authorization ? req.headers.authorization : '';
      if (provided !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Não autorizado.' });
      }
    }

    const limite = Date.now() - SEIS_MESES_MS;
    const alunosHash = await h.kvSMembers('alunos');

    let alunosRemovidos = 0;
    let sessoesRemovidas = 0;

    for (const cpfHash of alunosHash) {
      const aluno = await h.kvGet('aluno:' + cpfHash);
      if (!aluno) {
        await h.kvSRem('alunos', cpfHash);
        continue;
      }
      const ultimo = aluno.ultimoAcesso || aluno.criadoEm || 0;
      if (ultimo < limite) {
        const ids = await h.kvSMembers('aluno_sessoes:' + cpfHash);
        for (const id of ids) {
          await h.kvDel('sessao:' + id);
          await h.kvSRem('todas_sessoes', id);
          sessoesRemovidas++;
        }
        await h.kvDel('aluno_sessoes:' + cpfHash);
        if (aluno.email) await h.kvDel('email:' + aluno.email);
        await h.kvDel('aluno:' + cpfHash);
        await h.kvSRem('alunos', cpfHash);
        alunosRemovidos++;
      }
    }

    return res.status(200).json({
      ok: true,
      executadoEm: new Date().toISOString(),
      alunosRemovidos,
      sessoesRemovidas
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no cleanup: ' + err.message });
  }
};
