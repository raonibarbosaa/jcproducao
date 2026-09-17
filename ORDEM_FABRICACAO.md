# Ordem de Fabricação (OF) + cor da impressão — desenho

> Desenho fechado com o dono em 16/09/2026. **Fases A, B e C FEITAS (16/09/2026);** D (relatórios) a fazer.
> Implementar por fases (A → D), testando entre uma e outra.

## Por que existe
Hoje a produção anda **por pedido**: a fila do Silk mostra um card por pedido.
Na fábrica não é assim — o gestor junta sacolas **iguais** de pedidos diferentes
e manda imprimir de uma vez: *sacola plástica 30×40 com impressão preta* de 7
clientes vai para a máquina junta. Trocar tinta e ajustar tamanho é o que custa;
agrupar é o que dá produtividade.

**Fluxo novo:** `Triagem (linha + COR) → ORDENS DE FABRICAÇÃO → Produção → Montagem → Expedição → …`

## Decisões do dono (16/09/2026)
| Tema | Decisão |
|---|---|
| Cores | **Preto · Dourado · Vermelho · Rosa · Branca · Prata · Laranja · Tiffany · Azul Médio · Azul BB · Duas cores** (as seis últimas em 17/09/2026), só em item de **plástico**, marcadas na **Triagem** |
| "Duas cores" | Escolhe **quais duas** (ex.: Preto + Dourado). Preto+Dourado e Preto+Vermelho são OFs diferentes |
| Alcance da OF | **Só na impressão** (a linha). Ao concluir, cada item volta a andar pelo SEU pedido na Montagem (volumes e embalagem por pedido, como hoje) |
| Quem solta | **Dono e designer** (sem perfil novo) |
| Materiais | **Só plástico**, por enquanto. Papel, etiqueta e alça seguem como hoje |

## Modelo de dados

### Cor — `pedidos/{id}.cores`
`{ <keyDoItem>: ['preto'] | ['preto', 'dourado'] }` — mapa por **chave do item**
(`keyDoItem`), igual a `acabamentos` e `linhasItens`: o import sobrescreve
`itens`, e mapa por posição levaria a cor para o item errado.
- `CORES_IMPRESSAO` (utils) = lista fixa `{id, nm, hex}`, como `LAMINACOES`.
  Cor nova = uma linha a mais na constante.
- **Duas cores** = array com 2 ids. A **chave da cor** para agrupar é o array
  ORDENADO (`dourado+preto`), senão "Preto + Dourado" e "Dourado + Preto"
  virariam OFs diferentes.
- **Trava:** item de plástico só sai da Triagem com a cor marcada
  (`statusDaTriagem` — só para pedido que ainda não tem status; ver fase A).
  Sem cor não há como agrupar.
- Selo de cor (bolinha com a cor + nome) colado no produto em toda tela, como o
  `SeloLinha`. Na impressão P&B vai o NOME, porque a bolinha não se distingue.

### Ordem — coleção `ordens/{id}`
```
{ numero, status: 'liberada' | 'cancelada',
  linha, material: 'plastico', produto (nome), produtoKey (normaliza), cores: [...],
  unidade, itens: [{ idVenda, itemKey, qtd, previsao }],   // retrato da liberação
  criadaEm, criadaPor, canceladaEm, canceladaPor, motivo }
```
- **Agrupamento = linha + produto + cor.** O tamanho já vem no nome do produto
  do Posseidon (`SACOLA PLASTICA 30X40`), então produto já separa tamanho. Plástico
  pode ir para o Silk ou para o Clichê — a linha entra na chave para não misturar.
- **"Em produção" e "concluída" são DERIVADOS, não gravados:** concluída = nenhum
  item da OF tem mais quantidade na linha. Assim o operador não precisa escrever
  em `ordens` (a rule dele continua só `etapas`) e o status nunca discorda do
  quadro.
- **Numeração nunca se repete:** cancelar é mudar status, nunca apagar — mesma
  lição da previsão (`proximoNumeroPlano`: apagar a mais alta fazia o número
  seguinte repetir).
- A quantidade mostrada é a **viva** (o que ainda está na linha, lido do pedido);
  o `qtd` gravado é só o retrato da liberação, para a ficha e o histórico.

### Vínculo no pedido — `pedidos/{id}.ofs`
`{ <keyDoItem>: <ordemId> }`, gravado no **mesmo batch** que cria/cancela a OF.
É o que o quadro e a Triagem consultam para saber "este item já tem OF" sem
varrer a coleção inteira. Um item só pode estar em **uma OF viva** por vez.

## Fases

### A — Cor na Triagem ✅ FEITA (16/09/2026)
Como ficou (helpers em utils, testes em `tests/cores.test.mjs` e
`tests/render/triagem.jsx`):
- `CORES_IMPRESSAO`, `limpaCores`, `coresDoItem`, `coresDoItemPorChave` (telas
  que recortam os itens — lista por linha, Rota — leem pelo `it.key`),
  `itemPedeCor`, `coresCompletas`, `chaveCor`, `fmtCores`.
- ⚠️ **`pedidoCompleto` NÃO mudou.** Quem decide o status é `statusDaTriagem`:
  a cor só é exigida de pedido SEM status. Pedido de plástico triado antes da
  cor existir já está na produção — exigir a cor dele faria o próximo Salvar
  zerar o status e o pedido sumir do quadro. O card desse pedido mostra o aviso
  "já está na produção… sem a cor não entra numa OF".
- "Sem definição" (filtro e contador) = `pendenteNaTriagem`: linha faltando OU
  pedido com itens e sem status (o que está esperando a cor).
- "Duas cores" é um estado da TELA (`duasAbertas`) até a 2ª cor ser escolhida;
  no banco só existe o array. Salvar com uma cor só = cor única.
- `SeloCor` (bolinha + NOME, que é o que vale no P&B) no quadro, lista de
  produção (tela e impressão), impressão da Triagem, Rota (tela e romaneio) e
  Localizar. Faltam Carga, Entregues, Auditoria e quadro do vendedor.
- O import grava com `merge`, então `cores` sobrevive ao reimport (conferido).
- Rules: nada novo (staff já atualiza `pedidos` inteiro).

Desenho original:
- Botões de cor em todo item de plástico no `CardTriagem` (rascunho + Salvar,
  como os acabamentos); "Duas cores" abre a escolha das duas.
- `salvarTriagem` grava `cores` no mesmo `updateDoc`.
- `pedidoCompleto` exige cor no plástico.
- Selo de cor: quadro, lista de produção, impressões, Localizar.
- ⚠️ **Conferir antes:** que o import preserva `cores` e `ofs` (hoje preserva
  `acabamentos`/`linhasItens` — o campo novo precisa ir para a mesma lista).

### B — Tela "Ordens de Fabricação" ✅ FEITA (16/09/2026)
Como ficou (`src/pages/OrdensFabricacao.jsx`; helpers em utils; testes em
`tests/ordem.test.mjs` e `tests/render/ordens.jsx`):
- Aba `ordens` logo depois da Triagem, para dono e designer (`ACESSO`).
- Helpers: `itensAguardandoOF` (pedido COM status, plástico, com linha, com
  cor, com saldo NA LINHA, sem OF viva), `agrupaParaOF`, `chaveGrupoOF`,
  `docOF`, `situacaoDaOF`, `ofDoItem` (vínculo só vale se a OF está viva —
  vínculo de OF cancelada não prende), `idsDeOFsVivas`, `ofsComVinculo`,
  `proximoNumeroOF`/`fmtNumeroOF` (`OF 0012`), `plasticoSemCor`.
- Soltar confere de novo, no clique, se nenhum item entrou em outra OF; OF +
  vínculos num `writeBatch`. Um pedido com dois itens iguais no mesmo grupo
  acumula no mesmo mapa `ofs`.
- Cancelar pede motivo, grava `feitoAoCancelar` e só tira o vínculo dos itens
  que ainda apontam para ESTA OF.
- Situação derivada (`liberada` → `em_producao` → `concluida`); "falta" nunca
  passa do que foi liberado — se um reimport aumentar o item, o excedente fica
  preso ao vínculo até a OF concluir (⚠️ limitação conhecida: a fase C precisa
  decidir se o excedente vira espera de OF nova).
- Ficha impressa (`FichaOF`) via `print-only`, com a cor por extenso e grande.
- Filtros: `FiltrosBar` (na espera), linha e cor (inclui as duplas que existem).
- Rules: `ordens` read staff+operador+expedição; create/update `soltaOF()`
  (dono/designer), create exige `criadaUid == auth.uid`; delete `false`.
  ⚠️ Publicar ANTES do build.

Desenho original:
- **Aguardando OF:** itens de plástico triados, sem OF, com saldo na linha,
  **agrupados por linha + produto + cor**, somando a quantidade e contando os
  pedidos. Ordem: o grupo com a entrega mais urgente primeiro.
- **Soltar OF:** abre o grupo, lista os pedidos (cliente, qtd, data), todos
  **marcados** e ordenados pelo prazo; o gestor desmarca o que não vai agora.
  Cria a OF + grava `ofs` nos pedidos num `writeBatch`.
- **OFs abertas** e **histórico** (concluídas/canceladas), com quem soltou e quando.
- **Cancelar OF:** exige motivo; tira o vínculo `ofs` dos itens que ainda estão
  na linha. O que já foi impresso **não volta** — aconteceu.
- **Ficha impressa da OF:** nº, linha, produto, tamanho, cor (por extenso),
  total, e a tabela de pedidos (cliente, cidade, qtd, entrega) com quadradinho de
  conferir.
- Filtros: linha, cor, vendedor, período (a `FiltrosBar`).
- Rules: `ordens` read para staff + operador + expedição; create/update só
  dono/designer; delete `false`.

### C — Quadro por OF ✅ FEITA (16/09/2026)
Como ficou (testes em `tests/ofquadro.test.mjs` e `tests/render/ordens.jsx`):
- **Virada escalonada (decisão do dono):** `config/producao` =
  `{ofExigida, ofDesde, ofPor, ofMarcados}`, ligada por um botão só do dono na
  aba de OFs (`PainelVirada`). O clique tira a FOTO (`marcacaoDaVirada`) e grava
  `pedidos.semOF[key] = true` em lotes ANTES de ligar a chave — na ordem
  contrária a fila de plástico sumiria por alguns segundos. Pedido sem status
  (ainda na Triagem) não entra na foto. "Desligar" existe; as marcas ficam.
- As sacolas que "já estavam na fila" NÃO aparecem em "Aguardando OF" (decisão
  do dono): `itensAguardandoOF` e `plasticoSemCor` pulam `jaEstavaNaFila`.
- `modoNaLinha` decide cada item nas colunas de LINHA: `of` (card da OF viva,
  com ou sem a exigência), `espera` (fora do quadro, conta no aviso ⏳) ou
  `avulso` (como sempre; com a exigência ligada o legado ganha a etiqueta
  "sem OF · já estava na fila"). Papel é sempre avulso.
- `ordens` e `config/producao` são lidos no **App** e descem para a aba de OFs
  e para a Produção (quadro + contadores das abas, que pulam o que espera OF).
- `CardOFQuadro`: pedidos da OF pelo prazo, `→` por pedido, campo de
  quantidade da OF e "Concluir OF → Montagem Plástico" / "Concluir N kg".
  `distribuiBaixaOF` completa o mais urgente primeiro. `moverOF` grava cada
  pedido + o log dele (com `ordemId`/`ordemNumero`) e quebra em lotes de 450
  sem nunca separar um pedido do seu registro. `regsDeQtd` é a mesma auditoria
  do mover por quantidade.
- **Excedente de reimport:** `situacaoDaOF.falta` passou a ser o que ESTÁ na
  linha (sem limitar ao liberado) + `excedente`. Limitado, o excedente ficava
  invisível para sempre (vínculo tira da espera, OF "concluída"). O card da OF
  (aba e quadro) mostra "Aumentou N depois da OF" — o gestor cancela e solta de
  novo (decisão do dono).
- Rules: nada novo (`config` já é write de staff; `semOF` é update de staff).

Desenho original:
- Na coluna da linha, **item de plástico aparece dentro do card da SUA OF**, não
  no card do pedido: `OF #0012 · 30X40 · PRETO · 42 kg · 7 pedidos`, com a
  lista de pedidos embaixo.
- **Plástico sem OF não entra no quadro** (trava por item, como a laminação da
  gráfica) e o quadro conta quantos estão esperando OF.
- **Baixa da OF** (`Concluir →` / `Concluir parte →`): a quantidade digitada é
  distribuída entre os pedidos **pela data de entrega, o mais urgente primeiro**
  (`distribuiBaixaOF`), e vira os mesmos movimentos por item de hoje
  (`mapaEtapasComQtd` por pedido) + um registro de auditoria **por pedido×item**
  (com `ordemId`), tudo num `writeBatch`. Entrega parcial, relógio da fila e
  volumes continuam funcionando porque o que muda é só QUEM monta os movimentos.
- Depois da linha, cada item segue pelo **seu pedido** (Montagem por pedido).
- Tablet/PIN: igual — a baixa da OF sai no nome de quem digitou o PIN.
- ⚠️ Limite do batch (500 escritas): OF muito grande pode precisar de quebra.

### D — Virada e relatórios
- ⚠️ **Dia da virada:** plástico que JÁ está no quadro hoje não pode sumir.
  Proposta: item de plástico **com movimento anterior à virada** continua
  aparecendo como card avulso (tag "sem OF") até sair da linha; o que for triado
  depois exige OF. Confirmar com o dono antes de ligar a trava.
- Relatório: OFs por período, tempo de fila até a OF e da OF até concluir
  (usa o relógio da fila que já existe).

## Pendente de confirmar
- A lista de cores é **fixa no código** (como a laminação). Se o dono quiser
  cadastrar cor nova sozinho, vira um cadastro em Cadastros.
- Regra da virada (fase D).
