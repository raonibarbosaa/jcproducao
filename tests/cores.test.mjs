// Cor da impressão do plástico (fase A da Ordem de Fabricação). O que se protege:
//  - pedido JÁ na produção não perde o status por não ter cor (sumiria do quadro);
//  - pedido novo de plástico só sai da Triagem com cor;
//  - "Preto + Dourado" e "Dourado + Preto" agrupam juntos;
//  - a cor segue a CHAVE do item, não a posição.
import {
  CORES_IMPRESSAO, limpaCores, coresDoItem, coresDoItemPorChave, corOk, itemPedeCor,
  coresCompletas, chaveCor, fmtCores, statusDaTriagem, pendenteNaTriagem, keyDoItem,
  itemFaltaCor, itemPassaNaTriagem, pedidoPassaNaTriagem, itensSemCor,
  CORES_PADRAO, coresDoCadastro, definirCores, coresCadastradas, coresAtivas, nomeCor, hexCor,
  slugCor, problemaDaCor,
} from '../src/utils.js'
import { t, ok, resultado } from './_harness.mjs'

const CAD = [
  { produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' },
  { produto: 'SACOLA PAPEL P02', tipo: 'papel', unidade: 'un' },
]
const pl = { produto: 'SACOLA PLASTICA 30X40', qtd: 10, key: 'SACOLA PLASTICA 30X40#1' }
const pa = { produto: 'SACOLA PAPEL P02', qtd: 100, key: 'SACOLA PAPEL P02#1' }

t('as cores do dono', CORES_IMPRESSAO.map((c) => c.id), ['preto', 'dourado', 'vermelho', 'rosa', 'branca', 'prata', 'laranja', 'tiffany', 'azul-medio', 'azul-bb'])
t('branca e prata por extenso', fmtCores(['branca', 'prata']), 'Branca + Prata')
t('azul médio com id composto agrupa certo', chaveCor(['tiffany', 'azul-medio']), 'azul-medio+tiffany')
t('e por extenso', fmtCores(['laranja', 'azul-medio']), 'Laranja + Azul Médio')

// ---------- limpeza ----------
t('id mal formado some', limpaCores(['preto', 'Azul Claro!', '', 7]), ['preto'])
t('⚠️ id bem formado que o cadastro não conhece FICA (nada de perda no Salvar)', limpaCores(['preto', 'verde-limao']), ['preto', 'verde-limao'])
t('repetida conta uma vez', limpaCores(['rosa', 'rosa']), ['rosa'])
t('no máximo duas', limpaCores(['preto', 'dourado', 'rosa']), ['preto', 'dourado'])
t('lixo vira vazio', limpaCores('preto'), [])
ok('uma cor basta', corOk(['preto']))
ok('nenhuma não', !corOk([]))

// ---------- agrupamento ----------
t('duas cores em qualquer ordem, mesma chave', chaveCor(['preto', 'dourado']), chaveCor(['dourado', 'preto']))
ok('pares diferentes, chaves diferentes', chaveCor(['preto', 'dourado']) !== chaveCor(['preto', 'vermelho']))
t('nome por extenso', fmtCores(['preto', 'dourado']), 'Preto + Dourado')
t('sem cor, texto vazio', fmtCores([]), '')

// ---------- quem pede cor ----------
ok('plástico pede', itemPedeCor(pl, CAD))
ok('papel não', !itemPedeCor(pa, CAD))
ok('plástico fora do cadastro, pelo nome, também', itemPedeCor({ produto: 'SACO PLASTICO 20X30' }, []))

// ---------- leitura por chave ----------
const ped = { idVenda: '1', itens: [pa, pl], linhasItens: { [pa.key]: 'GRAFICA', [pl.key]: 'PRODUCAO' },
  cores: { [pl.key]: ['preto'] } }
t('lê pela chave', coresDoItem(ped, 1), ['preto'])
t('papel sem cor', coresDoItem(ped, 0), [])
t('itens na ordem trocada: a cor fica com o plástico', coresDoItem({ ...ped, itens: [pl, pa] }, 0), ['preto'])
t('recortado (Rota/lista) lê pelo it.key', coresDoItemPorChave(ped, pl), ['preto'])
t('item sem chave não inventa', coresDoItemPorChave(ped, { produto: 'X' }), [])
ok('pedido completo', coresCompletas(ped, CAD))
ok('sem a cor do plástico, incompleto', !coresCompletas({ ...ped, cores: {} }, CAD))
ok('só papel não precisa de cor', coresCompletas({ itens: [pa] }, CAD))
t('mapa antigo por posição ainda lê', coresDoItem({ itens: [{ produto: 'SACOLA PLASTICA 30X40' }], cores: { 0: ['rosa'] } }, 0), ['rosa'])
ok('keyDoItem usado é o gravado', keyDoItem(ped, 1) === pl.key)

// ---------- status da triagem ----------
const semCor = { ...ped, cores: {} }
t('NOVO sem cor: não sai da Triagem', statusDaTriagem(semCor, CAD, ''), '')
t('NOVO com cor: sai (empate vai para a 1ª linha da ordem)', statusDaTriagem(ped, CAD, ''), 'PRODUCAO')
t('JÁ NA PRODUÇÃO sem cor: mantém o status (não some do quadro)', statusDaTriagem(semCor, CAD, 'PRODUCAO'), 'PRODUCAO')
t('linha faltando zera mesmo com status antigo',
  statusDaTriagem({ ...ped, linhasItens: { [pa.key]: 'GRAFICA' } }, CAD, 'PRODUCAO'), '')

// ---------- "sem definição" ----------
ok('esperando cor (sem status) é pendente', pendenteNaTriagem({ ...semCor, status: '' }))
ok('já na produção não é pendente', !pendenteNaTriagem({ ...semCor, status: 'PRODUCAO' }))
ok('linha faltando é pendente', pendenteNaTriagem({ ...ped, linhasItens: {}, status: '' }))
ok('Zeus sem itens com status não é pendente', !pendenteNaTriagem({ status: 'PRODUCAO' }))
ok('Zeus sem itens e sem status é pendente', pendenteNaTriagem({ status: '' }))

// ---------- filtros da Triagem ----------
const misto = { ...ped, cores: {} }       // papel + plástico sem cor
ok('plástico sem cor falta', itemFaltaCor(misto, 1, CAD))
ok('papel nunca "falta cor"', !itemFaltaCor(misto, 0, CAD))
ok('plástico com cor não falta', !itemFaltaCor(ped, 1, CAD))
t('conta os sem cor', [itensSemCor(misto, CAD), itensSemCor(ped, CAD)], [1, 0])
t('só plástico: esconde o papel', [0, 1].map((i) => itemPassaNaTriagem(misto, i, CAD, { material: 'plastico' })), [false, true])
t('só papel: esconde o plástico', [0, 1].map((i) => itemPassaNaTriagem(misto, i, CAD, { material: 'papel' })), [true, false])
t('falta cor: só o plástico sem cor', [0, 1].map((i) => itemPassaNaTriagem(misto, i, CAD, { faltaCor: true })), [false, true])
t('sem filtro passa tudo', [0, 1].map((i) => itemPassaNaTriagem(misto, i, CAD, {})), [true, true])
ok('pedido já com cor sai do filtro "falta cor"', !pedidoPassaNaTriagem(ped, CAD, { faltaCor: true }))
ok('pedido sem cor entra', pedidoPassaNaTriagem(misto, CAD, { faltaCor: true }))
ok('só papel + falta cor não combina nunca', !pedidoPassaNaTriagem(misto, CAD, { material: 'papel', faltaCor: true }))
ok('pedido só de papel some no filtro plástico', !pedidoPassaNaTriagem({ itens: [pa] }, CAD, { material: 'plastico' }))
ok('sem filtro, todo pedido passa', pedidoPassaNaTriagem({ itens: [pa] }, CAD, {}))

// ---------- cadastro de cores ----------
t('cadastro vazio = cores de fábrica', coresDoCadastro([]).map((c) => c.id), CORES_PADRAO.map((c) => c.id))
t('lista gravada manda', coresDoCadastro([{ id: 'preto', nm: 'Preto', hex: '#000000' }, { id: 'verde', nm: 'Verde', hex: '#00ff00', ativo: false }])
  .map((c) => [c.id, c.ativo]), [['preto', true], ['verde', false]])
t('lixo e repetido saem', coresDoCadastro([{ id: 'x y', nm: 'X' }, { id: 'a', nm: '' }, { id: 'b', nm: 'B', hex: 'azul' }, { id: 'b', nm: 'B2' }])
  .map((c) => [c.id, c.hex]), [['b', '#888888']])

definirCores([{ id: 'preto', nm: 'Preto', hex: '#000000' }, { id: 'verde-limao', nm: 'Verde Limão', hex: '#aaff00' },
  { id: 'rosa', nm: 'Rosa Choque', hex: '#ff0099', ativo: false }])
t('registro: todas', coresCadastradas().map((c) => c.id), ['preto', 'verde-limao', 'rosa'])
t('registro: só ativas (botões da Triagem)', coresAtivas().map((c) => c.id), ['preto', 'verde-limao'])
t('nome vem do cadastro (renomeada)', nomeCor('rosa'), 'Rosa Choque')
t('cor nova por extenso', fmtCores(['verde-limao', 'preto']), 'Verde Limão + Preto')
t('hex do cadastro', hexCor('verde-limao'), '#aaff00')
t('fora do cadastro, mas de fábrica: usa a de fábrica', nomeCor('dourado'), 'Dourado')
t('desconhecida aparece pelo id arrumado', nomeCor('azul-petroleo'), 'Azul Petroleo')
definirCores([])
t('volta às de fábrica', nomeCor('rosa'), 'Rosa')

t('código da cor', slugCor('Azul Médio'), 'azul-medio')
t('código sem sujeira', slugCor('  Verde  Limão!! '), 'verde-limao')
t('nome vazio', problemaDaCor({ nm: ' ', hex: '#000000' }, []), 'Informe o nome da cor.')
t('sem letra', problemaDaCor({ nm: '!!', hex: '#000000' }, []), 'O nome precisa ter letras ou números.')
t('hex ruim', problemaDaCor({ nm: 'Verde', hex: 'verde' }, []), 'Escolha a cor no seletor.')
ok('nome repetido (sem acento/caixa)', problemaDaCor({ nm: 'azul medio', hex: '#000000' }, CORES_PADRAO).includes('Azul Médio'))
t('renomear a própria cor não acusa repetição', problemaDaCor({ nm: 'Azul Médio', hex: '#111111' }, CORES_PADRAO, 'azul-medio'), '')
t('cor nova ok', problemaDaCor({ nm: 'Verde Limão', hex: '#aaff00' }, CORES_PADRAO), '')

export default resultado('cores')
