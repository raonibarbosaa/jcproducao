// PESO — o que limita a carga do caminhão.
import { pesoDaQtd, pesoDaLista, fmtPeso, itensSemPeso, PESO_PADRAO } from '../src/utils.js'
import { t, resultado } from './_harness.mjs'

const CAD = [
  { produto: 'SACOLA PLASTICA 30X40', tipo: 'plastico', unidade: 'kg' },
  { produto: 'SACOLA PAPEL COM PESO', tipo: 'papel', unidade: 'un', pesoUnit: 0.012 },
  { produto: 'SACOLA PAPEL SEM PESO', tipo: 'papel', unidade: 'un' },
  { produto: 'ETIQUETA GRANDE', tipo: 'etiquetas', unidade: 'un' },
]

t('médias informadas pelo dono', [PESO_PADRAO.papel, PESO_PADRAO.alca_torcida], [0.04, 0.045])

// hierarquia: balança > cadastro do produto > média do material
t('o volume de PLÁSTICO já é kg — foi à balança na montagem',
  pesoDaQtd('SACOLA PLASTICA 30X40', 98.3, CAD), { kg: 98.3, estimado: false })
t('o peso cadastrado no produto vira kg e é marcado como estimado',
  pesoDaQtd('SACOLA PAPEL COM PESO', 500, CAD), { kg: 6, estimado: true })
t('sem peso próprio, o papel cai na média de 40 g',
  pesoDaQtd('SACOLA PAPEL SEM PESO', 500, CAD), { kg: 20, estimado: true, padrao: true })
t('a alça torcida idem, a 45 g',
  pesoDaQtd('ALCA TORCIDA 50CM', 300, []), { kg: 13.5, estimado: true, padrao: true })

// ⚠️ sem média não há chute
t('ETIQUETA fica FORA da conta e diz isso',
  pesoDaQtd('ETIQUETA GRANDE', 1000, CAD), { kg: 0, estimado: false, semPeso: true })

const r = pesoDaLista([
  { produto: 'SACOLA PLASTICA 30X40', qtd: 100 },   // 100 kg pesados
  { produto: 'SACOLA PAPEL COM PESO', qtd: 500 },   // 6 kg pelo cadastro
  { produto: 'SACOLA PAPEL SEM PESO', qtd: 250 },   // 10 kg pela média
  { produto: 'ETIQUETA GRANDE', qtd: 900 },         // fora
], CAD)
t('a soma junta os três caminhos', r.kg, 116)
t('avisa que há estimativa', r.estimado, true)
t('conta quantos vieram da MÉDIA (não valem o mesmo numa conferência)', r.padrao, 1)
t('O QUE ISSO EVITA: volume sem peso some calado e o caminhão passa do limite', r.semPeso, 1)
t('o rótulo mostra os três fatos', fmtPeso(r), '~116 kg + 1 sem peso')
t('sem estimativa nenhuma, some o ~',
  fmtPeso(pesoDaLista([{ produto: 'SACOLA PLASTICA 30X40', qtd: 40 }], CAD)), '40 kg')
t('só é pendência de cadastro quem não tem peso NEM média', itensSemPeso(CAD), 1)

export default resultado('peso')
