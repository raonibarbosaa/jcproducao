// CHEQUES — origem, situação e destino de cada folha (CHEQUES.md, fase C1).
// Só importa o núcleo e o arreio: o arquivo vai junto para o TotaliFinance e
// prova que a cópia não quebrou.
import { readFileSync } from 'node:fs'
import {
  chaveCheque, numeroSeguinte, divideValor, datasDoLote, somaMeses, geraFolhas,
  somaFolhas, problemasDaFolha, repetidasNoLote, problemasDoCabecalho, docValido, fmtDoc,
  chequesDoLote, aplicaEvento, podeIr, podeReapresentar, corrigeCheque, acoesComuns,
  situacaoBate, devolvidoPeloFornecedor, entreEmpresas, totaisCheques, agrupaPorFornecedor,
  diasDepositado, compensacaoAtrasada, podeDepositarHoje, filtraCheques, irmasDoLote,
  nomeBanco, nomeAcao, ehViva, passosAte,
} from '../src/lib/cheques.js'
import { ok, t, resultado } from './_harness.mjs'

const AGORA = '2026-10-20T10:30:00.000Z'
const HOJE = '2026-10-20'
const QUEM = { por: 'Financeiro', porUid: 'u-fin', agora: AGORA, hoje: HOJE }

// ---------- a portabilidade ----------
const fonte = readFileSync(new URL('../src/lib/cheques.js', import.meta.url), 'utf8')
ok('o núcleo não importa nada (vai para o TotaliFinance como está)',
  !/^\s*import\s/m.test(fonte) && !/require\(/.test(fonte))

// ---------- a chave da folha ----------
// a Zeus mostra o banco sem zero (47) e o talão traz com zero (047)
t('chave normaliza zeros, pontos e barras',
  chaveCheque({ banco: { codigo: '047' }, agencia: '0036', conta: '03/100.483-1', numero: '047470' }),
  '47|36|31004831|47470')
t('a mesma folha escrita de outro jeito dá a mesma chave',
  chaveCheque({ banco: '47', agencia: '36', conta: '031004831', numero: '47470' }),
  '47|36|31004831|47470')
t('faltando um pedaço a chave é vazia (não acusa repetição com ninguém)',
  chaveCheque({ banco: '47', agencia: '36', conta: '', numero: '47470' }), '')
t('nome do banco pelo código, com ou sem zero', [nomeBanco('47'), nomeBanco('047'), nomeBanco('999')],
  ['Banese', 'Banese', ''])

// ---------- a sequência do lote ----------
t('número seguinte preserva os zeros', numeroSeguinte('000123', 1), '000124')
t('passa de 0999 para 1000', numeroSeguinte('0999', 1), '1000')
t('sem zero à esquerda cresce normal', numeroSeguinte('9', 1), '10')
t('prefixo de letras é mantido', numeroSeguinte('AB12', 2), 'AB14')
t('sem dígito no fim não inventa número', numeroSeguinte('ABC', 1), '')
t('número enorme não perde precisão', numeroSeguinte('9007199254740993', 1), '9007199254740994')

t('1.000,00 em 3: a sobra vai na primeira', divideValor(1000, 3), [333.34, 333.33, 333.33])
t('e o lote fecha', somaFolhas(divideValor(1000, 3).map((valor) => ({ valor }))), 1000)

// o caso do Raoni: recebeu hoje, 4 folhas para 30/60/90/120 dias
t('a cada 30 dias', datasDoLote('2026-11-19', 4, { tipo: 'dias', dias: 30 }),
  ['2026-11-19', '2026-12-19', '2027-01-18', '2027-02-17'])
t('dia fixo do mês: o 31 passa por fevereiro e volta a 31',
  datasDoLote('2027-01-31', 3, { tipo: 'mes' }), ['2027-01-31', '2027-02-28', '2027-03-31'])
t('ano bissexto', somaMeses('2028-01-31', 1), '2028-02-29')
t('virada de ano', somaMeses('2026-11-20', 3), '2027-02-20')
t('sem 1ª data, as datas ficam vazias (a pessoa digita)', datasDoLote('', 2), ['', ''])

const BASE = {
  banco: { codigo: '047' }, agencia: '0036', conta: '03/100.483-1',
  emitente: { nome: 'MAGALHAES E CIA LTDA', doc: '11.222.333/0001-81' },
}
const folhas = geraFolhas({
  quantas: 4, valor: { modo: 'total', valor: 1468 }, primeiroBomPara: '2026-11-19',
  intervalo: { tipo: 'dias', dias: 30 }, numeroInicial: '000001', base: BASE,
})
t('gera 4 folhas numeradas em sequência', folhas.map((f) => f.numero), ['000001', '000002', '000003', '000004'])
t('cada uma com a sua parte', folhas.map((f) => f.valor), [367, 367, 367, 367])
t('"2 de 4"', [folhas[1].loteN, folhas[1].loteTotal], [2, 4])
t('o nome do banco vem do código', folhas[0].banco.nome, 'Banese')
t('valor por folha repete o valor', geraFolhas({ quantas: 2, valor: { modo: 'folha', valor: 150.5 } })
  .map((f) => f.valor), [150.5, 150.5])

// ---------- validação ----------
t('folha gerada está completa', problemasDaFolha(folhas[0]), [])
t('folha vazia diz tudo o que falta', problemasDaFolha({}).map((p) => p.campo),
  ['banco', 'agencia', 'conta', 'numero', 'valor', 'bomPara', 'emitente'])
ok('CPF válido', docValido('529.982.247-25'))
ok('CPF com dígito errado', !docValido('529.982.247-24'))
ok('CPF de números iguais não vale', !docValido('111.111.111-11'))
ok('CNPJ válido', docValido('11.222.333/0001-81'))
ok('CNPJ com dígito errado', !docValido('11.222.333/0001-82'))
t('documento errado vira problema da folha',
  problemasDaFolha({ ...folhas[0], emitente: { nome: 'X', doc: '529.982.247-24' } }).map((p) => p.campo), ['doc'])
t('documento vazio é aceito (cheque antigo pode não ter)',
  problemasDaFolha({ ...folhas[0], emitente: { nome: 'X', doc: '' } }), [])
t('formata CPF e CNPJ', [fmtDoc('52998224725'), fmtDoc('11222333000181')],
  ['529.982.247-25', '11.222.333/0001-81'])

const CAB = { empresa: 'sacolas', cliente: 'MAGALHAES E CIA LTDA', idVenda: '5458', recebidoEm: HOJE }
t('cabeçalho completo', problemasDoCabecalho(CAB, HOJE), [])
t('recebimento no futuro é recusado',
  problemasDoCabecalho({ ...CAB, recebidoEm: '2026-10-21' }, HOJE).map((p) => p.campo), ['recebidoEm'])
t('sem empresa e sem cliente', problemasDoCabecalho({ recebidoEm: HOJE }, HOJE).map((p) => p.campo),
  ['empresa', 'cliente'])

// ---------- repetição ----------
const jaGravado = { id: 'x1', situacao: 'carteira', banco: { codigo: '47' }, agencia: '36', conta: '031004831', numero: '2' }
const rep = repetidasNoLote([folhas[0], folhas[1], { ...folhas[0] }], [jaGravado])
t('repete com cheque já gravado mesmo escrito diferente', rep[1]?.map((r) => r.origem), ['existente'])
t('repete dentro do próprio lote', rep[2]?.map((r) => [r.origem, r.indice]), [['lote', 0]])
ok('folha sem repetição não aparece', !rep[0])
t('cheque cancelado não acusa (relançar é a correção)',
  repetidasNoLote([folhas[1]], [{ ...jaGravado, situacao: 'cancelado' }]), {})

// ---------- o lançamento ----------
const lote = chequesDoLote(CAB, folhas, { loteId: 'L1', ...QUEM })
ok('lote válido grava', lote.ok)
t('4 cheques, todos na gaveta', lote.cheques.map((c) => c.situacao), ['carteira', 'carteira', 'carteira', 'carteira'])
const c1 = { id: 'c1', ...lote.cheques[0] }
t('a origem vai em cada folha', [c1.cliente, c1.idVenda, c1.empresa, c1.recebidoEm, c1.lote],
  ['MAGALHAES E CIA LTDA', '5458', 'sacolas', HOJE, 'L1'])
t('a chave é gravada', c1.chave, '47|36|31004831|1')
t('o 1º evento é o lançamento', c1.historico.map((e) => [e.n, e.de, e.para, e.data, e.porUid, e.obs]),
  [[1, '', 'carteira', HOJE, 'u-fin', 'lançado']])
ok('nenhum campo undefined (o Firestore recusa)', !JSON.stringify(lote.cheques).includes('undefined')
  && lote.cheques.every((c) => Object.values(c).every((v) => v !== undefined)))

const ruim = chequesDoLote(CAB, [folhas[0], { ...folhas[1], valor: 0 }], { loteId: 'L2', ...QUEM })
ok('uma folha ruim derruba o lote inteiro (tudo ou nada)', !ruim.ok && ruim.cheques.length === 0)
t('e diz qual folha', ruim.problemas.map((p) => [p.indice, p.campo]), [[1, 'valor']])
ok('sem quem registrou não grava', !chequesDoLote(CAB, folhas, { loteId: 'L', agora: AGORA, hoje: HOJE }).ok)

// cheque antigo, lançado à mão a partir da Zeus
const tardio = chequesDoLote({ ...CAB, recebidoEm: '2026-08-10', tardio: true }, [folhas[0]], { loteId: 'L3', ...QUEM })
t('o tardio diz de onde veio', tardio.cheques[0].historico[0].obs, 'lançado depois (veio da Zeus)')
t('com a data dele, não a de hoje', tardio.cheques[0].historico[0].data, '2026-08-10')

const jaCompensado = chequesDoLote(
  { ...CAB, recebidoEm: '2026-08-10', tardio: true,
    inicial: { para: 'compensado', conta: 'bradesco', dataDeposito: '2026-09-10', data: '2026-09-12' } },
  [folhas[0]], { loteId: 'L4', ...QUEM }).cheques[0]
t('o compensado antigo passa pelo depósito', jaCompensado.historico.map((e) => e.para),
  ['carteira', 'depositado', 'compensado'])
t('com as datas de cada passo', jaCompensado.historico.map((e) => e.data), ['2026-08-10', '2026-09-10', '2026-09-12'])
t('e a conta', jaCompensado.contaDeposito, 'bradesco')

const jaDevolvido = chequesDoLote(
  { ...CAB, recebidoEm: '2026-08-10', inicial: { para: 'devolvido', conta: 'bradesco', alinea: '11', data: '2026-09-15' } },
  [folhas[0]], { loteId: 'L5', ...QUEM }).cheques[0]
t('o devolvido antigo passa pelo depósito', jaDevolvido.historico.map((e) => e.para),
  ['carteira', 'depositado', 'devolvido'])
const voltouDoForn = chequesDoLote(
  { ...CAB, recebidoEm: '2026-08-10', inicial: { para: 'devolvido', de: 'repassado', alinea: '11', data: '2026-09-20',
    repasse: { fornecedorId: 'f1', fornecedorNome: 'RESINAS NE', empresaPagadora: 'sacolas', data: '2026-08-15' } } },
  [folhas[0]], { loteId: 'L6', ...QUEM }).cheques[0]
t('o que voltou do fornecedor passa pelo repasse', voltouDoForn.historico.map((e) => e.para),
  ['carteira', 'repassado', 'devolvido'])
t('e diz que quem devolveu foi o fornecedor', voltouDoForn.historico[2].origemDevolucao, 'fornecedor')
const inicialRuim = chequesDoLote({ ...CAB, inicial: { para: 'depositado', data: HOJE } }, [folhas[0]], { loteId: 'L7', ...QUEM })
ok('situação inicial incompleta (sem conta) também barra o lote', !inicialRuim.ok)
t('passosAte: repassado é um passo só', passosAte({ para: 'repassado' }).map((p) => p.para), ['repassado'])

// ---------- a vida do cheque ----------
ok('da gaveta não vai direto a compensado', !podeIr(c1, 'compensado').ok)
const semConta = aplicaEvento(c1, { para: 'depositado', data: HOJE, porUid: 'u-fin' }, QUEM)
t('depositar exige a conta', semConta.problemas.map((p) => p.campo), ['conta'])
ok('com problema, nada muda', semConta.patch === null && semConta.cheque === c1)

const antecipado = aplicaEvento(c1, { para: 'depositado', conta: 'bradesco', data: HOJE, porUid: 'u-fin' }, QUEM)
ok('depositar antes do bom para é PERMITIDO', antecipado.ok)
ok('mas avisa quantos dias faltam', antecipado.avisos.some((a) => a.includes('faltam 30 dia(s)')))

const dep = aplicaEvento(c1, { para: 'depositado', conta: 'bradesco', data: '2026-11-19', porUid: 'u-fin', por: 'Financeiro' }, QUEM)
t('sem aviso no dia certo', dep.avisos, [])
t('o patch é só o que muda', Object.keys(dep.patch).sort(), ['contaDeposito', 'destino', 'historico', 'situacao', 'situacaoEm'])
t('o evento registra de onde e para onde', dep.cheque.historico[1], {
  n: 2, em: AGORA, data: '2026-11-19', por: 'Financeiro', porUid: 'u-fin', de: 'carteira', para: 'depositado', conta: 'bradesco',
})
ok('situação e histórico batem', situacaoBate(dep.cheque))
ok('cópia da situação divergente é detectada', !situacaoBate({ ...dep.cheque, situacao: 'carteira' }))
t('há quantos dias está no banco', diasDepositado(dep.cheque, '2026-11-23'), 4)
ok('passou do prazo de compensação: alguém precisa olhar o extrato', compensacaoAtrasada(dep.cheque, '2026-11-23'))
ok('dentro do prazo, não', !compensacaoAtrasada(dep.cheque, '2026-11-20'))

// o ciclo do extrato do Bradesco de abril: devolvido, reapresentado, devolvido de novo
const dev1 = aplicaEvento(dep.cheque, { para: 'devolvido', alinea: '11', data: '2026-11-21', porUid: 'u-fin' }, QUEM).cheque
t('devolvido pelo banco', [dev1.situacao, dev1.historico[2].origemDevolucao, dev1.contaDeposito], ['devolvido', 'banco', 'bradesco'])
ok('depois da 1ª sem fundos pode reapresentar', podeReapresentar(dev1).ok)
t('a ação se chama reapresentar', nomeAcao('devolvido', 'depositado'), 'Reapresentar')
const dep2 = aplicaEvento(dev1, { para: 'depositado', conta: 'bradesco', data: '2026-11-25', porUid: 'u-fin' }, QUEM).cheque
t('o prazo de compensação conta do ÚLTIMO depósito', diasDepositado(dep2, '2026-11-26'), 1)
const dev2 = aplicaEvento(dep2, { para: 'devolvido', alinea: '12', data: '2026-11-27', porUid: 'u-fin' }, QUEM).cheque
ok('depois da alínea 12 não reapresenta', !podeReapresentar(dev2).ok)
ok('nem pelo botão de depositar', !podeIr(dev2, 'depositado').ok)
const naGaveta = aplicaEvento(dev2, { para: 'carteira', data: '2026-11-28', porUid: 'u-fin' }, QUEM).cheque
ok('e a gaveta não vira atalho para reapresentar', !podeIr(naGaveta, 'depositado').ok)
ok('na gaveta ainda pode ser resgatado com o cliente', podeIr(naGaveta, 'resgatado').ok)

const duasOnze = aplicaEvento(
  aplicaEvento(dev1, { para: 'depositado', conta: 'bradesco', data: '2026-11-25', porUid: 'u' }, QUEM).cheque,
  { para: 'devolvido', alinea: '11', data: '2026-11-27', porUid: 'u' }, QUEM).cheque
ok('duas devoluções sem fundos travam mesmo marcadas como 11', !podeReapresentar(duasOnze).ok)
const sustado = aplicaEvento(dep.cheque, { para: 'devolvido', alinea: '21', data: '2026-11-21', porUid: 'u' }, QUEM).cheque
ok('cheque sustado não volta ao banco', !podeIr(sustado, 'depositado').ok)
const semMotivo = aplicaEvento(dep.cheque, { para: 'devolvido', alinea: 'outra', data: '2026-11-21', porUid: 'u' }, QUEM)
t('"outro motivo" exige escrever o motivo', semMotivo.problemas.map((p) => p.campo), ['obs'])
ok('devolução sem alínea não passa',
  !aplicaEvento(dep.cheque, { para: 'devolvido', data: '2026-11-21', porUid: 'u' }, QUEM).ok)
const compensado = aplicaEvento(dep.cheque, { para: 'compensado', data: '2026-11-20', porUid: 'u' }, QUEM).cheque
ok('compensado ainda pode voltar (o banco faz)', podeIr(compensado, 'devolvido').ok)
ok('compensado não é vivo (sai da tela do dia a dia)', !ehViva(compensado.situacao) && ehViva('devolvido'))

// ---------- repasse: para onde o cheque foi ----------
const semForn = aplicaEvento(c1, { para: 'repassado', data: HOJE, porUid: 'u' }, QUEM)
t('repassar exige fornecedor e empresa pagadora', semForn.problemas.map((p) => p.campo), ['fornecedor', 'empresaPagadora'])
const rp = aplicaEvento(c1, {
  para: 'repassado', fornecedorId: 'f1', fornecedorNome: 'RESINAS NE', empresaPagadora: 'plastico',
  referencia: 'NF 1234', data: HOJE, porUid: 'u-fin',
}, QUEM)
t('o destino fica no cheque', rp.cheque.destino,
  { fornecedorId: 'f1', fornecedorNome: 'RESINAS NE', empresaPagadora: 'plastico', referencia: 'NF 1234', data: HOJE })
ok('recebido pela Sacolas pagando a Plástico: entre empresas', entreEmpresas(rp.cheque))
ok('e avisa na hora', rp.avisos.some((a) => a.includes('ENTRE EMPRESAS')))
const volta = aplicaEvento(rp.cheque, { para: 'devolvido', alinea: '11', data: '2026-11-25', porUid: 'u' }, QUEM).cheque
t('voltou do fornecedor', nomeAcao('repassado', 'devolvido'), 'Voltou do fornecedor')
t('e diz qual fornecedor', devolvidoPeloFornecedor(volta), { fornecedorId: 'f1', fornecedorNome: 'RESINAS NE', data: HOJE })
ok('devolvido pelo banco não aponta fornecedor', devolvidoPeloFornecedor(dev1) === null)
ok('repassar um cheque que já voltou avisa',
  aplicaEvento(naGaveta, { para: 'repassado', fornecedorId: 'f2', fornecedorNome: 'X', empresaPagadora: 'sacolas', data: HOJE, porUid: 'u' }, QUEM)
    .avisos.some((a) => a.includes('já voltou 2 vez(es)')))

// ---------- cancelar ----------
ok('cancelar exige o porquê', !aplicaEvento(c1, { para: 'cancelado', data: HOJE, porUid: 'u' }, QUEM).ok)
ok('vale até de compensado (lançamento errado descoberto tarde)',
  aplicaEvento(compensado, { para: 'cancelado', obs: 'lançado em dobro', data: HOJE, porUid: 'u' }, QUEM).ok)
const cancelado = aplicaEvento(c1, { para: 'cancelado', obs: 'lançado em dobro', data: HOJE, porUid: 'u' }, QUEM).cheque
ok('cancelado não cancela de novo', !podeIr(cancelado, 'cancelado').ok)
t('e não vai para lugar nenhum', acoesComuns([cancelado]), [])

// ---------- seleção em lote ----------
t('duas na gaveta', acoesComuns([c1, c1]), ['depositado', 'repassado', 'resgatado', 'cancelado'])
t('gaveta + compensado: só o que vale para as duas', acoesComuns([c1, compensado]), ['cancelado'])
t('uma que não pode reapresentar tira o reapresentar da seleção',
  acoesComuns([dev1, dev2]), ['carteira', 'repassado', 'resgatado', 'cancelado'])

// ---------- corrigir dado digitado errado ----------
const corr = corrigeCheque(c1, { numero: '000011' }, { por: 'Financeiro', porUid: 'u-fin', agora: AGORA })
ok('corrige', corr.ok)
t('a chave acompanha', corr.cheque.chave, '47|36|31004831|11')
t('fica registrado o antes e o depois', [corr.cheque.historico[1].tipo, corr.cheque.historico[1].antes, corr.cheque.historico[1].depois],
  ['corrigido', { numero: '000001' }, { numero: '000011' }])
t('sem mudar a situação', [corr.cheque.situacao, corr.cheque.historico[1].para], ['carteira', 'carteira'])
ok('nada mudou = nada a gravar', !corrigeCheque(c1, { numero: '000001' }, { porUid: 'u' }).ok)
ok('correção que deixa a folha inválida é recusada', !corrigeCheque(c1, { valor: 0 }, { porUid: 'u' }).ok)

// ---------- leituras da tela ----------
const lista = [
  { ...c1, id: 'a', bomPara: '2026-10-18' },                      // vencido, na gaveta
  { ...c1, id: 'b', bomPara: '2026-10-25', loteN: 2 },             // vence na semana
  { ...c1, id: 'c', bomPara: '2026-12-25', loteN: 3 },             // longe
  { ...dev1, id: 'd' },
  { ...rp.cheque, id: 'e' },
  { ...rp.cheque, id: 'f', valor: 100, destino: { ...rp.cheque.destino, data: '2026-09-02' } },
  { ...cancelado, id: 'g' },
]
const tot = totaisCheques(lista, HOJE)
t('carteira', tot.carteira, { qtd: 3, valor: 1101 })
t('depositar em 7 dias inclui o que já venceu e continua na gaveta', tot.depositarAte, { qtd: 2, valor: 734 })
t('devolvidos', tot.devolvidos, { qtd: 1, valor: 367 })
t('repassados no mês olham a data do repasse', tot.repassadosNoMes, { qtd: 1, valor: 367 })
ok('pode depositar hoje o que já venceu', podeDepositarHoje(lista[0], HOJE) && !podeDepositarHoje(lista[1], HOJE))
t('irmãs do lote, na ordem', irmasDoLote(lista[0], lista.slice(0, 3)).map((c) => c.id), ['b', 'c'])

const porForn = agrupaPorFornecedor(lista)
t('repassados por fornecedor', porForn.map((g) => [g.fornecedorNome, g.qtd, g.valor]), [['RESINAS NE', 2, 467]])

// ---------- busca ----------
// o número repete entre clientes: buscar lista TODOS
const busca = [
  { id: '1', situacao: 'carteira', numero: '047470', cliente: 'MAGALHAES E CIA LTDA', emitente: { nome: 'JOAO' }, idVenda: '' },
  { id: '2', situacao: 'compensado', numero: '47470', cliente: 'NOVO STYLO', emitente: { nome: 'MARIA SOUZA' }, idVenda: '5458' },
  { id: '3', situacao: 'carteira', numero: '47471', cliente: 'FABIO TECIDOS', emitente: { nome: 'FÁBIO' }, idVenda: '' },
]
t('o número lista todos os clientes que têm aquela folha',
  filtraCheques(busca, { termo: '47470' }).map((c) => c.id), ['1', '2'])
t('com ou sem o zero', filtraCheques(busca, { termo: '047470' }).map((c) => c.id), ['1', '2'])
t('pedaço do número', filtraCheques(busca, { termo: '4747' }).map((c) => c.id), ['1', '2', '3'])
t('número do pedido também acha', filtraCheques(busca, { termo: '5458' }).map((c) => c.id), ['2'])
t('nome do emitente, sem acento', filtraCheques(busca, { termo: 'fabio' }).map((c) => c.id), ['3'])
t('filtro de situação', filtraCheques(busca, { termo: '47470', situacoes: ['carteira'] }).map((c) => c.id), ['1'])
t('o apelido do cliente entra pela função injetada',
  filtraCheques(busca, { termo: 'MAGALHAES LOJA', nomeCliente: (r) => (r.startsWith('MAGALHAES') ? 'LOJA DO MAGALHAES' : r) })
    .map((c) => c.id), ['1'])
t('o casamento de texto pode ser trocado (no JC é o casaBusca)',
  filtraCheques(busca, { termo: 'qualquer' }, () => true).length, 3)

export default resultado('cheques')
