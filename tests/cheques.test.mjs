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
  nomeBanco, nomeAcao, nomeEvento, ehViva, passosAte,
  repassesDe, repassesPorFornecedor, resumoEntreEmpresas, cortePeriodo, chaveRepasse,
  gaveta, resumoChequesDoPedido, contasDoCliente, clienteChave, pedacosDaBusca, ondeEstaOCheque,
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
t('no histórico o evento vem no passado', dev1.historico.map(nomeEvento), ['Lançado', 'Depositado', 'Devolvido'])
const dep2 = aplicaEvento(dev1, { para: 'depositado', conta: 'bradesco', data: '2026-11-25', porUid: 'u-fin' }, QUEM).cheque
t('o prazo de compensação conta do ÚLTIMO depósito', diasDepositado(dep2, '2026-11-26'), 1)
const dev2 = aplicaEvento(dep2, { para: 'devolvido', alinea: '12', data: '2026-11-27', porUid: 'u-fin' }, QUEM).cheque
ok('depois da alínea 12 não reapresenta', !podeReapresentar(dev2).ok)
ok('nem pelo botão de depositar', !podeIr(dev2, 'depositado').ok)
const naGaveta = aplicaEvento(dev2, { para: 'carteira', data: '2026-11-28', porUid: 'u-fin' }, QUEM).cheque
ok('e a gaveta não vira atalho para reapresentar', !podeIr(naGaveta, 'depositado').ok)
t('reapresentar e voltar para a gaveta, no passado', [nomeEvento(dep2.historico[3]), nomeEvento(naGaveta.historico.at(-1))],
  ['Reapresentado', 'Voltou para a gaveta'])
t('o botão de cancelar não parece "fechar"', nomeAcao('carteira', 'cancelado'), 'Cancelar cheque')
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

// ---------- repasses (C4): a unidade do recibo ----------
const REP = { para: 'repassado', fornecedorId: 'f1', fornecedorNome: 'RESINAS NE', empresaPagadora: 'sacolas',
  referencia: 'NF 1234', data: '2026-11-03', porUid: 'u' }
const a1 = aplicaEvento({ ...c1, id: 'r1' }, REP, QUEM).cheque
const a2 = aplicaEvento({ ...c1, id: 'r2', numero: '000002', valor: 200 }, REP, QUEM).cheque
// a 3ª foi no mesmo dia, para o mesmo fornecedor, mas paga pela PLÁSTICO: outro recibo
const a3 = aplicaEvento({ ...c1, id: 'r3', numero: '000003', valor: 100 }, { ...REP, empresaPagadora: 'plastico' }, QUEM).cheque
// a 1ª voltou do fornecedor e foi repassada de novo, para outro
const a1volta = aplicaEvento(aplicaEvento(a1, { para: 'devolvido', alinea: '11', data: '2026-11-10', porUid: 'u' }, QUEM).cheque,
  { ...REP, fornecedorId: 'f2', fornecedorNome: 'TINTAS SE', referencia: '', data: '2026-11-12' }, QUEM).cheque
const reps = repassesDe([a1volta, a2, a3])
t('um recibo por fornecedor + dia + referência + empresa pagadora', reps.map((r) => [r.data, r.fornecedorNome, r.empresaPagadora, r.qtd]),
  [['2026-11-12', 'TINTAS SE', 'sacolas', 1], ['2026-11-03', 'RESINAS NE', 'plastico', 1], ['2026-11-03', 'RESINAS NE', 'sacolas', 2]])
const recibo = reps.find((r) => r.fornecedorNome === 'RESINAS NE' && r.empresaPagadora === 'sacolas')
t('o recibo continua com a folha que depois voltou (o papel assinado não muda)', recibo.folhas.map((f) => [f.cheque.numero, f.voltou]),
  [['000001', true], ['000002', false]])
t('e soma o que foi entregue', [recibo.valor, recibo.voltaram], [567, 1])
t('folha recebida pela Sacolas paga pela Plástico é entre empresas',
  reps.find((r) => r.empresaPagadora === 'plastico').entreEmpresas, 1)
t('chave ignora caixa e espaço na referência', chaveRepasse({ ...REP, referencia: ' nf  1234 ' }), chaveRepasse(REP))

const porF = repassesPorFornecedor(reps)
t('por fornecedor: total entregue e o que voltou', porF.map((g) => [g.fornecedorNome, g.qtd, g.valor, g.voltaram, g.valorVoltou]),
  [['RESINAS NE', 3, 667, 1, 367], ['TINTAS SE', 1, 367, 0, 0]])
t('com período', repassesPorFornecedor(reps, { de: '2026-11-11' }).map((g) => g.fornecedorNome), ['TINTAS SE'])
t('entre empresas por direção', resumoEntreEmpresas(reps).map((d) => [d.de, d.para, d.qtd, d.valor]),
  [['sacolas', 'plastico', 1, 100]])
t('corte do período', [cortePeriodo('mes', '2026-11-20'), cortePeriodo('90', '2026-11-20'), cortePeriodo('', '2026-11-20')],
  ['2026-11-01', '2026-08-22', ''])

// cheque antigo da Zeus que já estava com um fornecedor
const jaRepassado = chequesDoLote({ ...CAB, recebidoEm: '2026-08-10', tardio: true,
  inicial: { para: 'repassado', fornecedorId: 'f1', fornecedorNome: 'RESINAS NE', empresaPagadora: 'sacolas', data: '2026-08-20' } },
  [folhas[0]], { loteId: 'L8', ...QUEM }).cheques[0]
const reap = aplicaEvento(aplicaEvento(a1, { para: 'devolvido', alinea: '11', data: '2026-11-10', porUid: 'u' }, QUEM).cheque,
  { para: 'depositado', conta: 'bradesco', data: '2026-11-11', porUid: 'u' }, QUEM).cheque
t('repassadoEm fica mesmo depois de voltar e ser reapresentada (o destino não)', [reap.repassadoEm, reap.destino], ['2026-11-03', null])
t('e acompanha o ÚLTIMO repasse', a1volta.repassadoEm, '2026-11-12')
t('o repassado antigo entra pela gaveta e vai ao fornecedor', [jaRepassado.situacao, jaRepassado.destino.fornecedorNome, jaRepassado.historico.length],
  ['repassado', 'RESINAS NE', 2])

// ---------- a gaveta e o pedido (C5) ----------
const g = gaveta([...lista, { ...c1, id: 'z', situacao: 'compensado' }])
t('na gaveta: carteira e devolvidos (o papel voltou), nada mais', [g.carteira.map((c) => c.id), g.devolvidos.map((c) => c.id)],
  [['a', 'b', 'c'], ['d']])
t('com os totais', [g.qtd, g.valor, g.valorCarteira, g.valorDevolvidos], [4, 1468, 1101, 367])
const rp5458 = resumoChequesDoPedido(lista)
t('cheques do pedido por situação, sem os cancelados', rp5458.porSituacao.map((x) => [x.situacao, x.qtd, x.valor]),
  [['carteira', 3, 1101], ['devolvido', 1, 367], ['repassado', 2, 467]])
t('total do pedido', [rp5458.qtd, rp5458.valor], [6, 1935])
t('pedido sem cheque', resumoChequesDoPedido([]), { qtd: 0, valor: 0, porSituacao: [], folhas: [] })

// ---------- as contas do cliente (C6a) ----------
t('o cliente é gravado na forma de comparar', [c1.clienteChave, clienteChave(' Magalhães e  cia ltda ')],
  ['MAGALHAES E CIA LTDA', 'MAGALHAES E CIA LTDA'])
const corrCli = corrigeCheque(c1, { cliente: 'Outra Loja' }, { porUid: 'u', agora: AGORA })
t('corrigir o cliente atualiza a chave', corrCli.cheque.clienteChave, 'OUTRA LOJA')
const T = (o) => ({ banco: { codigo: '047', nome: 'Banese' }, agencia: '0036', conta: '03/100.483-1',
  emitente: { nome: 'JOAO', doc: '' }, situacao: 'carteira', ...o })
const contas = contasDoCliente([
  T({ numero: '000246', recebidoEm: '2026-11-03' }),
  T({ numero: '000249', recebidoEm: '2026-11-03', emitente: { nome: 'JOAO DA SILVA', doc: '52998224725' } }),
  // folha ANTIGA lançada por último: não pode puxar a sequência para trás
  T({ numero: '000120', recebidoEm: '2026-11-04', criadoEm: '2026-11-04' }),
  // mesma conta escrita sem zeros e pontuação: é a mesma conta
  T({ numero: '247', agencia: '36', conta: '031004831', banco: { codigo: '47' }, recebidoEm: '2026-10-01' }),
  T({ numero: '500', banco: { codigo: '237', nome: 'Bradesco' }, agencia: '1234', conta: '98765-0', terceiro: true, recebidoEm: '2026-09-01' }),
  T({ numero: '999', agencia: '9', conta: '9', situacao: 'cancelado', recebidoEm: '2026-11-10' }),
])
t('uma linha por conta, a mais recente primeiro; cancelado não conta',
  contas.map((c) => [c.banco.nome, c.vezes, c.ultimaData]), [['Banese', 4, '2026-11-04'], ['Bradesco', 1, '2026-09-01']])
t('o próximo número sai do MAIOR já lançado, com os zeros', [contas[0].ultimoNumero, contas[0].proximoNumero], ['000249', '000250'])
t('os dados vêm da folha mais recente', contas[0].emitente.nome, 'JOAO')
t('cheque de terceiro é lembrado', contas[1].terceiro, true)
t('sem histórico, sem contas', contasDoCliente([]), [])

// ---------- "onde está o cheque 246 da RUBI?" (C6c) ----------
t('o número é gravado sem zeros', [c1.numeroChave, corrigeCheque(c1, { numero: '000246' }, { porUid: 'u' }).cheque.numeroChave], ['1', '246'])
t('termo em pedaços: número e texto', pedacosDaBusca(' 000246  rubi semi '), { numeros: ['246'], texto: 'rubi semi' })
const rubi = [
  { id: 'r1', situacao: 'carteira', numero: '000246', cliente: 'RUBI SEMI JOIAS', emitente: { nome: 'RUBI LTDA' }, idVenda: '5912' },
  { id: 'r2', situacao: 'compensado', numero: '246', cliente: 'NOVO STYLO', emitente: { nome: 'X' }, idVenda: '' },
  { id: 'r3', situacao: 'carteira', numero: '247', cliente: 'RUBI SEMI JOIAS', emitente: { nome: 'RUBI LTDA' }, idVenda: '5912' },
]
t('"246 rubi" acha só o 246 da RUBI (o número repete entre clientes)', filtraCheques(rubi, { termo: '246 rubi' }).map((c) => c.id), ['r1'])
t('"246" sozinho lista todos com esse número', filtraCheques(rubi, { termo: '246' }).map((c) => c.id), ['r1', 'r2'])
t('"rubi 5912" casa pelo pedido', filtraCheques(rubi, { termo: 'rubi 5912' }).map((c) => c.id), ['r1', 'r3'])
t('palavra que não casa derruba', filtraCheques(rubi, { termo: '246 resinas' }).length, 0)

const NOMES = { nomeConta: (id) => ({ bradesco: 'Bradesco' }[id] || id),
  contatoFornecedor: (id) => (id === 'f1' ? { telefone: '(79) 3431-0000', contato: 'Marcos' } : null) }
const onde = (c) => { const o = ondeEstaOCheque(c, NOMES); return `${o.icone} ${o.texto} — ${o.detalhe}` }
t('na gaveta', onde({ ...c1, bomPara: '2026-11-13' }), '🗄 Na gaveta desde 20/10/2026 — bom para 13/11/2026')
t('no banco', onde(dep.cheque), '🏦 Depositado no Bradesco em 19/11/2026 — esperando compensar')
t('compensou', onde(compensado), '✅ Compensou em 20/11/2026 — Bradesco')
t('voltou do banco, com a alínea', onde(dev1), '↩ Voltou do banco em 21/11/2026 — 11 · Sem fundos — 1ª apresentação · está com a empresa')
t('com o fornecedor, com telefone e contato', onde(rp.cheque), '🤝 Com RESINAS NE desde 20/10/2026 — NF 1234 · 📞 (79) 3431-0000 · falar com Marcos')
t('voltou do fornecedor', onde(volta), '↩ Voltou de RESINAS NE em 25/11/2026 — está com a empresa')
t('cancelado diz o porquê', onde(cancelado), '✖ Cancelado em 20/10/2026 — lançado em dobro')

export default resultado('cheques')
