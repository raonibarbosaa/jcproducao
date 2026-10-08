// VERSÃO DO BUILD — o aviso de "recarregue" só pode aparecer quando a versão
// remota EXISTE e é diferente da embutida. Aviso à toa é aviso ignorado.
import { versaoMudou } from '../src/utils.js'
import { t, resultado } from './_harness.mjs'

t('mudou quando os dois existem e diferem', versaoMudou('abc-1', 'def-2'), true)
t('igual não mudou', versaoMudou('abc-1', 'abc-1'), false)
t('remota vazia (rede, 404) não avisa', versaoMudou('abc-1', ''), false)
t('remota indefinida não avisa', versaoMudou('abc-1', undefined), false)
t('atual vazia (dev) não avisa', versaoMudou('', 'def-2'), false)
t('espaço não conta como diferença', versaoMudou('abc-1 ', 'abc-1'), false)

