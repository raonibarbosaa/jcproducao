# 📋 JC SACOLAS — Sistema de Controle de Produção
## Documento de Continuação (para retomar do zero)

> **Cole este arquivo inteiro no início de uma nova conversa com o Claude.** Ele contém tudo que já foi decidido e construído, além do diagnóstico do problema que travou a versão anterior.

---

## 🎯 O QUE É O PROJETO

Sistema web de controle de produção para a **JC Sacolas** — indústria de embalagens personalizadas em Itabaiana-SE (CNPJ 47.992.021/0001-02, tel (79) 99901-2605).

A empresa usa o sistema **Posseidon** (posseidom.com) que NÃO gera relatório detalhado de produção. Este sistema preenche essa lacuna: importa a planilha do Posseidon e organiza a produção por setor, rota e prazo de entrega.

**Stack escolhida:** React + Vite + Firebase (Auth + Firestore), deploy no GitHub Pages. Precisa funcionar bem em **desktop e celular**.

---

## 🔄 FLUXO DO SISTEMA

```
Importar Excel → Triagem → Lista de Produção → Lista de Rota → Financeiro confirma → Entregues
```

1. **Triagem** (designer): importa a planilha e categoriza cada pedido na linha de produção. Tem filtro "sem definição" para ver só os pendentes.
2. **Lista de Produção** (fábrica): pedidos categorizados, organizados por Vendedor → Data de entrega → Linha → Rota. Imprimível por setor.
3. **Lista de Rota** (motorista/financeiro): organizado por Rota → Cliente → Pedidos. Para carregar o caminhão.
4. **Financeiro confirma**: botão "✓ Entregue" na aba Rota. Só confirma, NÃO registra pagamento.
5. **Entregues**: histórico. Pedido entregue sai do fluxo automaticamente.

**Situação de prazo:** só dois estados — "Em dia" ou "Atrasado". Atrasados sobem ao topo. Urgentes são exceção, sem destaque visual especial.

---

## 👥 PERFIS DE ACESSO (login email/senha via Firebase Auth)

| Perfil | Triagem | Produção | Rota | Entregues |
|---|---|---|---|---|
| **designer** | ✓ categoriza | ✓ vê | — | — |
| **financeiro** | — | — | ✓ confirma entrega | ✓ vê |
| **dono** | ✓ | ✓ | ✓ | ✓ tudo |

Inspiração de UI: modelo Kanban (Kanbanify / KanbanZone).

---

## 🏭 LINHAS DE PRODUÇÃO (definidas pelo designer na triagem)

**IMPORTANTE: Imp. Laser foi REMOVIDO.** Laser e gráfica viraram só "Gráfica". São 3 linhas:

- **PRODUÇÃO** = impressão silk screen (sacolas de papel)
- **GLICHE** = impressão flexográfica (sacolas plásticas)
- **GRÁFICA** = impressão offset (inclui o que antes era laser)

Cores no sistema: PRODUÇÃO = azul `#1A5FB4`, GLICHE = verde `#1C7A4E`, GRÁFICA = laranja `#C2410C`.

---

## 📅 CALENDÁRIO DE ENTREGAS POR VENDEDOR

Pedido feito em um mês = entregue no mês seguinte, nas datas fixas de cada vendedor:

- **Sérgio:** dias 01 e 15
- **Rivanilde:** dias 05 e 20
- **Michele / Marcos:** dias 10 e 25
- **Jedeane:** dias 12 e 27

---

## 🗺️ ROTAS POR VENDEDOR (a cidade do pedido define a rota automaticamente)

Cidade fora da lista = **"FORA DE ROTA"** (exceção, destacada em amarelo).

### Sérgio
- **ROTA 01:** Ribeirópolis, Aparecida, Glória, Monte Alegre, São Miguel Aleixo, Porto da Folha, Paulo Afonso, Delmiro Gouveia, Aquidabá, Cedro de São João, Ilha das Flores, N. Sra da Glória
- **ROTA 02:** Moita Bonita, N. Sra das Dores, Capela, Carmópolis, Japaratuba, Siriri, Muribeca, Lagoa da Canoa
- **ROTA 03:** Propriá, Japoatã, Neópolis, Penedo, Coruripe, Arapiraca, Porto Real do Colégio, Teotônio Vilela, Taquarana, Minador do Negrão, Palmeira dos Índios, Junqueiro, Senador Rui Palmeira, Luís Eduardo Magalhães, Aracaju

### Rivanilde
- **ROTA 01:** Campo do Brito, Macambira, São Domingos, Lagarto, Simão Dias, Paripiranga, Poço Verde
- **ROTA 02:** Colônia 13, Salgado, Estância, Boquim, Pedrinhas, Umbaúba, Araúa, Tomar do Geru, Indiaroba, Rio Real, Cristinápolis, Tobias Barreto, Itabaianinha
- **ROTA 03:** Frei Paulo, Carira, Coronel João Sá

### Michele / Marcos
- **ROTA 01:** Aracaju, São Cristóvão, Laranjeiras, Malhador, N. Sra do Socorro

### Jedeane
- **ROTA 01:** Itabaiana, Ouro Branco, Ribeirópolis

---

## 📊 FORMATO DA PLANILHA IMPORTADA (do Posseidon)

Colunas do relatório de expedição: **ID Venda, Nome Cliente, Produto, Grupo, Quantidade, Valor, Data da Venda, Cidade, Vendedor**.

A planilha de junho usada nos testes já vinha com campos extras preenchidos manualmente: **STATUS** (PRODUÇÃO/GLICHE/GRAFICA) e **Data Previsão**. O importador detecta colunas de forma flexível (procura por nome aproximado: "produto", "cliente", "previs", "status", etc).

Dados técnicos que o Posseidon NÃO captura (ficam em pedido manual/foto): cor do plástico, cor de impressão, virgem/reciclado, plastificada, tipo de alça (gorgurão/cordão), alterações de logotipo. Esses entram no campo "obs" quando disponível.

---

## ✅ O QUE JÁ ESTAVA CONFIGURADO NO FIREBASE

Projeto criado: **"SistemadeExpedicao"**
- ID do projeto: `sistemadeexpedicao`
- Número do projeto: `12051741466`
- Plano: Spark (gratuito)

**firebaseConfig (do app web "jc-producao"):**
```js
const firebaseConfig = {
  apiKey: "AIzaSyDjVEUsHU1A9SdqsuVieUMpFYmyE5YrfEg",
  authDomain: "sistemadeexpedicao.firebaseapp.com",
  projectId: "sistemadeexpedicao",
  storageBucket: "sistemadeexpedicao.firebasestorage.app",
  messagingSenderId: "12051741466",
  appId: "1:12051741466:web:8c4f49292fb6aa94f5caa3"
}
```

- ✅ Authentication ativado (Email/senha; login sem senha DESATIVADO)
- ✅ Firestore criado (modo produção) — região nam5/US (não chegou a mudar para São Paulo)
- ✅ Regras Firestore publicadas: `allow read, write: if request.auth != null;`
- ✅ localhost nos domínios autorizados

**Usuários criados (todos perfil "dono"):**
| Email | Senha | UID |
|---|---|---|
| jcsaacolas@gmail.com | jcsacolas123 | Ya80p3HlgHbXSqLB1BaREcUvooI3 |
| raoni@totalicontabilidade.com.br | (definida no cadastro) | gLk65uGIiSgZAUsXR0515bThi7u1 |
| jonatasmateus84@gmail.com | (definida no cadastro) | zB2Md7xVv1Xm69YymGJ46RL1p1D2 |

**Coleção `usuarios` no Firestore** — cada documento usa o UID como ID e tem os campos:
```
perfil: "dono"   (string)
nome:   "JC Sacolas" / "Raoni" / "Jonatas"
```

> ⚠️ Atenção: o campo TEM que se chamar exatamente `perfil` (já houve erro com `dono:dono` por engano).

---

## 🐛 O PROBLEMA QUE TRAVOU A VERSÃO ANTERIOR (LEIA ANTES DE COMEÇAR)

O login sempre retornava **`400 Bad Request → API_KEY_INVALID → "API key not valid"`**.

**Causa raiz:** mexer nas restrições da API Key no Google Cloud Console. O que aconteceu (e o que EVITAR):

1. A "Browser key (auto created by Firebase)" original vinha restrita a 25 APIs.
2. Editamos as restrições, criamos uma 2ª chave, deletamos chaves — e em algum momento **ambas as chaves passaram a retornar API_KEY_INVALID**, mesmo com as APIs corretas (Identity Toolkit + Cloud Firestore + Firebase Installations) e "Restrições do aplicativo = Nenhum".
3. Suspeita: a propagação do Google Cloud pode levar bem mais que 5 min, OU a manipulação repetida invalidou as chaves.

### ✅ COMO EVITAR / RESOLVER no recomeço (Mac):

**Opção A — não tocar nas restrições (mais simples):**
- Ao criar o projeto Firebase novo, pegue a apiKey do `firebaseConfig` e **use exatamente como vem**. NÃO abra o Google Cloud Console, NÃO mexa em restrições de API. A chave default já funciona para Auth + Firestore.

**Opção B — se precisar checar a chave:**
- Em console.cloud.google.com → APIs e Serviços → Credenciais → Browser key:
  - "Restrições do aplicativo" = **Nenhum**
  - "Restrições de API" = **Não restringir chave** (ou as 3: Identity Toolkit API, Cloud Firestore API, Firebase Installations API)
- Depois **aguarde de verdade** (até 15-30 min) antes de concluir que não funciona. A propagação é lenta.

**Teste de diagnóstico rápido (rode no terminal, dentro da pasta do projeto):**
```bash
node -e "const {initializeApp}=require('firebase/app');const {getAuth,signInWithEmailAndPassword}=require('firebase/auth');const app=initializeApp({apiKey:'SUA_API_KEY',authDomain:'SEU_PROJETO.firebaseapp.com',projectId:'SEU_PROJETO'});signInWithEmailAndPassword(getAuth(app),'EMAIL','SENHA').then(u=>console.log('LOGIN OK:',u.user.email)).catch(e=>console.log('ERRO:',e.code))"
```
Se retornar `LOGIN OK`, o login no app vai funcionar. Se `API_KEY_INVALID`, é restrição/propagação.

**💡 Recomendação para o recomeço:** crie um **projeto Firebase totalmente novo** (nome ex: `jc-producao`) em vez de reaproveitar o `sistemadeexpedicao`. Assim a apiKey nasce limpa, sem o histórico de manipulação que pode tê-la invalidado. Mude a região do Firestore para **southamerica-east1 (São Paulo)**.

---

## 💻 PASSO A PASSO DE SETUP NO MAC

```bash
# 1. Descompactar o projeto e entrar na pasta
cd ~/Downloads/jc-producao

# 2. Instalar dependências
npm install

# 3. Editar src/firebase.js com a apiKey do SEU projeto Firebase novo
#    (use um editor como VS Code, evite encoding estranho)

# 4. Rodar localmente
npm run dev
# abre em http://localhost:5173
```

> No Mac não há o problema de encoding do Bloco de Notas do Windows nem o bloqueio de localhost do Edge. Use Safari ou Chrome normalmente.

### Criar usuários e perfis (jeito mais rápido — pelo Console)
1. Firebase Console → Authentication → Adicionar usuário (email + senha).
2. Copie o UID gerado.
3. Firestore → coleção `usuarios` → Adicionar documento com **ID = o UID** → campos `perfil` (string) e `nome` (string).

### Deploy no GitHub Pages
O repositório já foi criado no GitHub. O `README.md` tem o workflow do GitHub Actions pronto (`.github/workflows/deploy.yml` usando `peaceiris/actions-gh-pages`). Após `npm run build`, o deploy é automático a cada `git push`.

---

## 📁 ARQUIVOS DO PROJETO (incluídos neste ZIP)

```
jc-producao/
├── index.html              ← na RAIZ (não em public/ — isso causava erro 404)
├── package.json
├── vite.config.js          (base: './')
├── README.md               ← setup geral + workflow de deploy
├── CONTINUACAO.md          ← este arquivo
└── src/
    ├── firebase.js         ← COLAR a apiKey do projeto novo aqui
    ├── utils.js            ← ROTAS_DEF, VMAP, detecção de vendedor/rota, datas
    ├── index.css           ← estilos (fonte IBM Plex, cores das linhas)
    ├── main.jsx
    ├── App.jsx             ← roteamento + contadores em tempo real
    ├── contexts/
    │   └── AuthContext.jsx ← login/logout, lê perfil da coleção 'usuarios'
    ├── components/
    │   └── Layout.jsx      ← header + tabs filtradas por perfil
    └── pages/
        ├── Login.jsx
        ├── Triagem.jsx     ← importa Excel (xlsx) + categoriza
        ├── Producao.jsx    ← agrupado por vendedor/data/linha/rota
        ├── Rota.jsx        ← agrupado por rota/cliente + botão "Entregue"
        └── Entregues.jsx   ← histórico
```

**Coleções Firestore usadas:** `pedidos/`, `entregues/`, `usuarios/`.

> Nota: o código atual de Triagem.jsx ainda mostra o botão "Laser" em alguns lugares. Como decidimos REMOVER o laser (vira Gráfica), na nova versão peça ao Claude para remover a 4ª opção e deixar só Produção / Gliche / Gráfica. As constantes em `utils.js` (MODO_ORDER, MODO_NM) já estão com as 3 linhas.

---

## 🚀 PRIMEIRA MENSAGEM SUGERIDA PARA A NOVA CONVERSA

> "Estou retomando o sistema de controle de produção da JC Sacolas. Anexo o CONTINUACAO.md com todo o contexto e o ZIP com os arquivos. Estou no Mac. Quero criar um projeto Firebase novo do zero (para evitar o bug de API_KEY_INVALID da versão anterior) e me guie passo a passo. Confirme que leu o documento e comece pelo Firebase."
