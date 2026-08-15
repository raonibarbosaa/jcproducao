// Arreio mínimo de teste — sem dependência, roda com `node`.
//
// Por que não Jest/Vitest: o projeto não tem etapa de teste no build nem CI, e
// uma dependência a mais é uma dependência a mais para auditar. `utils.js` é
// ESM puro e sem JSX, então `node` importa direto.
//
// Estes testes cobrem as INVARIANTES do domínio — as regras cuja quebra é
// silenciosa e cara (quantidade que some, volume apagado, relógio que zera).
// Não cobrem React nem Firestore.

// o módulo é único para todos os arquivos, então cada `resultado()` reporta o
// DELTA desde a chamada anterior — senão os números acumulam entre arquivos
let falhas = 0
let total = 0
let marcoFalhas = 0
let marcoTotal = 0
let problemas = []

export function t(nome, real, esperado) {
  total++
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (ok) return
  falhas++
  problemas.push(`  ✗ ${nome}\n      esperado: ${JSON.stringify(esperado)}\n      veio:     ${JSON.stringify(real)}`)
}

// para asserções que não são igualdade estrutural
export function ok(nome, condicao) {
  t(nome, !!condicao, true)
}

export function resultado(arquivo) {
  const f = falhas - marcoFalhas
  const n = total - marcoTotal
  if (f) {
    console.log(`✗ ${arquivo} — ${f} de ${n} falharam`)
    problemas.forEach((p) => console.log(p))
  } else {
    console.log(`✓ ${arquivo} — ${n} asserções`)
  }
  marcoFalhas = falhas; marcoTotal = total; problemas = []
  return f
}

// ---------- fábricas de pedido, para os testes não repetirem montagem ----------
import { carimbaKeys, keyDoItem } from '../src/utils.js'

export const MS_DIA = 86400000

// Pedido pronto para teste. `itens` é [{produto, qtd, linha}].
export function pedido({ id = '900', cliente = 'LOJA', vendedor = 'Michele',
                         rota = 'ROTA 01', cidade = 'ITABAIANA', itens = [],
                         etapas = {}, ...resto } = {}) {
  const p = carimbaKeys({
    idVenda: id, cliente, vendedor, rota, cidade,
    status: itens[0]?.linha || 'GRAFICA',
    itens: itens.map(({ produto, qtd }) => ({ produto, qtd })),
    linhasItens: {}, etapas: {}, ...resto,
  })
  p.linhasItens = Object.fromEntries(
    itens.map((it, i) => [keyDoItem(p, i), it.linha || 'GRAFICA']))
  // entrada VAZIA não entra: um `{}` no mapa já conta como "formato novo" e
  // esconde o fallback do campo antigo `p.etapa`, que os testes precisam ver
  p.etapas = Object.fromEntries(
    Object.entries(etapas)
      .filter(([, v]) => v && Object.keys(v).length)
      .map(([i, v]) => [keyDoItem(p, Number(i)), v]))
  return p
}

export const k = (p, i = 0) => keyDoItem(p, i)
