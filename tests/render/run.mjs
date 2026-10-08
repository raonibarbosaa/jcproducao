// RENDER CHECK — a tela MONTA?
//
// Por que existe: prop não declarada na assinatura de um subcomponente dá TELA
// PRETA e o build do Vite não pega (é a armadilha nº 1 do projeto, registrada no
// CLAUDE.md). `npm test` cobre as regras de negócio em `utils.js`, e não toca em
// React. Isto renderiza a tela de verdade — com dados de verdade — e confere que
// o texto que importa chegou no HTML.
//
// Sem dependência nova: usa o vite e o react-dom que já estão aqui. O Firestore
// e os contextos entram como stubs (tests/render/stubs), então nada de rede.
//
// Roda com `npm run test:tela`.
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const stub = (f) => join(aqui, 'stubs', f)
const OUT = join(aqui, '.out')

await build({
  root: join(aqui, '..', '..'), logLevel: 'error',
  build: {
    ssr: true, outDir: OUT, emptyOutDir: true, minify: false,
    rollupOptions: { input: { financeiro: join(aqui, 'financeiro.jsx'), usuarios: join(aqui, 'usuarios.jsx'), meupin: join(aqui, 'meupin.jsx'), posto: join(aqui, 'posto.jsx'), triagem: join(aqui, 'triagem.jsx'), ordens: join(aqui, 'ordens.jsx'), cores: join(aqui, 'cores.jsx'), controle: join(aqui, 'controle.jsx'), paginas: join(aqui, 'paginas.jsx'), clientes: join(aqui, 'clientes.jsx'), aviso: join(aqui, 'aviso.jsx') } },
  },
  resolve: {
    alias: [
      { find: /^firebase\/firestore$/, replacement: stub('firestore.js') },
      { find: /^firebase\/app$/, replacement: stub('fbapp.js') },
      { find: /^firebase\/auth$/, replacement: stub('fbauth.js') },
      { find: /\.\.\/firebase\.js$/, replacement: stub('firebase.js') },
      { find: /^.*contexts\/AuthContext\.jsx$/, replacement: stub('Auth.jsx') },
      { find: /^.*contexts\/CadastrosContext\.jsx$/, replacement: stub('Cad.jsx') },
    ],
  },
})

const bruto = {
  ...(await import(join(OUT, 'financeiro.js'))).roda(),
  ...(await import(join(OUT, 'usuarios.js'))).roda(),
  ...(await import(join(OUT, 'meupin.js'))).roda(),
  ...(await import(join(OUT, 'posto.js'))).roda(),
  ...(await import(join(OUT, 'triagem.js'))).roda(),
  ...(await import(join(OUT, 'ordens.js'))).roda(),
  ...(await import(join(OUT, 'cores.js'))).roda(),
  ...(await import(join(OUT, 'controle.js'))).roda(),
  ...(await import(join(OUT, 'paginas.js'))).roda(),
  ...(await import(join(OUT, 'clientes.js'))).roda(),
  ...(await import(join(OUT, 'aviso.js'))).roda(),
}
// ⚠️ Duas normalizações, e sem elas o teste acusa falha onde não há:
//   1. o SSR do React separa expressões vizinhas com <!-- -->, então
//      "3 parcela(s)" sai como "3<!-- --> parcela(s)";
//   2. o R$ do toLocaleString('pt-BR') vem com espaço NÃO-SEPARÁVEL (U+00A0).
const r = Object.fromEntries(Object.entries(bruto).map(([k, v]) =>
  [k, typeof v === 'string' ? v.replace(/<!--\s*-->/g, '').replace(/ /g, ' ') : v]))

const ESPERA = {
  casca: ['Financeiro', 'A receber', 'Recebido no mês'],
  // a remessa 1 já tem cobrança: sobram a 2 do 5458 e o 77 (sem preço no cadastro)
  cobrar: ['#5458', 'remessa 2', '#77', 'valor a digitar', 'rateado', 'Lançar cobrança', 'ITABAIANA'],
  plast: ['JC Plástico não tem pedidos aqui', 'Lançar cobrança à mão'],
  // parcela 1 quitada e a 2ª ainda não venceu: a cobrança está PARCIAL
  // ⚠️ as parcelas ficam atrás do "▸ 3 parcela(s)", e o SSR não clica — o miolo
  // (botão Receber, observação, rodapé) NÃO é coberto aqui.
  aberto: ['INGRID MODAS', 'Parcial', '3 parcela(s)', 'R$ 200,00', 'R$ 66,68', 'R$ 133,32'],
  caixa: ['PIX', 'Bradesco', 'cancelado por Anny', 'R$ 66,68', 'fin-mov-off'],
  mCobr: ['Cobrança do pedido #5458', 'Rateado pelo valor de tabela', '1º vencimento', 'Gerar parcelas'],
  mSemPreco: ['falta preço de algum produto', 'digite o valor'],
  mManual: ['Cobrança à mão', 'JC Plástico', 'Cliente'],
  mReceber: ['Receber · parcela 2 de 3', 'Entrou em', 'Confirmar recebimento', 'escolha…'],
  // ⚠️ o form novo abre em Designer: o campo de PIN (só Operador) aparece só
  // depois de um clique, e o SSR não clica — ele é coberto pelo FormEdicao.
  uCasca: ['Usuários', '+ Novo usuário'],
  uCard: ['João Souza', 'login interno', '🔢 PIN do tablet', 'Remover PIN', 'SILK SCREEN'],
  uCardOff: ['PIN desligado', 'acesso desativado', 'Reativar'],
  uNovo: ['Novo usuário', 'Não tem e-mail — gerar login interno', 'Criar usuário'],
  uEdit: ['Novo PIN do tablet (em branco = manter o atual)', 'redefinir quando ele esquecer', 'mostrar'],
  uEditSem: ['PIN do tablet (opcional)'],
  pCarrega: ['Meu PIN do tablet', 'Carregando'],
  pSem: ['ainda não tem PIN', 'Fechar'],
  pOff: ['desligado', 'Fechar'],
  pForm: ['PIN atual', 'PIN novo (4 números)', 'Repita o PIN novo', 'Trocar PIN', 'Cancelar'],
  lay: ['JC Sacolas', 'Financeiro', 'Sair'],
  layOp: ['🔢 Meu PIN', 'João', 'Sair'],
  layPosto: ['Tablet Silk', 'Sair'],
  // faixa do tablet: só quem tem PIN ligado NESTE setor, pelo primeiro nome
  fVazia: ['Toque no seu nome para dar baixa', 'Ana', 'Pedro', '>AL<', '>PA<'],
  fAtiva: ['Pedro Alves', 'está dando baixa', 'sai em 4:32', 'Sair', 'posto-nome on'],
  fNinguem: ['Ninguém com PIN neste setor'],
  fJoaos: ['João Souza', 'João Lima', 'Maria<'],
  teclado: ['Pedro Alves', 'Digite seu PIN', '>0<', '>9<', 'Cancelar', '⌫'],
  qTravado: ['INGRID MODAS', 'SACOLA PAPEL P02', 'Concluir → ', 'disabled=""'],
  qLivre: ['INGRID MODAS', 'Concluir → '],
  // cor da impressão: só no plástico; novo não sai sem ela, legado continua na produção
  tNovo: ['Cor da impressão ⚠', 'Preto', 'Dourado', 'Vermelho', 'Rosa', 'Branca', 'Prata', 'Laranja', 'Tiffany', 'Azul Médio', 'Azul BB', 'Duas cores',
    'sem ela o pedido não sai da Triagem', 'marque a cor dos itens de plástico para concluir'],
  tLegado: ['O pedido já está na produção', 'não entra numa Ordem de Fabricação', '✓ triagem salva'],
  tDuas: ['acab-pill cor-pill on', 'acab-pill on', '✓ triagem salva'],
  tSoPapel: ['Laminação', '✓ triagem salva'],
  // Ordens de Fabricação: espera em BLOCOS por linha + cor, com os produtos dentro
  ofCasca: ['Ordens de Fabricação', 'Aguardando OF', 'OFs abertas', 'Histórico',
    'SACOLA PLASTICA 30X40', 'SACOLA PLASTICA 40X50 REC', 'Impressão: Preto', 'Impressão: Dourado + Preto',
    '20 kg', '2 produto(s)', '3 pedido(s)', 'Soltar OF'],
  ofBloco: ['SACOLA PLASTICA 30X40', 'SACOLA PLASTICA 40X50 REC', '#11', '#10', '#14', 'BIA CALCADOS', 'EVA STORE',
    '2 de 2 produto(s)', '3 de 3 item(ns)', '20 kg', 'Soltar OF com 2 produto(s)'],
  ofBlocoFechado: ['SACOLA PLASTICA 30X40 · <b>16 kg</b>', 'SACOLA PLASTICA 40X50 REC · <b>4 kg</b>', '▸ Soltar OF…'],
  ofCard: ['OF 0012', 'SACOLA PLASTICA 30X40', 'Liberada', 'solta por Dono', '🖨 Ficha', 'Cancelar', 'Liberado', 'Falta', 'ANA MODAS'],
  ofCardMulti: ['OF 0014', '2 produtos', 'SACOLA PLASTICA 30X40', 'SACOLA PLASTICA 40X50 REC', 'EVA STORE', '20 kg', 'of-sub'],
  qOfMulti: ['OF 0014', '2 produtos', 'SACOLA PLASTICA 30X40', 'SACOLA PLASTICA 40X50 REC', '#14 EVA STORE',
    'Concluir produto → Montagem Plástico', 'Concluir OF inteira (2 produtos) → Montagem Plástico', '20 kg'],
  ofFichaMulti: ['Ordem de Fabricação · OF 0014', 'Preto', 'SACOLA PLASTICA 30X40', 'SACOLA PLASTICA 40X50 REC',
    '#14', 'EVA STORE', '20 kg', '4 kg', 'of-ficha-bloco'],
  ofHist: ['OF 0013', 'Cancelada', 'cliente desistiu'],
  // fase C: OF no quadro + virada escalonada
  qOfLigada: ['OF 0012', 'Concluir OF → Montagem Plástico', '#11 BIA CALCADOS', '16 kg',
    'aguardando <b>Ordem de Fabricação</b>', 'DAVI', 'sem OF · já estava na fila', '→ OF'],
  ofCascaLegado: ['1 sacola(s) plástica(s)', 'já estava na fila', '→ Trazer para a OF'],
  qOfDesligada: ['OF 0012', 'CAIO', 'DAVI'],
  qOfCancelada: ['aguardando', '4 sacola(s)', 'DAVI'],   // OF cancelada: os dela voltam a esperar OF (10, 11, 12 e 14)
  qOfCresceu: ['Aumentou <b>5 kg</b> depois da OF'],
  vDesl: ['Exigência de OF desligada', '<b>4</b> sacola(s)', 'Ligar exigência de OF'],
  vDeslDesigner: ['Quem liga é o dono'],
  vLig: ['Exigência de OF ligada', 'por Dono', '4 sacola(s) terminam', 'Desligar'],
  // cadastro de cores
  cAba: ['10 cor(es) · 10 ativa(s)', '+ Nova cor', 'Azul BB', 'azul-bb', 'cores de fábrica', 'Desativar', '↑', '↓'],
  cNova: ['Nova cor', 'Cor (para a bolinha na tela)', 'type="color"'],
  cEdit: ['Editar cor', 'Azul Médio', 'azul-medio', 'não muda ao renomear'],
  // Triagem lê o cadastro: cor nova aparece, inativa em uso continua marcada
  cTriagem: ['Verde Limão', 'Preto', 'Rosa Choque', 'acab-pill cor-pill on'],
  ofFicha: ['Ordem de Fabricação · OF 0012', 'SILK SCREEN', 'Preto', '16 kg', '#11', 'Conferido por'],
  // filtro por item: o card esconde o resto e AVISA (os botões grandes valem para todos)
  tFiltroPlast: ['SACOLA PLASTICA 30X40', 'Cor da impressão', '1 item(ns) oculto(s) pelo filtro'],
  tFiltroPapel: ['SACOLA PAPEL P02', 'Laminação', '1 item(ns) oculto(s)'],
  tFiltroCor: ['SACOLA PLASTICA 30X40', 'oculto(s) pelo filtro'],
  tQuadroCor: ['SACOLA PLASTICA 30X40', 'Impressão: Rosa', '>Rosa<'],
  // Controle de entrega: a planilha do escritório virou tela
  ceCasca: ['Controle de entrega', 'Nº do pedido', 'Prontos e na rua', '3 pedido(s)', '1 será entregue', '1 pronto(s) sem saída', '1 não entregou',
    '2 lançado(s) pelo escritório', '#6215', '#6206', '#6999', 'Todas as situações', 'Fábrica e escritório', 'Imprimir', 'CSV'],
  ceFabrica: ['BETEK KIDS', '5738', 'NA FÁBRICA', 'GRÁFICA', 'Montagem Papel', 'SILK SCREEN', '300', '200', 'Motorista…', 'Lançar: finalizado e saiu', 'R$ 448,00'],
  ceProntoFabrica: ['PRONTO pela fábrica', 'ainda não lançado', 'Lançar: finalizado e saiu'],
  // o seletor de motorista fica também depois da saída (08/10/2026): dá para entregar por outro nome
  ceLancado: ['CREDIMOVEIS', 'SERÁ ENTREGUE', 'com MATEUS', 'lançado', 'Anny', 'Não entregou (voltou)', 'ENTREGUE por MATEUS', 'Motorista…'],
  ceVoltou: ['NÃO ENTREGOU', 'aguardando sair de novo', 'Motorista…', 'Saiu de novo', 'ENTREGUE por PAULO'],
  ceEntregue: ['SPAÇO', 'Pedido já entregue', 'ENTREGUE · remessa 1', 'PAULO', 'Não há mais nada a marcar'],
  ceExpedicao: ['Não entregou (voltou)', 'entregue: financeiro ou dono'],
  ceResumoEsc: ['Baixas do escritório por setor', '3 item(ns) de 2 pedido(s)', '1 sem pesagem', 'OUTUBRO 2026', 'GRÁFICA', 'Montagem Papel', 'SILK SCREEN', '300 un Papel', '20 kg Plástico'],
  ceLocalizar: ['Localizar', 'Número do pedido, cliente ou produto'],   // a casca monta com o hook de ações dentro
  ceAcoesSemPermissao: ['<vazio>'],
  // páginas inteiras (correção 2): a lista mostra o que FALTA (300 de 500), o
  // quadro do operador só a fila dele, a Rota só o expedido
  prLista: ['Lista de Produção', 'INGRID MODAS', 'SACOLA PAPEL P02', 'SACOLA PLASTICA 30X40', 'SERGIO', 'ROTA 01', '300', '1 pedidos'],
  prQuadroOp: ['Produção · ', 'INGRID MODAS', 'SACOLA PLASTICA 30X40', 'Concluir → '],
  prQuadroExp: ['Produção · ', 'item(ns) neste setor'],
  rota: ['Lista de Rota', 'INGRID MODAS', 'SACOLA PAPEL P02', 'ROTA 01', '200'],
  entregues: ['Entregues'],
  carga: ['Controle de entregas', 'INGRID MODAS'],
  // clientes em coleção: a faixa de migração só aparece com legado; a mescla
  // lista os dois; "Migrar 1" porque a INGRID já está na coleção (ela ganha)
  cliLegado: ['2 cliente(s)', '2 cliente(s) ainda no formato antigo', 'Migrar 1 cliente(s)', 'Ingrid', 'Velha', 'LOJA VELHA LTDA'],
  cliLimpo: ['1 cliente(s)', 'Ingrid', '+ Novo cliente'],
  // aviso ao cliente pelo Esmero: enviado sem botão; erro com motivo e Reenviar; lançado antes da ponte oferece avisar
  avisoOk: ['✅ WhatsApp enviado para Atual pelo Loja centro', 'Anny', 'ENTREGUE por MATEUS'],
  avisoErro: ['⚠ WhatsApp não enviado: cliente sem telefone no Esmero', '↻ Reenviar WhatsApp'],
  avisoNenhum: ['cliente ainda não avisado no WhatsApp', '💬 Avisar no WhatsApp'],
  avisoDesligado: ['ENTREGUE por MATEUS'],
  integ: ['Integrações', 'Endereço do Esmero', 'Avisar o cliente ao lançar', 'Modelo da mensagem', 'Como vai sair:', 'Atual Modas', '#5111', 'com Juninho', 'producaojcsacolas'],
  ceTabela: ['#6215', '#6206', '#6999', 'CREDIMOVEIS', 'BEBE DE MAE', 'SO FABRICA', 'SERÁ ENTREGUE', 'NÃO ENTREGOU', '>PRONTO<', 'MATEUS', 'PAULO', '🏢 escritório', '🏭 fábrica', 'R$ 448,00', '3 pedido(s)'],
}

// o que NÃO pode aparecer
const PROIBE = {
  lay: ['Meu PIN'],       // só operador que não é o tablet
  layPosto: ['Meu PIN'],  // o tablet não tem PIN próprio
  pSem: ['Trocar PIN'],   // sem PIN não há o que trocar
  pOff: ['Trocar PIN'],   // desligado não troca
  fVazia: ['Caio', 'Davi', 'está dando baixa'],   // desligado / outro setor / ninguém ativo
  fAtiva: ['Toque no seu nome'],
  fJoaos: ['Maria Silva'],   // nome único continua só com o primeiro
  qLivre: ['disabled=""'],   // com alguém ativo, nada travado
  tSoPapel: ['Cor da impressão'],          // papel não tem cor
  tDuas: ['Cor da impressão ⚠', 'escolha 2', 'Falta a'],  // duas escolhidas = completo
  tFiltroPlast: ['SACOLA PAPEL P02', 'Laminação'],
  tFiltroPapel: ['SACOLA PLASTICA 30X40', 'Cor da impressão'],
  ceEntregue: ['Lançar', 'ENTREGUE por'],               // entregue por inteiro: nada a marcar
  ceExpedicao: ['R$', '📦 ENTREGUE'],                  // expedição não vê valor nem entrega
  ceLancado: ['Lançar: finalizado'],                    // já lançado: não lança de novo
  ceCasca: ['#5738'],                                   // na fábrica ainda: fora da lista
  tFiltroCor: ['SACOLA PAPEL P02'],
  tNovo: ['oculto(s)'],   // sem filtro, nada escondido
  qOfLigada: ['CAIO', 'Concluir produto', 'OF inteira'],   // sem OF e exigência ligada: fora do quadro; 1 produto = só "Concluir OF"
  ofBlocoFechado: ['#11', 'Soltar OF com'],     // fechado: só os chips dos produtos
  ofCard: ['2 produtos'],                       // um produto: o nome, não a contagem
  qOfDesligada: ['aguardando', 'já estava na fila'],   // desligada: tudo como antes
  qOfCancelada: ['OF 0012', 'ANA MODAS', 'BIA CALCADOS'],   // nem card da OF nem avulso
  vDeslDesigner: ['Ligar exigência'],
  cTriagem: ['Dourado', 'Laranja'],   // fora do cadastro: não viram botão
  prLista: ['BIA CALCADOS'],              // sem triagem: fora da lista de produção
  rota: ['BIA CALCADOS'],                 // nada expedido: fora da rota
  cliLimpo: ['formato antigo', 'Migrar'],  // sem legado, sem faixa
  cliLegado: ['Ingrid Antiga'],            // a coleção ganha do array
  avisoOk: ['Reenviar', 'Avisar no WhatsApp'],   // já enviado: nada a fazer
  avisoDesligado: ['WhatsApp'],                   // ponte desligada e sem registro: nenhum chip
}

let mal = 0
for (const [tela, alvos] of Object.entries(PROIBE)) {
  const sobra = alvos.filter((a) => (r[tela] || '').includes(a))
  if (sobra.length) { mal++; console.log(`✗ ${tela} — não devia ter: ${sobra.join(' | ')}`) }
}
for (const [tela, alvos] of Object.entries(ESPERA)) {
  const h = r[tela] || ''
  const faltam = alvos.filter((a) => !h.includes(a))
  if (faltam.length) { mal++; console.log(`✗ ${tela} — faltou: ${faltam.join(' | ')}`) }
  else console.log(`✓ ${tela} — ${alvos.length} marcos em ${h.length} chars`)
}
console.log(mal ? `\n${mal} TELA(S) COM PROBLEMA` : '\n✓ todas as telas e modais renderizam')
process.exit(mal ? 1 : 0)
