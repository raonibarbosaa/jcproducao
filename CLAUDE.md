# JC Sacolas — Sistema de Controle de Produção

> Memória viva do projeto. Atualizar este arquivo quando o estado mudar
> (feature concluída, decisão nova, armadilha descoberta).

## O que é
Sistema web de controle de produção para a **JC Sacolas** — indústria de embalagens
personalizadas em Itabaiana-SE. Importa a planilha de expedição do ERP **Posseidon**
(que não gera relatório de produção) e organiza a produção por linha, rota e prazo.

**Fluxo:** `Importar Excel do Posseidon → Triagem → Produção → Rota → Entregues`
**Linhas de produção:** Produção (silk) / Clichê / Gráfica
**Perfis:** designer · financeiro · dono

## Stack e deploy
- **Repo:** `raonibarbosaa/jcproducao` (público). Branch `main` = fonte (React 18 + Vite),
  `gh-pages` = build publicado.
- **Hospedagem:** GitHub Pages · domínio `jcproducao.totalicontabilidade.com.br`
- **Backend:** Firebase (projeto `producaojcsacolas`, Auth + Firestore)
- **Deploy manual (worktree):**
  1. `npm run build`
  2. copiar `CNAME` de `origin/gh-pages` pro `dist/`
  3. `git worktree add -f /tmp/ghp origin/gh-pages`
  4. limpar branch → copiar `dist` → commit → push
  5. conferir via API do Pages após ~45s
  - ⚠️ Setar `git config user.email` / `user.name` a cada sessão.
- **Zeus** (segundo ERP): detecção implementada, mas **confirmado como NÃO usado**.

## Já feito (no ar)
- **Apelidos de cliente (de/para):** aba Clientes em Cadastros, resolução dinâmica no
  render via `nomeCliente()` + `normaliza()`; botão ✎ no CardTriagem. Captura automática
  de novas razões sociais em todo import.
- **Linha de produção por item:** botões P/G/Gr por item + botão "aplicar a todos";
  pedido só sai da Triagem com todos os itens classificados (`pedidoCompleto()`); na
  Produção, pedido dividido vira vários cards (um por linha). Dados em `linhasItens` no
  Firestore, gravados com `updateDoc` (nunca `setDoc`+merge).
- **Modal de resultado do import** agrupado por status, com captura de clientes inline.
- **Data de entrega dinâmica** via `previsaoDe()` (calculada no render pelo calendário do
  Cadastros, não congelada no import). Exibida na Rota e Produção.
- **Valor do pedido** no cabeçalho de cada parada da Rota.
- **Usuários** (página restrita ao dono), `FiltrosBar`, layouts de impressão de Produção e
  Rota, chips de cidade, exclusão em lote/individual (chunk 450).
- **Cadastros carregam no início:** `CadastrosProvider` só assina `config/cadastros` após o
  login (depende de `user?.uid`) — antes o `onSnapshot` disparava sem auth e morria com
  permission-denied (falso aviso "Nenhum vendedor cadastrado").
- **Motoristas:** aba Cadastros › Motoristas (CRUD; nome, telefone, ativo/inativo — placa
  NÃO entra, é do carro). Inativo some da seleção mas fica no histórico.
- **Motorista na entrega:** na Rota, seletor de motorista por rota + botão "Entregar rota
  toda"; o "✓ Entregue" individual também exige o motorista. Gravado em `entregues` no campo
  `motorista` e exibido no romaneio impresso.
- **Entregues:** mostra o motorista (chip 🚚) + filtro por motorista (inclui "sem motorista"
  e o total acompanha o filtro). Botão "↩ Cancelar entrega" devolve o pedido ao fluxo —
  visível só para **dono** e **designer**. Designer agora enxerga a aba Entregues.
- **Data de entrega manual (dono/designer):** campo `previsaoManual` no pedido (+
  `previsaoManualPor`/`previsaoManualEm` de auditoria), gravado com `updateDoc`; limpar =
  `deleteField()` ("↺ voltar ao automático"). `previsaoDe()` dá precedência à manual, então
  Produção/Rota/Meus Pedidos/Ciência reagrupam sozinhas no render (onSnapshot). UI: chip de
  data editável `src/components/DataEntrega.jsx` (✎ só p/ dono/designer; 📌 marca data manual)
  nos cards de Produção e Rota. Contador de atrasados no App.jsx considera a manual.
- **Assistente de voz (acessibilidade — Opção A, local, sem LLM):** botão flutuante 🎤
  (`src/components/AssistenteVoz.jsx`) em todas as telas. Voz→texto e texto→voz pelo
  navegador (Web Speech API, pt-BR; reconhecimento bom no Chrome, instável no Safari —
  por isso há campo de texto de reserva). O cérebro é `responderPergunta()` em `utils.js`:
  reconhece padrões (vendedor, rota, linha, atraso, produto/sacola, valor, cliente-top,
  listar clientes da rota/vendedor) e responde com os dados reais (apelidos resolvidos);
  quando não bate, diz "não entendi" com sugestões. Para o
  empresário com deficiência visual. **Opção B (LLM Claude real) planejada** — exige backend
  para proteger a API key (Firebase Functions/Blaze ou serverless) + custo por uso.

## Em andamento — Fase 1 (desenho aprovado, nesta ordem)
1. **Nova navegação + Cadastros como hub** ← COMEÇAR POR AQUI. Menu de topo mantém
   Triagem/Produção/Rota/Entregues/Relatórios/Cadastros; Cadastros vira hub com sub-abas
   (Clientes, Itens, Motoristas, Vendedores/Rotas/Cidades, Usuários).
2. **Cadastro de Itens** — mapeia produto → unidade (kg, unidade, milheiro) + tipo de
   material (deixar o campo preparado pro custo da Fase 2). Captura automática no import
   (padrão do Clientes) + filtro "sem unidade" com badge contador. Quantidade vem do Posseidon.
3. ✅ **Totais nos rodapés + módulo de Relatórios** FEITO. Regra de unidade fixa:
   **plástico → kg, papel → unidade**. Material vem do cadastro de Itens (`tipo`) com
   fallback pela inferência do nome (`materialDoItem` em utils: /PLAST/→plástico,
   /PAPEL/→papel). Helpers `totaisPorMaterial`/`somaTotais`/`fmtTotais`/`fmtQtd`.
   Produção: rodapé por rota (`.rota-totais`) e por linha (`.linha-foot`), tela+impressão.
   Rota: total por rota na banda + no romaneio. Relatórios (`Relatorios.jsx`, recebe
   `pedidos`): consumo físico por período (data de entrega/previsão viva), filtros de
   vendedor/linha/rota, quebra por linha e por rota, total geral em cards. Item explode
   por `linhaDoItem` (respeita pedido dividido).
4. **Motoristas + financeiro + Entregues editável** — ✅ cadastro de Motoristas e escolha do
   motorista na entrega FEITOS (ver "Já feito"); ✅ Entregues já editável no sentido de
   cancelar entrega. FALTA: controle financeiro por pedido (valor total → entrada → recebido
   na entrega → saldo, status quitado/pendente) + cadastro de Motoristas ligado a esse fluxo.
5. ✅ **Renomear linha "Produção" → "SILK SCREEN"** FEITO — só rótulo via `MODO_NM.PRODUCAO`
   (status no Firestore segue `PRODUCAO`); sigla do item P→S. A aba/página "Produção" (lista)
   continua com esse nome. FALTA: romaneio de conferência no fim da lista por vendedor/dia
   (data que o vendedor passou o pedido, data de entrega prevista, assinatura sua e dele).

## Perfil Vendedor + segurança (Fase B — em produção)
- **Perfil `vendedor`:** acesso só à aba "Meus Pedidos" (`MeusPedidos.jsx`), vê apenas os
  pedidos do próprio vendedor. Vínculo via campo `vendedorNome` em `usuarios/{uid}` (casado
  com `p.vendedor`). Criado em Usuários (dropdown do cadastro de vendedores). Assistente de
  voz oculto para esse perfil.
- **App.jsx:** consulta de pedidos filtra `where('vendedor','==', vendedorNome)` quando o
  perfil é vendedor. `AuthContext` expõe `vendedorNome`.
- **Segurança real:** `firestore.rules` reescrito — staff (dono/designer/financeiro) total;
  vendedor lê só os próprios pedidos; coleção `ciencias` preparada. ⚠️ As regras precisam ser
  PUBLICADAS no Firebase Console (não vão pelo deploy do Pages).
- **Impressão da Triagem (Fase A):** botão 🖨 + layout `print-only` (ImpressaoTriagem) por
  vendedor→rota.
- **Fase C (em produção):** ciência por rota. Coleção `ciencias` (append/log) com
  `{tipo:'vendedor'|'designer', vendedor, rota, pedidoIds, qtdPedidos, porUid, porEmail,
  porNome, ip, quando}`. IP via `pegarIP()` (ipify). Vendedor dá ciência em "Meus Pedidos"
  (botão por rota); designer/dono na aba **Ciência** (`Ciencia.jsx`, vendedor→rota, rota
  expansível p/ ver pedidos, mostra ciência do vendedor + dá a sua). Helpers
  `indexaCiencias`/`cienciaDe` pegam a mais recente por (tipo|vendedor|rota). Regra de
  `ciencias`: vendedor lê/cria só as do próprio `vendedorNome`.

## Design / identidade
- **Dashboards (Produção e Rota):** linha de produção = faixa colorida forte
  (`.linha-bloco`/`.linha-head`, cor de `MODO_COR`), rota = badge/banda destacada
  (`.rota-badge` na Produção, `.rota-band` na Rota) — divisão linha × rota bem evidente.
- **Rodapé Totali:** `src/components/Footer.jsx` (renderizado no `Layout`, em todas as telas) —
  "Solução desenvolvida por" (texto branco) + logo oficial. Assets em `src/assets/`:
  `totali-branca.png` (fundo escuro, em uso) e `totali-preta.png` (fundo claro/impressão).
  Logos baixadas/fornecidas pelo cliente (imagotipo "totali Soluções Contábeis").

## Fase 2 (projeto à parte, depois da base rodando)
**Módulo de custo / ficha técnica (BOM):** insumos diretos por produto (resina em kg p/
plástico, folha por tamanho p/ papel) + insumos secundários por rateio (tinta, energia) →
apuração de custo por pedido/linha/produto e margem. Depende do cadastro de Itens maduro.
> Lembrete contábil: critério de rateio e apuração (custo de estoque/CMV) tem implicação
> fiscal — validar o método com a contabilidade da JC antes de virar número oficial.

## Armadilhas recorrentes do código (LER ANTES DE EDITAR)
- **Props não declaradas na assinatura** de subcomponentes (`CardTriagem`, `CardProd`,
  `ImpressaoProducao`) causam **tela preta** — o build do Vite não pega. Sempre declarar a
  prop na função, não só passar no JSX.
- **`updateDoc` ≠ `setDoc`+merge:** para substituir o objeto `linhasItens` inteiro, usar
  `updateDoc` (o merge profundo do Firestore impede DELETE de chaves).
- **Datas no SheetJS:** arquivos de teste precisam de `Date` nativo + `cellDates: true` no
  `json_to_sheet` e no `writeFile`.
- **CNAME** tem que ir pro `dist/` antes de sobrescrever o `gh-pages`, senão cai o domínio.
- **Recalcular no render** (data, nome) em vez de congelar no import.

## Método de trabalho
Fechar o desenho antes de codar. Implementar **uma feature por vez** e testar/ajustar
entre uma e outra. Token do GitHub compartilhado na sessão é revogado depois.
