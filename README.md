# O Arquiteto v4.0 — Deploy

A v4.0 tem backend completo: alunos se cadastram, dados ficam no servidor, e a professora tem um painel para acompanhar tudo.

---

## 📦 Estrutura final

```
o-arquiteto-v2/
├── api/
│   ├── chat.js                      ← proxy Anthropic (autenticado)
│   ├── cadastrar.js                 ← cria conta do aluno
│   ├── login.js                     ← login do aluno
│   ├── me.js                        ← valida sessão / logout
│   ├── sessoes.js                   ← CRUD de sessões
│   ├── excluir-conta.js             ← LGPD: aluno apaga tudo
│   ├── painel-login.js              ← login da professora
│   ├── painel-dados.js              ← dados agregados para o painel
│   ├── painel-excluir-sessao.js     ← professora pode excluir sessões
│   └── cleanup.js                   ← cron diário: apaga inativos > 6 meses
├── helpers/
│   └── index.js                     ← Redis, criptografia, validação, auth
├── package.json                     ← dependência do cliente Redis
├── index.html                       ← app dos alunos
├── painel.html                      ← painel da professora
└── vercel.json                      ← cron diário
```

10 funções serverless (limite Hobby = 12, dentro).

---

## 🚀 Passo a passo de deploy

### 1) Subir os arquivos no GitHub

Substitua os arquivos atuais do repositório `arquiteto-v2`, mantendo a pasta `o-arquiteto-v2/` como raiz (já configurada na Vercel).

**Apague** qualquer `chat.js` antigo solto na raiz — o novo já está dentro de `api/`.

⚠️ **Importante:** o `package.json` é **novo** — é ele que instala o cliente Redis. Sem ele, o deploy falha.

### 2) Banco de dados (Vercel Redis) ✅

Você já criou. A variável `REDIS_URL` aparece nas envs (vi no print). O código já está adaptado para usá-la.

### 3) Variáveis de ambiente

Status atual conforme seu print:

| Variável | Status |
|---|---|
| `ANTHROPIC_API_KEY` | ✅ Configurada |
| `REDIS_URL` | ✅ Criada automaticamente pelo Redis |
| `PROFESSORA_PIN` | ✅ Configurada |
| **`ENCRYPTION_KEY`** | ❌ **Falta criar** |

#### Como criar a `ENCRYPTION_KEY`

Essa chave criptografa os CPFs dos alunos no banco. Precisa ter **exatamente 64 caracteres hexadecimais** (32 bytes).

**Gere usando um destes métodos:**

🟢 **No console do navegador (F12 → Console)** — mais fácil:
```js
Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('')
```
Copia o resultado entre aspas e cola na Vercel.

🟢 **Terminal Mac/Linux:**
```bash
openssl rand -hex 32
```

🟢 **Site online:** https://www.random.org/bytes/ → escolha "32 bytes" e "Hexadecimal"

Depois de gerar:
- Vercel → Settings → Environment Variables → **Add New**
- Name: `ENCRYPTION_KEY`
- Value: cole a chave hex gerada
- Environments: marque **Production**, **Preview** e **Development**
- Save

⚠️ **Importante:** se você perder essa chave, perde acesso aos CPFs em texto plano no painel (o sistema continua funcionando, porque o login usa hash do CPF — mas você não veria mais os CPFs descriptografados). **Guarde uma cópia em local seguro.**

### 4) Redeploy

Deployments → último deploy → **... → Redeploy**

(É essencial fazer o redeploy depois de adicionar a `ENCRYPTION_KEY`.)

### 5) Testar

- `arquiteto-v2-9y3w.vercel.app` → cadastro/login dos alunos
- `arquiteto-v2-9y3w.vercel.app/painel.html` → painel da professora
  - **Salve esse link nos favoritos** — não compartilhe com alunos
  - Entra com a `PROFESSORA_PIN` que você definiu

Sugiro: faça um cadastro de teste com um CPF válido seu, crie uma sessão, e entre no painel para confirmar que tudo aparece corretamente.

---

## 🔒 Proteções implementadas

| Item | Como |
|---|---|
| CPF no banco | Hash SHA-256 (chave de busca) + AES-256-GCM (para você descriptografar no painel) |
| Senha do aluno | PBKDF2 100.000 iterações + salt aleatório por aluno |
| Tentativas de login | 5 tentativas → bloqueio de 5 min (aluno e painel) |
| PINs óbvios | Bloqueados no cadastro (0000, 1234, 1111, datas comuns, etc.) |
| Tokens de sessão | Aleatórios de 256 bits, expiram em 7 dias (aluno) ou 12h (painel) |
| Dados antigos | Apagados automaticamente após 6 meses sem acesso (cron diário 3h UTC) |

## 📋 LGPD

A tela de cadastro tem termo de consentimento que precisa ser aceito. Os alunos podem excluir todos os dados a qualquer momento em "Minha conta → Excluir meus dados".

Você (controladora) pode:
- Ver tudo no painel
- Excluir sessões específicas
- O banco apaga automaticamente quem fica 6 meses sem acessar

## ⚠️ Limitações conhecidas

- **Senha de 4 dígitos** = 10.000 combinações. Com o rate limiting está OK para turma de doutorado, mas não é segurança bancária.
- **Cron na Vercel Hobby** roda 1× por dia. Se a Vercel mudar o free tier, você pode acionar manualmente acessando `/api/cleanup` no navegador.

---

## 🆘 Se algo der errado

**Deploy falhou com erro sobre `redis`:** verifique que o `package.json` está no repositório (na pasta `o-arquiteto-v2/`).

**Login retorna erro 500:** provavelmente a `ENCRYPTION_KEY` está faltando ou inválida (não tem 64 caracteres hex). Confira em Settings → Environment Variables e faça redeploy.

**Painel não abre:** confirme que `PROFESSORA_PIN` foi salva e que você fez redeploy depois.

Qualquer outro problema: me chama com print do erro do navegador (F12 → Console) ou da Vercel (Deployments → último → Function Logs).
