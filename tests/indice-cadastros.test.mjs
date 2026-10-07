// ÍNDICE DOS CADASTROS — `achaCliente`, `achaItem` e `achaVendedor` deixaram de
// percorrer o array inteiro a cada chamada (pedidos × cadastro por render) e
// passaram a consultar um índice montado uma vez por array. O que não pode
// mudar: a resposta. O que não pode quebrar: cadastro novo = resposta nova.
import { achaCliente, nomeCliente, achaItem, achaVendedor, nomeVendedor, materialDoItem } from '../src/utils.js'
import { ok, t, resultado } from './_harness.mjs'

// ---------- clientes ----------
const clientes = [
  { razao: 'ATUAL MODAS LTDA', nome: 'Atual' },
  { razao: '  Confecção  Fina ME ', nome: 'Fina' },
  { razao: 'ATUAL MODAS LTDA', nome: 'DUPLICADO' },   // repetido: o primeiro vence
  { razao: '', nome: 'sem razão' },
]
t('casa ignorando caixa, acento e espaço', nomeCliente('confeccao fina me', clientes), 'Fina')
t('razão repetida: a PRIMEIRA vence, como o find fazia', achaCliente('atual modas ltda', clientes)?.nome, 'Atual')
t('não cadastrado devolve a própria razão', nomeCliente('LOJA X', clientes), 'LOJA X')
t('razão vazia não casa com o cadastro sem razão', achaCliente('', clientes), null)
t('cadastro vazio', achaCliente('ATUAL MODAS LTDA', []), null)
t('cadastro ausente', achaCliente('ATUAL MODAS LTDA', undefined), null)

// ---------- o índice acompanha o cadastro ----------
// array NOVO (como o React/Firestore entregam) → índice novo
const clientes2 = clientes.map((c) => (c.nome === 'Atual' ? { ...c, nome: 'Atual Modas' } : c))
t('array novo: apelido alterado aparece', nomeCliente('ATUAL MODAS LTDA', clientes2), 'Atual Modas')
t('e o array antigo continua respondendo o antigo', nomeCliente('ATUAL MODAS LTDA', clientes), 'Atual')
// mutação em lugar (push no MESMO array) → o tamanho muda e o índice se refaz
const mut = [{ razao: 'A', nome: 'a' }]
t('antes do push', nomeCliente('B', mut), 'B')
mut.push({ razao: 'B', nome: 'b' })
t('push no mesmo array é visto (rede de segurança pelo length)', nomeCliente('B', mut), 'b')

// ---------- itens ----------
const itens = [
  { produto: 'SACOLA PAPEL TAM. P02', tipo: 'papel', unidade: 'un' },
  { produto: 'sacola  plástica 30x40', tipo: 'plastico', unidade: 'kg' },
  { produto: 'SACOLA PAPEL TAM. P02', tipo: 'ERRADO' },
]
t('item casa normalizado', achaItem('Sacola Plastica 30X40', itens)?.tipo, 'plastico')
t('item repetido: o primeiro vence', achaItem('SACOLA PAPEL TAM. P02', itens)?.tipo, 'papel')
t('materialDoItem continua lendo o cadastro', materialDoItem({ produto: 'sacola plastica 30x40' }, itens), 'plastico')
t('sem cadastro cai na inferência pelo nome', materialDoItem({ produto: 'SACOLA PLAST 40x50' }, []), 'plastico')
t('produto vazio', achaItem('', itens), null)

// ---------- vendedores ----------
const vendedores = [
  { nome: 'Michele', codigo: 'v1', rotas: [] },
  { nome: 'Sérgio', codigo: 'v2', rotas: [] },
  { nome: 'Sem Codigo', rotas: [] },
  { nome: 'Michele', codigo: 'v9', rotas: [] },   // nome repetido: o primeiro vence por nome
]
t('casa pelo código', achaVendedor('v2 - SERGIO', vendedores)?.nome, 'Sérgio')
t('código ganha do nome (v1 com nome de outro)', achaVendedor('1 - SERGIO', vendedores)?.nome, 'Michele')
t('código desconhecido cai no nome', achaVendedor('v7 - sergio', vendedores)?.nome, 'Sérgio')
t('só nome, sem código', achaVendedor('sem codigo', vendedores)?.nome, 'Sem Codigo')
t('nome repetido: o primeiro vence', achaVendedor('MICHELE', vendedores)?.codigo, 'v1')
t('vendedor sem código não casa por código', achaVendedor('v3 - ninguem', vendedores), null)
t('nomeVendedor sem cadastro capitaliza o cru', nomeVendedor('v5 - FULANO', []), 'Fulano')

// ---------- custo: cadastro grande × muitas consultas ----------
// 3.000 clientes × 5.000 consultas. Linear eram 15 milhões de normalizações;
// com o índice são 3.000 + 5.000. O limite é folgado de propósito (máquina
// lenta não pode falhar o teste), mas o linear estourava ele com sobra.
const grande = Array.from({ length: 3000 }, (_, i) => ({ razao: `CLIENTE NÚMERO ${i} LTDA`, nome: `C${i}` }))
const t0 = performance.now()
let acertos = 0
for (let i = 0; i < 5000; i++) if (nomeCliente(`cliente numero ${i % 3000} ltda`, grande) === `C${i % 3000}`) acertos++
const ms = performance.now() - t0
t('índice responde certo em escala', acertos, 5000)
ok(`5.000 consultas em 3.000 clientes abaixo de 1 s (levou ${Math.round(ms)} ms)`, ms < 1000)

export default resultado('indice-cadastros')
