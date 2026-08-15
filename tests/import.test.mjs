// IMPORTAÇÃO DO POSSEIDON — ida e volta por uma planilha de verdade.
//
// Este arquivo tem dois papéis: cobrir o mapeamento de colunas e servir de
// prova de fogo da biblioteca de planilha. Se a `xlsx` for trocada, é aqui que
// a troca é validada — o caminho é o mesmo da Triagem (`read` + `sheet_to_json`).
import * as XLSX from 'xlsx'
import { mapeiaColunas, agrupaPedidos, carimbaKeys, keyDoItem } from '../src/utils.js'
import { t, ok, resultado } from './_harness.mjs'

const CAD = [{ codigo: 'v1', nome: 'Michele', dias: [10, 25],
               rotas: [{ nome: 'ROTA 01', cidades: ['ITABAIANA'] }] }]

// nomes de coluna como vêm do Posseidon (com acento e maiúscula)
const LINHAS = [
  { 'Id Venda': 5276, 'Cliente': 'CEU DE MEL', 'Vendedor': 'v1 - Michele',
    'Cidade': 'ITABAIANA', 'Data da Venda': new Date('2026-08-01T00:00:00'),
    'Produto': 'SACOLA PAPEL TAM. P02', 'Quantidade': 500, 'Valor': 1250.5 },
  { 'Id Venda': 5276, 'Cliente': 'CEU DE MEL', 'Vendedor': 'v1 - Michele',
    'Cidade': 'ITABAIANA', 'Data da Venda': new Date('2026-08-01T00:00:00'),
    'Produto': 'SACOLA PLASTICA 30X40', 'Quantidade': 100, 'Valor': 1250.5 },
  { 'Id Venda': 5277, 'Cliente': 'LUX BEACHWEAR', 'Vendedor': 'v1 - Michele',
    'Cidade': 'ITABAIANA', 'Data da Venda': new Date('2026-08-02T00:00:00'),
    'Produto': 'SACOLA PAPEL TAM. P02', 'Quantidade': 300, 'Valor': 900 },
]

// ⚠️ `cellDates: true` nos DOIS lados, senão a data vira número de série e a
// previsão de entrega sai absurda
const ws = XLSX.utils.json_to_sheet(LINHAS, { cellDates: true })
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Planilha1')
const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true })

// daqui para baixo é exatamente o que a Triagem faz
const lido = XLSX.read(buf, { type: 'array', cellDates: true })
const linhas = XLSX.utils.sheet_to_json(lido.Sheets[lido.SheetNames[0]], { defval: null })

t('a planilha volta com todas as linhas', linhas.length, 3)

const mapa = mapeiaColunas(Object.keys(linhas[0]))
t('acha a coluna do número do pedido', mapa.id, 'Id Venda')
t('acha cliente, produto e quantidade',
  [mapa.cliente, mapa.produto, mapa.qtd], ['Cliente', 'Produto', 'Quantidade'])
ok('uma coluna não serve a dois campos', new Set(Object.values(mapa)).size === Object.values(mapa).length)

const pedidos = agrupaPedidos(linhas, mapa, CAD)
t('duas linhas do mesmo número viram UM pedido', pedidos.length, 2)
const p = pedidos.find((x) => x.idVenda === '5276')
t('com os dois itens juntos', p.itens.length, 2)
t('o vendedor é resolvido pelo código da planilha', p.vendedor, 'Michele')
t('a rota sai da cidade, pelo cadastro', p.rota, 'ROTA 01')
t('a data da venda sobrevive como data', typeof p.dataVenda, 'string')
ok('e não virou número de série', p.dataVenda.startsWith('2026-08-01'))
t('o pedido entra na triagem sem linha definida', p.status, '')

// ---------- a chave estável do item ----------
const comKeys = carimbaKeys(p)
t('cada item ganha chave por produto#ocorrência', comKeys.itens.map((it) => it.key),
  [keyDoItem(comKeys, 0), keyDoItem(comKeys, 1)])
ok('a chave NÃO é o índice — é o que sobrevive à ordem mudar na planilha',
  comKeys.itens[0].key.includes('#'))

// produto repetido no mesmo pedido não pode colidir
const repetido = carimbaKeys({ idVenda: '1', itens: [
  { produto: 'SACOLA PAPEL P02', qtd: 10 }, { produto: 'SACOLA PAPEL P02', qtd: 20 },
] })
ok('produto repetido gera chaves distintas',
  repetido.itens[0].key !== repetido.itens[1].key)

export default resultado('import')
