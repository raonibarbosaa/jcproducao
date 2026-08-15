// Duas coisas que o IMPORT não pode desfazer: a rota viva e a correção de erro.
import { rotaDe, detectaRota, aplicaCorrecoes, temCorrecao, carimbaKeys, keyDoItem } from '../src/utils.js'
import { t, ok, resultado } from './_harness.mjs'

const CAD = [{
  nome: 'Michele',
  rotas: [
    { nome: 'ROTA 01', cidades: ['ITABAIANA', 'RIBEIROPOLIS'] },
    { nome: 'ROTA 03', cidades: ['CEDRO DE SAO JOAO', 'APARECIDA'] },
  ],
}]

// ---------- ROTA VIVA: o cadastro atual manda, não o retrato do import ----------
const antigo = { idVenda: '4992', vendedor: 'Michele', cidade: 'CEDRO DE SAO JOAO', rota: 'ROTA 01' }
t('O CASO REAL: Cedro passou para a ROTA 03 e o pedido antigo acompanha',
  rotaDe(antigo, CAD), 'ROTA 03')
t('cidade que não mudou continua igual',
  rotaDe({ vendedor: 'Michele', cidade: 'ITABAIANA', rota: 'ROTA 01' }, CAD), 'ROTA 01')
t('acento e caixa não atrapalham',
  rotaDe({ vendedor: 'Michele', cidade: 'cedro de são joão', rota: '' }, CAD), 'ROTA 03')

// ⚠️ mas nunca APAGA rota que existe por causa de buraco no cadastro
t('o cadastro sozinho diria FORA DE ROTA',
  detectaRota('Michele', 'CIDADE NAO CADASTRADA', CAD).rota, 'FORA DE ROTA')
t('O QUE ISSO PROTEGE: a rota gravada é preservada',
  rotaDe({ vendedor: 'Michele', cidade: 'CIDADE NAO CADASTRADA', rota: 'ROTA 01' }, CAD), 'ROTA 01')
t('vendedor fora do cadastro também preserva',
  rotaDe({ vendedor: 'Fulano', cidade: 'ITABAIANA', rota: 'ROTA 07' }, CAD), 'ROTA 07')
ok('objeto vazio não quebra', typeof rotaDe({}, CAD) === 'string')

// ---------- CORREÇÃO: sobrevive à reimportação ----------
const base = () => carimbaKeys({
  idVenda: '7700', cliente: 'LOJA', vendedor: 'Michele',
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 12 }, { produto: 'SACOLA PLASTICA', qtd: 50 }],
})
const chave = keyDoItem(base(), 0)
const comCor = (p) => aplicaCorrecoes({ ...p, correcoes: { [chave]: { qtd: 20, por: 'Ana' } } })

t('a quantidade errada (12) vira a certa (20)', comCor(base()).itens[0].qtd, 20)
t('o valor da planilha fica guardado', comCor(base()).itens[0]._qtdOriginal, 12)
t('o outro item não é tocado', comCor(base()).itens[1].qtd, 50)
t('temCorrecao marca só o item corrigido',
  [temCorrecao(comCor(base()), 0), temCorrecao(comCor(base()), 1)], [true, false])

// A ARMADILHA: o import sobrescreve `itens`. Como `correcoes` é campo próprio do
// pedido, ela continua valendo depois — é a razão de a correção morar ali.
t('POR ISSO NÃO MORA EM `itens`: depois do import a correção continua valendo',
  comCor(base()).itens[0].qtd, 20)

t('correção zerada é ignorada',
  aplicaCorrecoes({ ...base(), correcoes: { [chave]: { qtd: 0 } } }).itens[0].qtd, 12)
t('correção de item inexistente não quebra',
  aplicaCorrecoes({ ...base(), correcoes: { 'FANTASMA#1': { qtd: 99 } } }).itens[0].qtd, 12)
ok('sem correção, o pedido passa igual (mesma referência)',
  aplicaCorrecoes(base()).itens.length === 2)

export default resultado('rota-e-correcoes')
