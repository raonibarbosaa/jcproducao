// O tablet do setor com login geral. O que se protege aqui:
//  - o nome de quem deu baixa EXPIRA (o próximo a pegar o tablet não herda);
//  - só aparece na faixa quem tem PIN ligado e trabalha naquele setor;
//  - no tablet, "quem fez" é o funcionário e "onde" é o aparelho.
import {
  restaDoPosto, fmtResta, pinsDoPosto, quemAssina, quemFez, abasDoUsuario, POSTO_MINUTOS,
} from '../src/utils.js'
import { t, ok, resultado } from './_harness.mjs'

// ---------- expiração ----------
const t0 = 1_000_000
t('recém-identificado tem o tempo cheio', restaDoPosto(t0, t0), POSTO_MINUTOS * 60000)
t('depois de 1 min', restaDoPosto(t0, t0 + 60000), (POSTO_MINUTOS - 1) * 60000)
t('passou do prazo = 0', restaDoPosto(t0, t0 + POSTO_MINUTOS * 60000 + 1), 0)
t('ninguém ativo = 0', restaDoPosto(null, t0), 0)
t('mostra minutos:segundos', fmtResta(272000), '4:32')
t('arredonda para cima (nunca mostra 0:00 com tempo sobrando)', fmtResta(400), '0:01')

// ---------- quem aparece na faixa ----------
const pins = {
  a: { nome: 'Pedro', setores: ['PRODUCAO'], ativo: true, hash: 'h' },
  b: { nome: 'Ana', setores: ['silk'], ativo: true, hash: 'h' },            // setor antigo
  c: { nome: 'Caio', setores: ['PRODUCAO'], ativo: false, hash: 'h' },      // desligado
  d: { nome: 'Davi', setores: ['GRAFICA'], ativo: true, hash: 'h' },        // outro setor
  e: { nome: 'Eva', setores: ['PRODUCAO'], ativo: true },                  // sem hash
  f: { nome: 'Fábio', setores: ['PRODUCAO', 'montagem'], ativo: true, hash: 'h' },
}
t('silk: só os ligados do setor, em ordem', pinsDoPosto(pins, ['PRODUCAO']).map((x) => x.nome), ['Ana', 'Fábio', 'Pedro'])
t('leva o uid junto', pinsDoPosto(pins, ['GRAFICA']).map((x) => x.uid), ['d'])
t('posto sem setor não mostra ninguém', pinsDoPosto(pins, []), [])

// ---------- assinatura ----------
const base = { user: { uid: 'tab', email: 'silk@x' }, nome: 'Tablet Silk', perfil: 'operador', ip: '1.1.1.1' }
const noTablet = quemAssina({ ...base, posto: true, executor: { uid: 'a', nome: 'Pedro' } })
t('no tablet: logado é o aparelho', [noTablet.porUid, noTablet.porNome], ['tab', 'Tablet Silk'])
t('no tablet: quem fez é o funcionário', [noTablet.executorUid, noTablet.executorNome], ['a', 'Pedro'])
ok('e fica marcado que veio de posto', noTablet.posto === true)
const semNinguem = quemAssina({ ...base, posto: true, executor: null })
t('tablet sem ninguém NÃO assume o aparelho como executor', semNinguem.executorUid, '')
const proprio = quemAssina({ ...base, user: { uid: 'a' }, nome: 'Pedro', posto: false })
t('no próprio login, quem fez = quem logou', [proprio.executorUid, proprio.executorNome], ['a', 'Pedro'])
ok('e não é posto', !('posto' in proprio))
t('quemFez prefere o executor', quemFez(noTablet), 'Pedro')
t('registro antigo cai no porNome', quemFez({ porNome: 'Michele' }), 'Michele')

// ---------- abas ----------
t('tablet de expedição só vê a fila', abasDoUsuario('operador', ['expedicao'], ['producao'], true), ['producao'])
ok('operador de expedição de verdade continua com Entregas',
  abasDoUsuario('operador', ['expedicao'], ['producao']).includes('carga'))

export default resultado('posto')
