// ENTREGUES EM FATIAS — as consultas ao servidor dependem de dois helpers
// puros: o corte do período (ISO comparável) e a faixa de prefixo do número.
// Se a faixa errar, a busca responde "não achei" para um pedido que existe.
import { corteDoPeriodo, faixaPrefixoNumero, uneEntregues, PERIODOS_ENTREGUES, PERIODO_ENTREGUES_PADRAO, MS_DIA } from '../src/utils.js'
import { ok, t, resultado } from './_harness.mjs'

// ---------- período ----------
const agora = new Date('2026-10-07T15:00:00.000Z')
t('corte de 30 dias', corteDoPeriodo(30, agora), '2026-09-07T15:00:00.000Z')
t('corte de 90 dias', corteDoPeriodo(90, agora), new Date(agora.getTime() - 90 * MS_DIA).toISOString())
t('0 dias = sem corte (todo o histórico)', corteDoPeriodo(0, agora), '')
t('lixo = sem corte', corteDoPeriodo('x', agora), '')
ok('entregueEm ISO dentro do período passa na comparação de texto',
  '2026-09-20T10:00:00.000Z' >= corteDoPeriodo(30, agora))
ok('e fora do período não passa', !('2026-08-01T10:00:00.000Z' >= corteDoPeriodo(30, agora)))
ok('o período padrão existe na lista', PERIODOS_ENTREGUES.some((p) => p.id === PERIODO_ENTREGUES_PADRAO))
ok('"tudo" tem dias = 0', PERIODOS_ENTREGUES.find((p) => p.id === 'tudo').dias === 0)

// ---------- prefixo do número ----------
const dentro = (faixa, s) => s >= faixa[0] && s <= faixa[1]
const f = faixaPrefixoNumero('5111')
ok('doc antigo "5111" cai na faixa', dentro(f, '5111'))
ok('remessa "5111-1" cai na faixa', dentro(f, '5111-1'))
ok('remessa "5111-12" cai na faixa', dentro(f, '5111-12'))
ok('5118 NÃO cai: número completo não traz vizinho', !dentro(f, '5118'))
ok('51110 cai (é prefixo — a tela ainda recorta por pedaço exato)', dentro(f, '51110'))
ok('prefixo curto "51" pega 5111 e 5118', dentro(faixaPrefixoNumero('51'), '5111') && dentro(faixaPrefixoNumero('51'), '5118'))
t('1 dígito não vira consulta (varreria a coleção)', faixaPrefixoNumero('5'), null)
t('texto não vira consulta', faixaPrefixoNumero('MODAS'), null)
t('vazio não vira consulta', faixaPrefixoNumero(''), null)
t('aceita número com espaço em volta', faixaPrefixoNumero(' 5111 ')?.[0], '5111')
t('aceita number', faixaPrefixoNumero(5111)?.[0], '5111')

// ---------- união das fatias ----------
const a = { id: '5111-1', idVenda: '5111' }
const b = { id: '5111-2', idVenda: '5111' }
t('mesma remessa vinda de duas consultas entra UMA vez',
  uneEntregues([a, b], [a], [b]).map((e) => e.id), ['5111-1', '5111-2'])
t('fatia vazia/ausente não quebra', uneEntregues([a], undefined, []).length, 1)
t('sem id não entra', uneEntregues([{ idVenda: 'x' }]).length, 0)

export default resultado('entregues-fatia')
