// CLIENTES EM COLEÇÃO — o de/para saiu do array em config/cadastros. O que não
// pode acontecer: cliente sumir na mescla, apelido novo perder para o antigo,
// id inválido no Firestore, duplicata derrubando o batch da migração.
import { idCliente, dadosCliente, dadosClienteNovo, mesclaClientes, clientesParaMigrar, nomeCliente } from '../src/utils.js'
import { ok, t, resultado } from './_harness.mjs'

// ---------- id ----------
t('id = razão normalizada', idCliente('  Confecção  Fina ME '), 'CONFECCAO FINA ME')
t('barra vira _ (não pode em id)', idCliente('LOJA S/A'), 'LOJA S_A')
t('vazio não tem id', idCliente(''), null)
t('nulo não tem id', idCliente(null), null)
ok('id longo é cortado', idCliente('A'.repeat(900)).length === 400)
t('mesma razão com acento/caixa = mesmo id', idCliente('atual modas ltda'), idCliente('ATUAL MODAS LTDA'))

// ---------- dados do doc ----------
t('dadosCliente tira id e _legado e apara', dadosCliente({ id: 'x', _legado: true, razao: ' A ', nome: ' a ', telefones: ['1'] }),
  { razao: 'A', nome: 'a', telefones: ['1'] })

// ---------- mescla ----------
const colecao = [{ id: 'ATUAL MODAS LTDA', razao: 'ATUAL MODAS LTDA', nome: 'Atual Novo' }]
const legado = [
  { razao: 'ATUAL MODAS LTDA', nome: 'Atual Velho' },
  { razao: 'LUX BEACH WEAR', nome: 'Lux' },
  { razao: 'LUX BEACH WEAR', nome: 'Lux Repetido' },   // repetido no array: o primeiro vence
  { razao: '', nome: 'sem razão' },
]
const m = mesclaClientes(colecao, legado)
t('coleção ganha do array antigo', m.find((c) => c.razao === 'ATUAL MODAS LTDA').nome, 'Atual Novo')
t('quem só está no array entra marcado _legado', m.find((c) => c.razao === 'LUX BEACH WEAR')._legado, true)
t('quem está na coleção não é legado', !!m.find((c) => c.razao === 'ATUAL MODAS LTDA')._legado, false)
t('sem razão não entra; repetido entra uma vez', m.length, 2)
t('ordenado pelo nome de exibição', m.map((c) => c.nome), ['Atual Novo', 'Lux'])
t('nomeCliente continua resolvendo sobre a mescla', nomeCliente('lux beach wear', m), 'Lux')
t('mescla com tudo vazio', mesclaClientes([], []), [])
t('mescla sem argumentos', mesclaClientes(), [])

// ---------- migração ----------
const mig = clientesParaMigrar(colecao, legado)
t('migra só o que falta, sem repetir, sem vazio', mig.map((x) => x.id), ['LUX BEACH WEAR'])
t('e leva os dados limpos', mig[0].dados, { razao: 'LUX BEACH WEAR', nome: 'Lux' })
t('nada a migrar quando tudo já está na coleção', clientesParaMigrar(colecao, [{ razao: 'atual modas ltda', nome: 'x' }]), [])

export default resultado('clientes-colecao')

// ---------- 08/10/2026: a captura do import apagou o apelido de todo mundo ----------
// A captura gravava `{ razao, nome: '' }` com merge — e `nome: ''` é um valor
// como outro qualquer para o merge. Numa importação com a lista de clientes
// incompleta, toda razão social pareceu nova e o apelido de todos sumiu.
t('captura grava SÓ a razão (sem campo nome, que apagaria o apelido no merge)',
  dadosClienteNovo('  Atual Modas Ltda '), { razao: 'Atual Modas Ltda' })
ok('captura nunca leva o campo nome', !('nome' in dadosClienteNovo('X')))
t('captura com razão vazia', dadosClienteNovo(''), { razao: '' })

// rede de segurança: coleção SEM apelido + array antigo COM apelido → vale o do array
const colSemNome = [
  { id: 'ATUAL MODAS LTDA', razao: 'ATUAL MODAS LTDA', nome: '', telefone: '79' },
  { id: 'SEM NOME NOS DOIS', razao: 'SEM NOME NOS DOIS', nome: '' },
  { id: 'SO NA COLECAO', razao: 'SO NA COLECAO' },
]
const legComNome = [
  { razao: 'ATUAL MODAS LTDA', nome: 'Atual' },
  { razao: 'SEM NOME NOS DOIS', nome: '  ' },
]
const m2 = mesclaClientes(colSemNome, legComNome)
t('apelido do array cobre o doc sem apelido', nomeCliente('ATUAL MODAS LTDA', m2), 'Atual')
t('…sem perder o resto do doc da coleção', m2.find((c) => c.razao === 'ATUAL MODAS LTDA').telefone, '79')
ok('…e não vira _legado (o doc existe na coleção)', !m2.find((c) => c.razao === 'ATUAL MODAS LTDA')._legado)
t('sem apelido nos dois lados continua razão social', nomeCliente('SEM NOME NOS DOIS', m2), 'SEM NOME NOS DOIS')
t('doc sem campo nome e sem legado fica como está', nomeCliente('SO NA COLECAO', m2), 'SO NA COLECAO')
t('coleção COM apelido continua ganhando do array', nomeCliente('ATUAL MODAS LTDA',
  mesclaClientes([{ razao: 'ATUAL MODAS LTDA', nome: 'Novo' }], [{ razao: 'ATUAL MODAS LTDA', nome: 'Velho' }])), 'Novo')

// a migração devolve o apelido para a coleção, só o campo nome (merge)
const mig2 = clientesParaMigrar(colSemNome, [...legComNome, { razao: 'LUX BEACH WEAR', nome: 'Lux' }])
t('migra: devolve o apelido ao doc que ficou sem, e copia quem falta',
  mig2, [
    { id: 'ATUAL MODAS LTDA', dados: { nome: 'Atual' } },
    { id: 'LUX BEACH WEAR', dados: { razao: 'LUX BEACH WEAR', nome: 'Lux' } },
  ])
t('migra: doc com apelido na coleção não é tocado',
  clientesParaMigrar([{ razao: 'A', nome: 'Novo' }], [{ razao: 'A', nome: 'Velho' }]), [])
