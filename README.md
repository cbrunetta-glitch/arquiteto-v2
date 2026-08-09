# O Arquiteto

Consultor de design metodológico para pesquisa jurídica de doutorado (PPGD · FADISP).

O aluno descreve seu projeto, recebe 3 designs metodológicos possíveis, escolhe um, refina em diálogo socrático de até 3 rodadas e sai com um **Protocolo Metodológico Provisório** pronto para colar como Item 08 do documento acumulativo. A professora acompanha tudo por um painel restrito.

Registro de programa de computador no INPI: **BR512026003545-7**.

---

## Onde fica

| | |
|---|---|
| App dos alunos | https://oarquitetofadisp.com |
| Painel da professora | https://oarquitetofadisp.com/painel.html |
| Repositório | `cbrunetta-glitch/arquiteto-v2` |
| Hospedagem | Vercel (deploy automático a cada push na `main`) |
| Banco | Vercel Redis |

> Existe também um repositório `arquiteto-v3`, **vazio**, criado por engano. Ignore.

---

## ⚠️ Antes de mexer: a raiz do projeto é a subpasta

Na Vercel, o **Root Directory** está configurado como `o-arquiteto-v2/`. Isso significa que **tudo que estiver fora dessa pasta simplesmente não vai para o ar** — sem erro, sem aviso.

Foi exatamente isso que derrubou o painel: o `painel.html` estava na raiz do repositório e devolvia 404 em produção. O `vercel.json` estava no mesmo lugar, então o cron de limpeza da LGPD nunca era registrado.

**Arquivo novo que precisa ser publicado vai dentro de `o-arquiteto-v2/`.** Só o README fica de fora.

```
arquiteto-v2/
├── README.md                        ← este arquivo (não é publicado)
└── o-arquiteto-v2/                  ← raiz do projeto na Vercel
    ├── api/
    │   ├── chat.js                  proxy da API da Anthropic (autenticado)
    │   ├── cadastrar.js             cria conta do aluno
    │   ├── login.js                 login do aluno
    │   ├── me.js                    valida sessão / logout
    │   ├── sessoes.js               CRUD de sessões
    │   ├── excluir-conta.js         LGPD: aluno apaga tudo
    │   ├── painel-login.js          login da professora
    │   ├── painel-dados.js          dados agregados do painel
    │   ├── painel-excluir-sessao.js professora exclui sessões
    │   └── cleanup.js               cron diário: apaga inativos > 6 meses
    ├── helpers/index.js             Redis, criptografia, validação, auth
    ├── index.html                   app dos alunos
    ├── painel.html                  painel da professora
    ├── package.json                 dependência do cliente Redis
    └── vercel.json                  cron diário + limite de tempo do /api/chat
```

São 10 funções serverless (o limite do plano Hobby é 12).

---

## Variáveis de ambiente

Todas em **Settings → Environment Variables**, marcadas para Production, Preview e Development. Depois de alterar qualquer uma, é preciso fazer **Redeploy** — não basta salvar.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | sim | Chave da API da Anthropic |
| `REDIS_URL` | sim | Criada automaticamente pelo Vercel Redis |
| `PROFESSORA_PIN` | sim | Senha do painel. **Sem limite de tamanho ou formato — use uma frase longa** |
| `ENCRYPTION_KEY` | sim | 64 caracteres hexadecimais. Criptografa os CPFs no banco |
| `ANTHROPIC_MODEL` | não | Padrão: `claude-opus-5` |
| `ANTHROPIC_EFFORT` | não | Padrão: `medium`. Aceita `low`, `medium`, `high` |

### Gerando a `ENCRYPTION_KEY`

Precisa ter **exatamente 64 caracteres hexadecimais** (32 bytes). No console do navegador (F12 → Console):

```js
Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('')
```

Ou no terminal Mac/Linux: `openssl rand -hex 32`.

> **Guarde uma cópia em local seguro.** Se essa chave for perdida, os CPFs deixam de ser legíveis no painel. O login continua funcionando (usa hash, não a criptografia), mas os CPFs em texto claro se perdem para sempre.

---

## Modelo, custo e latência

O `/api/chat` usa `claude-opus-5` com esforço `medium`. Ambos vêm de variáveis de ambiente, então dá para trocar **sem mexer no código nem fazer commit** — só alterar na Vercel e redeployar.

- Uma sessão completa de aluno (3 designs + 3 rodadas + protocolo) custa alguns centavos de dólar.
- A geração dos designs leva de **20 a 40 segundos** — o modelo raciocina antes de responder. O `vercel.json` dá 60 segundos de limite para essa função.
- **Se aparecer erro de timeout:** baixe `ANTHROPIC_EFFORT` para `low` e redeploy. No Opus 5 isso não é um rebaixamento dramático.
- Se o custo virar problema numa turma grande, `claude-sonnet-5` em `ANTHROPIC_MODEL` corta o valor pela metade.

---

## Como funcionam as partes delicadas

**Os 3 designs usam structured outputs.** O esquema (`SCHEMA_DESIGNS`, em `index.html`) é enviado à API, que garante JSON válido. Antes o modelo era apenas *pedido* a devolver JSON, e qualquer resposta truncada quebrava tudo com um erro de parsing sem relação com a causa real.

**O `/api/chat` tem retry com espera progressiva** para 429 e 5xx, com orçamento de 40 segundos. Isso existe porque a turma inteira usa a mesma chave de API ao mesmo tempo — limite de requisições é o cenário esperado, não a exceção.

**O limite de 3 rodadas é garantido em código**, não só pedido no prompt. Se o modelo não emitir a marca `REFINAMENTO_CONCLUÍDO`, o app encerra assim mesmo e gera o protocolo.

**O campo `familia`** (família metodológica) chamava-se `abordagem` e trazia "qualitativa / quantitativa / misto" — uma taxonomia de ciências sociais empíricas que empurrava a IA para pesquisa de campo mesmo quando a pergunta pedia dogmática. Sessões salvas antes da mudança continuam sendo exibidas: a função `familiaDe()` aceita os dois nomes. **Não remova essa compatibilidade.**

---

## Proteções

Todos os números abaixo conferidos no código.

| Item | Como |
|---|---|
| CPF no banco | Hash SHA-256 (chave de busca) + AES-256-GCM (para descriptografar no painel) |
| Senha do aluno | PBKDF2 com 100.000 iterações e salt aleatório por aluno |
| Login do aluno | 5 tentativas erradas bloqueiam **aquele CPF** por 5 minutos |
| Login do painel | 5 tentativas erradas bloqueiam o painel por 5 minutos. O contador é **único para o painel**, não por usuário nem por IP — então tentativas de um estranho deixam você esperando. É proposital: contar por IP seria contornável. Não afeta os alunos |
| Tokens de sessão | 256 bits aleatórios. Expiram em 7 dias (aluno) ou 12 horas (painel) |
| Dados antigos | Apagados após 6 meses sem acesso, por cron diário às 3h UTC |

---

## LGPD

A tela de cadastro exige aceite de termo de consentimento. O aluno pode apagar todos os seus dados a qualquer momento em **Minha conta → Excluir meus dados**.

Como controladora, você pode ver tudo no painel e excluir sessões específicas.

> **Confira que o cron está registrado** em Settings → Cron Jobs: precisa aparecer `/api/cleanup`. Ele já ficou sem rodar por causa do problema de estrutura descrito acima, e é ele que cumpre a promessa de descarte automático feita ao aluno no cadastro.

---

## Limitações conhecidas

- **A senha do aluno tem 4 dígitos** — 10.000 combinações. É uma escolha de conveniência para a turma; com o bloqueio por CPF fica adequado ao contexto, mas não é segurança bancária. A senha do **painel** não tem essa limitação e deve ser uma frase longa, porque é ela que guarda os dados de todo mundo.
- **O cron do plano Hobby roda 1× por dia.** Se a Vercel mudar o free tier, dá para acionar manualmente acessando `/api/cleanup` no navegador.
- **O painel é público na URL** — protegido só pelo PIN. Não compartilhe o link com alunos.

---

## Se algo der errado

| Sintoma | Causa provável |
|---|---|
| Uma página nova dá 404 | Está fora de `o-arquiteto-v2/`. Veja o aviso lá em cima |
| Deploy falha citando `redis` | `package.json` não está em `o-arquiteto-v2/` |
| Login dá erro 500 | `ENCRYPTION_KEY` faltando ou sem os 64 caracteres hex. Confira e redeploy |
| Painel não abre | `PROFESSORA_PIN` não salva, ou faltou redeploy depois de salvar |
| "Painel bloqueado por N minuto(s)" | 5 tentativas erradas. É global — espere os 5 minutos |
| A resposta foi cortada | Erro real da API, não bug de parsing. Se repetir, é caso de investigar |
| Erro de timeout ao gerar designs | Baixe `ANTHROPIC_EFFORT` para `low` e redeploy |
| Muitos erros durante a aula | Limite de requisições. O retry já cobre o normal; se persistir, é caso de subir o limite da conta na Anthropic |

Para qualquer outro problema, o diagnóstico começa em dois lugares: o console do navegador (F12 → Console) e, na Vercel, **Deployments → último deploy → Function Logs**.
