// FORNECEDORES — para quem o cheque é repassado (CHEQUES.md, C2).
import { readFileSync } from 'node:fs'
import {
  idFornecedor, dadosFornecedor, problemasDoFornecedor, salvaFornecedor, alternaAtivoFornecedor,
  fornecedoresAtivos, ordenaFornecedores, achaFornecedor, nomeFornecedor, fornecedorAtivo,
} from '../src/lib/fornecedores.js'
import { ok, t, resultado } from './_harness.mjs'

const AGORA = '2026-10-20T10:30:00.000Z'

// ---------- portátil: só depende do núcleo de cheques ----------
const fonte = readFileSync(new URL('../src/lib/fornecedores.js', import.meta.url), 'utf8')
t('só importa o núcleo de cheques', fonte.match(/^import .* from '(.*)'/gm)?.map((l) => l.split("'")[1]), ['./cheques.js'])

// ---------- id ----------
ok('id começa com forn_', idFornecedor(0, 0).startsWith('forn_'))
ok('ids diferentes no mesmo instante', idFornecedor(1000, 0.1) !== idFornecedor(1000, 0.9))
ok('o id não sai do nome (renomear não desliga cheque)', !idFornecedor(Date.parse(AGORA), 0.5).includes('RESINA'))

// ---------- dados ----------
t('limpa e formata o CNPJ', dadosFornecedor({ nome: '  Resinas   do Nordeste ', documento: '11222333000181', telefone: ' 79 9999 ' }),
  { nome: 'Resinas do Nordeste', documento: '11.222.333/0001-81', telefone: '79 9999', contato: '', obs: '' })
t('CPF também', dadosFornecedor({ nome: 'X', documento: '52998224725' }).documento, '529.982.247-25')
t('número incompleto fica como digitado', dadosFornecedor({ nome: 'X', documento: '1122' }).documento, '1122')

// ---------- validação ----------
const LISTA = [
  { id: 'f1', nome: 'Resinas do Nordeste', documento: '11.222.333/0001-81', ativo: true },
  { id: 'f2', nome: 'Tintas Sergipe', documento: '', ativo: false },
]
t('sem nome não salva', problemasDoFornecedor({ nome: ' ' }, LISTA).erros.length, 1)
t('documento é opcional', problemasDoFornecedor({ nome: 'Papelaria Nova' }, LISTA), { erros: [], avisos: [] })
ok('CNPJ com dígito errado é erro', problemasDoFornecedor({ nome: 'Nova', documento: '11.222.333/0001-82' }, LISTA).erros[0].includes('dígito'))
ok('CNPJ repetido é erro (mesmo escrito sem pontos)',
  problemasDoFornecedor({ nome: 'Outra', documento: '11222333000181' }, LISTA).erros[0].includes('Resinas do Nordeste'))
ok('editar o próprio não acusa o próprio CNPJ',
  !problemasDoFornecedor({ nome: 'Resinas NE', documento: '11222333000181' }, LISTA, 'f1').erros.length)
const nomeRep = problemasDoFornecedor({ nome: 'tintas  SERGIPE' }, LISTA)
t('nome repetido é só aviso', nomeRep.erros, [])
ok('e diz que o outro está inativo', nomeRep.avisos[0].includes('(inativo)'))

// ---------- salvar ----------
const nova = salvaFornecedor(LISTA, { nome: 'Papelaria Nova', documento: '52998224725' }, '', { id: 'f3', agora: AGORA, por: 'Anny' })
t('novo entra no fim, ativo, com quem criou', nova[2],
  { id: 'f3', nome: 'Papelaria Nova', documento: '529.982.247-25', telefone: '', contato: '', obs: '', ativo: true, criadoEm: AGORA, criadoPor: 'Anny', atualizadoEm: AGORA })
ok('a lista original não muda', LISTA.length === 2)
const editada = salvaFornecedor(nova, { nome: 'Resinas NE', documento: '11222333000181' }, 'f1', { agora: AGORA, por: 'Dono' })
t('editar mantém id e ativo', [editada[0].id, editada[0].nome, editada[0].ativo, editada[0].atualizadoPor], ['f1', 'Resinas NE', true, 'Dono'])
let falhou = false
try { salvaFornecedor(LISTA, { nome: 'X' }, 'f999') } catch { falhou = true }
ok('editar id que não existe falha (não cria em silêncio)', falhou)

// ---------- ativo ----------
const desligada = alternaAtivoFornecedor(LISTA, 'f1', { agora: AGORA, por: 'Anny' })
ok('desativar', !fornecedorAtivo(desligada[0]) && desligada.length === 2)
ok('reativar', fornecedorAtivo(alternaAtivoFornecedor(desligada, 'f1')[0]))
ok('ativo ausente (registro antigo) conta como ativo', fornecedorAtivo({ nome: 'X' }))
t('só os ativos vão para a escolha do repasse', fornecedoresAtivos(LISTA).map((f) => f.id), ['f1'])
t('ativos primeiro, depois pelo nome',
  ordenaFornecedores([...LISTA, { id: 'f4', nome: 'Alfa Embalagens' }]).map((f) => f.id), ['f4', 'f1', 'f2'])

// ---------- o nome no cheque ----------
t('acha pelo id', achaFornecedor(LISTA, 'f2')?.nome, 'Tintas Sergipe')
t('o nome atual do cadastro ganha do gravado', nomeFornecedor(editada, 'f1', 'RESINAS ANTIGO'), 'Resinas NE')
t('sem cadastro, vale o nome gravado no repasse', nomeFornecedor(LISTA, 'f999', 'FORNECEDOR X'), 'FORNECEDOR X')

export default resultado('fornecedores')
