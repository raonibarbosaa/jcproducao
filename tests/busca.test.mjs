// BUSCA POR NOME PARECIDO — o filtro de cliente casava por substring exata e,
// na prática, só abria com o nome escrito igual ao do Posseidon.
// Os casos abaixo são reais (vieram do cruzamento da planilha de entregas).
import { casaBusca, cabeEmErros, filtraPedidos } from '../src/utils.js'
import { ok, t, resultado } from './_harness.mjs'

// ---------- o que quebrava ----------
ok('espaço a mais/a menos: BEACHWEAR acha "LUX BEACH WEAR"',
  casaBusca('BEACHWEAR', 'LUX BEACH WEAR'))
ok('e o contrário: "BEACH WEAR" acha LUX BEACHWEAR',
  casaBusca('BEACH WEAR', 'LUX BEACHWEAR'))
ok('ordem trocada: "MODAS ATUAL" acha ATUAL MODAS',
  casaBusca('MODAS ATUAL', 'ATUAL MODAS LTDA'))
ok('letra trocada: JESICA acha JESSICA CLOSET',
  casaBusca('JESICA', 'JESSICA CLOSET'))
ok('pontuação e sufixo: "suzanes" acha SUZANE´S CONFECCOES ME',
  casaBusca('suzanes', 'SUZANE´S CONFECCOES ME'))
ok('acento continua indiferente', casaBusca('CONFECCAO', 'CONFECÇÃO FINA'))

// ---------- o que NÃO pode passar ----------
ok('cliente diferente continua de fora',
  !casaBusca('SAF FUNERARIA', 'ATUAL MODAS'))
ok('palavra a mais estreita a busca (é E, não OU)',
  !casaBusca('LAY KIDS PLASTICO', 'LAY KIDS'))
ok('palavra curta não vira coringa: ANA não acha ANO BOM',
  !casaBusca('ANA', 'ANO BOM'))
ok('termo vazio não filtra nada', casaBusca('', 'QUALQUER COISA'))
ok('sem texto nenhum não casa', !casaBusca('LOJA', '', null))

// ---------- o corte do Levenshtein ----------
ok('1 erro cabe em 1', cabeEmErros('LOJA', 'LOJAS', 1))
ok('2 erros não cabem em 1', !cabeEmErros('LOJA', 'ROSAS', 1))
ok('tamanho muito diferente sai na hora', !cabeEmErros('LOJA', 'LOJINHA DA ESQUINA', 2))

// ---------- dentro do filtro de verdade ----------
// ⚠️ o filtro casa pelos DOIS nomes: a razão social da planilha e o apelido do
// cadastro. Quem procura usa o nome que conhece, e quase nunca é o da planilha.
const pedidos = [
  { idVenda: '4972', cliente: 'JESSICA CLOSET LTDA', previsao: '2026-08-20' },
  { idVenda: '5076', cliente: 'LA STORE LTDA', previsao: '2026-08-20' },
]
const clientes = [{ razao: 'LA STORE LTDA', nome: 'LOJA DA PRACA' }]
t('acha pelo nome com erro de digitação',
  filtraPedidos(pedidos, { cliente: 'jesica closet' }, clientes).length, 1)
t('acha pelo APELIDO cadastrado',
  filtraPedidos(pedidos, { cliente: 'praca' }, clientes)[0]?.idVenda, '5076')
t('nome de outro cliente não traz ninguém',
  filtraPedidos(pedidos, { cliente: 'MERCADINHO' }, clientes).length, 0)
t('número de pedido continua exato (substring)',
  filtraPedidos(pedidos, { pedido: '5076' }, clientes).length, 1)

export default resultado('busca')
