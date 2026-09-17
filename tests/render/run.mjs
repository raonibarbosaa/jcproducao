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
    rollupOptions: { input: { financeiro: join(aqui, 'financeiro.jsx'), usuarios: join(aqui, 'usuarios.jsx'), meupin: join(aqui, 'meupin.jsx'), posto: join(aqui, 'posto.jsx'), triagem: join(aqui, 'triagem.jsx'), ordens: join(aqui, 'ordens.jsx') } },
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
  tNovo: ['Cor da impressão ⚠', 'Preto', 'Dourado', 'Vermelho', 'Rosa', 'Branca', 'Prata', 'Laranja', 'Tiffany', 'Azul Médio', 'Duas cores',
    'sem ela o pedido não sai da Triagem', 'marque a cor dos itens de plástico para concluir'],
  tLegado: ['O pedido já está na produção', 'não entra numa Ordem de Fabricação', '✓ triagem salva'],
  tDuas: ['acab-pill cor-pill on', 'acab-pill on', '✓ triagem salva'],
  tSoPapel: ['Laminação', '✓ triagem salva'],
  // Ordens de Fabricação: espera agrupada por linha + produto + cor
  ofCasca: ['Ordens de Fabricação', 'Aguardando OF', 'OFs abertas', 'Histórico',
    'SACOLA PLASTICA 30X40', 'Impressão: Preto', 'Impressão: Dourado + Preto', '16 kg', '2 pedido(s)', 'Soltar OF'],
  ofGrupo: ['#11', '#10', 'BIA CALCADOS', '2 de 2 marcado(s)', 'Soltar OF com 2 item(ns)'],
  ofCard: ['OF 0012', 'Liberada', 'solta por Dono', '🖨 Ficha', 'Cancelar', 'Liberado', 'Falta', 'ANA MODAS'],
  ofHist: ['OF 0013', 'Cancelada', 'cliente desistiu'],
  // fase C: OF no quadro + virada escalonada
  qOfLigada: ['OF 0012', 'Concluir OF → Montagem Plástico', '#11 BIA CALCADOS', '16 kg',
    'aguardando <b>Ordem de Fabricação</b>', 'DAVI', 'sem OF · já estava na fila'],
  qOfDesligada: ['OF 0012', 'CAIO', 'DAVI'],
  qOfCancelada: ['aguardando', '3 sacola(s)', 'DAVI'],   // OF cancelada: os dela voltam a esperar OF
  qOfCresceu: ['Aumentou <b>5 kg</b> depois da OF'],
  vDesl: ['Exigência de OF desligada', '<b>4</b> sacola(s)', 'Ligar exigência de OF'],
  vDeslDesigner: ['Quem liga é o dono'],
  vLig: ['Exigência de OF ligada', 'por Dono', '4 sacola(s) terminam', 'Desligar'],
  ofFicha: ['Ordem de Fabricação · OF 0012', 'SILK SCREEN', 'Preto', '16 kg', '#11', 'Conferido por'],
  // filtro por item: o card esconde o resto e AVISA (os botões grandes valem para todos)
  tFiltroPlast: ['SACOLA PLASTICA 30X40', 'Cor da impressão', '1 item(ns) oculto(s) pelo filtro'],
  tFiltroPapel: ['SACOLA PAPEL P02', 'Laminação', '1 item(ns) oculto(s)'],
  tFiltroCor: ['SACOLA PLASTICA 30X40', 'oculto(s) pelo filtro'],
  tQuadroCor: ['SACOLA PLASTICA 30X40', 'Impressão: Rosa', '>Rosa<'],
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
  tFiltroCor: ['SACOLA PAPEL P02'],
  tNovo: ['oculto(s)'],   // sem filtro, nada escondido
  qOfLigada: ['CAIO'],                          // sem OF e exigência ligada: fora do quadro
  qOfDesligada: ['aguardando', 'já estava na fila'],   // desligada: tudo como antes
  qOfCancelada: ['OF 0012', 'ANA MODAS', 'BIA CALCADOS'],   // nem card da OF nem avulso
  vDeslDesigner: ['Ligar exigência'],
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
