// api/painel-dados.js — retorna dados agregados para o painel.
// Requer token de painel.

const h = require('../helpers/index.js');

module.exports = async function handler(req, res) {
  try {
    const auth = await h.authenticatePainel(req);
    if (!auth) return res.status(401).json({ error: 'Não autenticado.' });

    const alunosHash = await h.kvSMembers('alunos');

    const dadosAlunos = [];
    for (const cpfHash of alunosHash) {
      const aluno = await h.kvGet('aluno:' + cpfHash);
      if (!aluno) continue;
      const ids = await h.kvSMembers('aluno_sessoes:' + cpfHash);
      const sessoes = ids.length
        ? (await Promise.all(ids.map(id => h.kvGet('sessao:' + id)))).filter(Boolean)
        : [];
      sessoes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      let cpfPlain;
      try { cpfPlain = h.decryptCPF(aluno.cpfEnc); } catch { cpfPlain = '(falha ao descriptografar)'; }

      dadosAlunos.push({
        cpfHash,
        cpf: h.formatCPF(cpfPlain),
        nome: aluno.nome,
        email: aluno.email,
        criadoEm: aluno.criadoEm,
        ultimoAcesso: aluno.ultimoAcesso,
        consentimentoEm: aluno.consentimentoEm,
        sessoes
      });
    }

    dadosAlunos.sort((a, b) => (b.ultimoAcesso || 0) - (a.ultimoAcesso || 0));

    // Estatísticas
    const todasSessoes = dadosAlunos.flatMap(a => a.sessoes);
    const completas = todasSessoes.filter(s => s.protocoloFinal);
    const designsContagem = {};
    const tiposContagem = {};

    for (const s of completas) {
      const tag = (s.designEscolhido && s.designEscolhido.tag) || 'OUTRO';
      designsContagem[tag] = (designsContagem[tag] || 0) + 1;
    }
    for (const s of todasSessoes) {
      const tipo = (s.projeto && s.projeto.tipo) || 'Não informado';
      tiposContagem[tipo] = (tiposContagem[tipo] || 0) + 1;
    }

    const distribuicaoEtapas = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const s of todasSessoes) {
      const e = s.protocoloFinal ? 4 : (s.etapaAtual || 1);
      distribuicaoEtapas[e] = (distribuicaoEtapas[e] || 0) + 1;
    }

    const estatisticas = {
      totalAlunos: dadosAlunos.length,
      totalSessoes: todasSessoes.length,
      sessoesCompletas: completas.length,
      designsMaisEscolhidos: Object.entries(designsContagem)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, n]) => ({ tag, n })),
      tiposDePesquisa: Object.entries(tiposContagem)
        .sort((a, b) => b[1] - a[1])
        .map(([tipo, n]) => ({ tipo, n })),
      distribuicaoEtapas
    };

    return res.status(200).json({ alunos: dadosAlunos, estatisticas });
  } catch (err) {
    return res.status(500).json({ error: 'Erro: ' + err.message });
  }
};
