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

## Em andamento — Fase 1 (desenho aprovado, nesta ordem)
1. **Nova navegação + Cadastros como hub** ← COMEÇAR POR AQUI. Menu de topo mantém
   Triagem/Produção/Rota/Entregues/Relatórios/Cadastros; Cadastros vira hub com sub-abas
   (Clientes, Itens, Motoristas, Vendedores/Rotas/Cidades, Usuários).
2. **Cadastro de Itens** — mapeia produto → unidade (kg, unidade, milheiro) + tipo de
   material (deixar o campo preparado pro custo da Fase 2). Captura automática no import
   (padrão do Clientes) + filtro "sem unidade" com badge contador. Quantidade vem do Posseidon.
3. **Totais nos rodapés + módulo de Relatórios** — soma por unidade nos rodapés de
   Produção/Rota ("Plástico: 100 kg · Papel: 200 un") e relatórios de consumo físico
   filtráveis por linha, rota, vendedor e data de entrega.
4. **Motoristas + financeiro + Entregues editável** — cadastro de Motoristas; ao marcar
   rota como entregue, escolher motorista (aplica a todos os pedidos da rota); controle
   financeiro por pedido: valor total → entrada → recebido na entrega → saldo, status
   quitado/pendente; lista de Entregues passa a ser editável.
5. **Renomear "Produção" → "Silk"** (só rótulo, sem migrar dado; botões viram S/C/Gr) +
   romaneio de conferência no fim da lista por vendedor/dia (data que o vendedor passou o
   pedido, data de entrega prevista, assinatura sua e dele).

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
