// A OF no quadro (fase C). O que se protege aqui:
//  - virada escalonada: o que já estava na fila continua avulso; o novo espera OF;
//  - item com OF viva vai para o card da OF, com ou sem a exigência ligada;
//  - a baixa parcial completa o pedido mais urgente primeiro, sem passar do total.
import {
  precisaDeOF, modoNaLinha, marcacaoDaVirada, distribuiBaixaOF, jaEstavaNaFila,
  mapaEtapasComQtd, qtdNaEtapa, legadosSemOF, semOFSem, itensAguardandoOF,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const CAD = [
  { produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' },
  { produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un' },
]
const PL = 'SACOLA PLASTICA 30X40'
const LIG = { ofExigida: true }
const DESL = { ofExigida: false }

const p = pedido({ id: '20', itens: [{ produto: PL, qtd: 10, linha: 'PRODUCAO' }, { produto: 'SACOLA PAPEL P02', qtd: 50, linha: 'GRAFICA' }] })
const legado = { ...p, semOF: { [k(p, 0)]: true } }
const comOF = { ...p, ofs: { [k(p, 0)]: 'o1' } }
const vivos = new Set(['o1'])

// ---------- quem precisa de OF ----------
ok('exigência desligada: ninguém precisa', !precisaDeOF(p, 0, CAD, DESL))
ok('ligada: plástico novo precisa', precisaDeOF(p, 0, CAD, LIG))
ok('papel nunca precisa', !precisaDeOF(p, 1, CAD, LIG))
ok('o que já estava na fila não precisa', !precisaDeOF(legado, 0, CAD, LIG))
ok('marca de legado lida pela chave', jaEstavaNaFila(legado, 0) && !jaEstavaNaFila(p, 0))

// ---------- modo na coluna da linha ----------
t('desligada, sem OF: avulso (como hoje)', modoNaLinha(p, 0, CAD, DESL, vivos), 'avulso')
t('ligada, sem OF: espera', modoNaLinha(p, 0, CAD, LIG, vivos), 'espera')
t('ligada, legado: avulso', modoNaLinha(legado, 0, CAD, LIG, vivos), 'avulso')
t('com OF viva: card da OF (ligada)', modoNaLinha(comOF, 0, CAD, LIG, vivos), 'of')
t('com OF viva: card da OF (mesmo desligada)', modoNaLinha(comOF, 0, CAD, DESL, vivos), 'of')
t('OF cancelada não conta: volta a esperar', modoNaLinha(comOF, 0, CAD, LIG, new Set()), 'espera')
t('papel: sempre avulso', modoNaLinha(p, 1, CAD, LIG, vivos), 'avulso')

// ---------- foto da virada ----------
const naTriagem = { ...pedido({ id: '21', itens: [{ produto: PL, qtd: 5, linha: 'PRODUCAO' }] }), status: '' }
const naMontagem = pedido({ id: '22', itens: [{ produto: PL, qtd: 5, linha: 'PRODUCAO' }], etapas: { 0: { montagem: 5 } } })
const meio = pedido({ id: '23', itens: [{ produto: PL, qtd: 5, linha: 'PRODUCAO' }], etapas: { 0: { montagem: 2 } } })
const foto = marcacaoDaVirada([p, legado, comOF, naTriagem, naMontagem, meio], CAD, vivos)
t('marca só o plástico na linha, sem OF e ainda não marcado', foto, { 20: [k(p, 0)], 23: [k(meio, 0)] })
ok('quem ainda está na Triagem NÃO estava na fila', !foto['21'])
ok('quem já saiu da linha não precisa de marca', !foto['22'])

// ---------- baixa parcial pelo prazo ----------
const linhas = [
  { idVenda: 'A', idx: 0, aqui: 10, previsao: '2026-09-20' },
  { idVenda: 'B', idx: 0, aqui: 6, previsao: '2026-09-18' },
  { idVenda: 'C', idx: 0, aqui: 4, previsao: '' },               // sem data: por último
]
t('10 de 20: completa o B (mais urgente) e dá 4 ao A',
  distribuiBaixaOF(linhas, 10).map((x) => [x.idVenda, x.qtd]), [['B', 6], ['A', 4]])
t('tudo: cada um com o seu', distribuiBaixaOF(linhas, 20).map((x) => [x.idVenda, x.qtd]), [['B', 6], ['A', 10], ['C', 4]])
t('a mais do que existe não inventa', distribuiBaixaOF(linhas, 99).reduce((s, x) => s + x.qtd, 0), 20)
t('kg quebrado', distribuiBaixaOF(linhas, 6.35).map((x) => [x.idVenda, x.qtd]), [['B', 6], ['A', 0.35]])
t('zero não move nada', distribuiBaixaOF(linhas, 0), [])
t('pula quem não tem nada', distribuiBaixaOF([{ idVenda: 'X', aqui: 0, previsao: '1' }, ...linhas], 3).map((x) => x.idVenda), ['B'])

// ---------- ponta a ponta: baixa parcial vira movimento em cada pedido ----------
const pa1 = pedido({ id: 'P1', itens: [{ produto: PL, qtd: 10, linha: 'PRODUCAO' }] })
const pa2 = pedido({ id: 'P2', itens: [{ produto: PL, qtd: 6, linha: 'PRODUCAO' }] })
const naOF = [
  { p: pa1, idVenda: 'P1', idx: 0, aqui: 10, previsao: '2026-09-20' },
  { p: pa2, idVenda: 'P2', idx: 0, aqui: 6, previsao: '2026-09-18' },
]
const depois = {}
for (const x of distribuiBaixaOF(naOF, 8)) {
  const etapas = mapaEtapasComQtd(x.p, [{ idx: x.idx, de: 'PRODUCAO', para: 'montagem', qtd: x.qtd }], 'Pedro')
  depois[x.idVenda] = { ...x.p, etapas }
}
t('P2 (urgente) foi inteiro para a montagem', [qtdNaEtapa(depois.P2, 0, 'montagem'), qtdNaEtapa(depois.P2, 0, 'PRODUCAO')], [6, 0])
t('P1 levou só o resto (2) e 8 continuam na linha', [qtdNaEtapa(depois.P1, 0, 'montagem'), qtdNaEtapa(depois.P1, 0, 'PRODUCAO')], [2, 8])
t('quem assinou fica na etapa', depois.P1.etapas[k(pa1, 0)].por, 'Pedro')

// ---------- caminho de volta: tirar a marca "já estava na fila" ----------
const legCor = { ...legado, cores: { [k(p, 0)]: ['preto'] } }
const legNaMont = { ...legado, etapas: { [k(p, 0)]: { montagem: 10 } } }
const legComOF = { ...legado, ofs: { [k(p, 0)]: 'o1' } }
const legs = legadosSemOF([p, legado, legCor, legNaMont, legComOF], CAD, vivos)
t('só o marcado que ainda está na linha e sem OF', legs.map((x) => [x.idVenda, x.temCor]), [['20', false], ['20', true]])
ok('papel não entra', !legs.some((x) => x.idx === 1))
const solto = { ...legCor, semOF: semOFSem(legCor, [k(legCor, 0), '0']) }
ok('sem a marca, deixa de ser legado', !jaEstavaNaFila(solto, 0))
t('e com cor cai na espera de OF na hora', itensAguardandoOF([solto], CAD, vivos).length, 1)
t('ligada: passa a esperar OF (some da coluna)', modoNaLinha(solto, 0, CAD, LIG, vivos), 'espera')
t('a marca dos outros itens fica', semOFSem({ semOF: { A: true, B: true } }, ['A']), { B: true })
t('marca antiga por posição também sai', semOFSem({ semOF: { 0: true } }, [k(p, 0), '0']), {})

export default resultado('ofquadro')
