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
    rollupOptions: { input: { financeiro: join(aqui, 'financeiro.jsx'), usuarios: join(aqui, 'usuarios.jsx') } },
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
}

let mal = 0
for (const [tela, alvos] of Object.entries(ESPERA)) {
  const h = r[tela] || ''
  const faltam = alvos.filter((a) => !h.includes(a))
  if (faltam.length) { mal++; console.log(`✗ ${tela} — faltou: ${faltam.join(' | ')}`) }
  else console.log(`✓ ${tela} — ${alvos.length} marcos em ${h.length} chars`)
}
console.log(mal ? `\n${mal} TELA(S) COM PROBLEMA` : '\n✓ todas as telas e modais renderizam')
process.exit(mal ? 1 : 0)
