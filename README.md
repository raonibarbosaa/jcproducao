# JC Sacolas — Sistema de Controle de Produção

Sistema web (React + Vite + Firebase) para controle de produção da JC Sacolas.
Importa a planilha de expedição do Posseidon e organiza a produção por setor, rota e prazo.

## Fluxo
`Importar Excel → Triagem → Produção → Rota → Financeiro confirma → Entregues`

## Linhas de produção (3)
- **PRODUÇÃO** — silk screen (sacolas de papel) · azul `#1A5FB4`
- **GLICHE** — flexográfica (sacolas plásticas) · verde `#1C7A4E`
- **GRÁFICA** — offset (inclui o antigo laser) · laranja `#C2410C`

## Perfis
| Perfil | Triagem | Produção | Rota | Entregues |
|---|---|---|---|---|
| designer | ✓ | ✓ | — | — |
| financeiro | — | — | ✓ | ✓ |
| dono | ✓ | ✓ | ✓ | ✓ |

---

## Setup local (Mac)

```bash
cd jc-producao
npm install
# edite src/firebase.js com a config do SEU projeto Firebase novo
npm run dev      # http://localhost:5173
```

> ⚠️ **Não mexa nas restrições da API Key no Google Cloud Console.**
> Use a apiKey exatamente como vem do Firebase Console. Foi a manipulação
> de restrições que causou o bug `API_KEY_INVALID` na versão anterior.

### Teste rápido do login (terminal, dentro da pasta)
```bash
node -e "const {initializeApp}=require('firebase/app');const {getAuth,signInWithEmailAndPassword}=require('firebase/auth');const app=initializeApp({apiKey:'SUA_API_KEY',authDomain:'SEU_PROJETO.firebaseapp.com',projectId:'SEU_PROJETO'});signInWithEmailAndPassword(getAuth(app),'EMAIL','SENHA').then(u=>console.log('LOGIN OK:',u.user.email)).catch(e=>console.log('ERRO:',e.code))"
```

---

## Firebase — o que configurar
1. **Authentication** → ativar Email/senha (login sem senha desativado).
2. **Firestore** → criar em modo produção, região `southamerica-east1` (São Paulo).
3. **Regras** → publicar o conteúdo de `firestore.rules`.
4. **Usuários**: Authentication → Adicionar usuário → copiar o UID →
   Firestore → coleção `usuarios` → documento com **ID = UID** e campos:
   - `perfil` (string): `designer` | `financeiro` | `dono`
   - `nome` (string)

> O campo TEM que se chamar exatamente `perfil`.

Coleções usadas: `pedidos/`, `entregues/`, `usuarios/`.

---

## Deploy (GitHub Pages)
O workflow `.github/workflows/deploy.yml` faz build e publica em `gh-pages`
a cada push na `main`. Em **Settings → Pages**, defina a branch `gh-pages`.
Lembre de autorizar o domínio do Pages em
**Firebase → Authentication → Settings → Domínios autorizados**.

## Planilha importada
Colunas detectadas de forma flexível: ID Venda, Nome Cliente, Produto, Grupo,
Quantidade, Valor, Data da Venda, Cidade, Vendedor, Data Previsão.

- Itens são agrupados por **ID Venda** (1 pedido = N itens).
- Vendedor identificado por código (`v1`, `v2`…) — mais confiável que o nome.
- Rota detectada pela cidade. Cidade fora da lista = **FORA DE ROTA** (amarelo).
- Vendedor sem rotas cadastradas = **SEM ROTA** (preencher em `src/utils.js`).
- Previsão de entrega = mês seguinte à venda, na data fixa do vendedor.
- Situação: só **Em dia** ou **Atrasado** (atrasados sobem ao topo).
