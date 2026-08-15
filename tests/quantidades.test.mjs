// Produção parcial por QUANTIDADE — o item não anda mais inteiro.
import {
  distribuicaoDoItem, qtdNaEtapa, moveQtdItem, arredondaQtd, qtdPendente,
  qtdEmProducao, temTrabalhoNaProducao, mapaEtapasComQtd, etapaDoItem,
} from '../src/utils.js'
import { t, ok, resultado, pedido, k } from './_harness.mjs'

const um = (etapas = {}) => pedido({
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 100, linha: 'GRAFICA' }], etapas: { 0: etapas },
})

// ---------- a linha é o RESTO, nunca um campo próprio ----------
t('nada avançou: tudo na linha', distribuicaoDoItem(um(), 0).GRAFICA, 100)
t('40 na montagem deixam 60 na linha', distribuicaoDoItem(um({ montagem: 40 }), 0).GRAFICA, 60)
t('a soma das partes fecha com o total',
  Object.values(distribuicaoDoItem(um({ montagem: 40, expedicao: 10 }), 0)).reduce((a, b) => a + b, 0), 100)

// O import pode mudar a quantidade do item. Guardando só o que avançou, a linha
// se ajusta sozinha — guardar os dois lados deixaria total e partes em desacordo.
const reimportado = pedido({
  itens: [{ produto: 'SACOLA PAPEL P02', qtd: 120, linha: 'GRAFICA' }],
  etapas: { 0: { montagem: 50 } },
})
t('O QUE ISSO PROTEGE: reimport de 100→120 vira 70 na linha sozinho',
  distribuicaoDoItem(reimportado, 0).GRAFICA, 70)

// ---------- arredondamento: plástico é kg ----------
t('3 casas, senão sobra "0,00000001 kg" pendente para sempre', arredondaQtd(0.1 + 0.2), 0.3)
t('lixo não vira NaN', arredondaQtd('abc'), 0)

// ---------- mover ----------
t('nunca move mais do que existe',
  moveQtdItem(um({ montagem: 10 }), 0, 'montagem', 'expedicao', 999).expedicao, 10)
t('mover zero não cria entrada', moveQtdItem(um(), 0, 'montagem', 'expedicao', 5), null)

// ---------- a fronteira que a Lista de Produção usa ----------
t('montagem é produção', qtdEmProducao(um({ montagem: 100 }), 0), 100)
t('expedição é produção (tem coluna no quadro)', qtdEmProducao(um({ expedicao: 100 }), 0), 100)
t('expedido NÃO é', qtdEmProducao(um({ expedido: 100 }), 0), 0)
t('entregue NÃO é', qtdEmProducao(um({ entregue: 100 }), 0), 0)
t('O BUG DO #5276: pedido todo expedido sai da lista de produção',
  temTrabalhoNaProducao(um({ expedido: 100 })), false)
t('parcial continua na lista, com o que FALTA',
  [temTrabalhoNaProducao(um({ expedido: 40 })), qtdEmProducao(um({ expedido: 40 }), 0)], [true, 60])

// na dúvida o pedido FICA: sumir da produção é pior que aparecer a mais
t('pedido sem itens e sem etapa continua aparecendo',
  temTrabalhoNaProducao({ idVenda: '1', status: 'PRODUCAO' }), true)
t('campo antigo p.etapa=expedido some', temTrabalhoNaProducao({ ...um(), etapa: 'expedido' }), false)

// ---------- etapa mais atrasada com quantidade ----------
t('etapaDoItem aponta onde o trabalho ESTÁ (a mais atrasada)',
  etapaDoItem(um({ montagem: 30, expedido: 20 }), 0), 'GRAFICA')
t('sem nada na linha, cai para a montagem',
  etapaDoItem(um({ montagem: 100 }), 0), 'montagem')

// ---------- pendente = tudo menos entregue ----------
t('qtdPendente ignora só o entregue', qtdPendente(um({ expedido: 60, entregue: 40 }), 0), 60)

// ---------- o mapa gravado ----------
const p = um()
const mapa = mapaEtapasComQtd(p, [{ idx: 0, de: 'GRAFICA', para: 'montagem', qtd: 40 }], 'Ana')
t('grava só o que avançou', mapa[k(p)].montagem, 40)
ok('e carimba quem moveu', mapa[k(p)].por === 'Ana')
t('a linha continua sendo o resto, não um campo', mapa[k(p)].GRAFICA, undefined)

export default resultado('quantidades')
