// PIN do posto compartilhado. O que se protege aqui:
//  - desativar o usuário DESLIGA o PIN (senão quem saiu continua dando baixa);
//  - o PIN nunca vai em claro, e o mesmo PIN em duas pessoas não se denuncia;
//  - login interno é reconhecido (redefinir senha nele não chega a ninguém).
import {
  pinValido, pinFraco, problemaDoPin, hashPin, conferePin, docPin,
  loginInterno, ehLoginInterno,
} from '../src/utils.js'
import { t, ok, resultado } from './_harness.mjs'

// ---------- formato ----------
ok('4 dígitos vale', pinValido('2580'))
ok('3 dígitos não', !pinValido('258'))
ok('5 dígitos não', !pinValido('25801'))
ok('letra não', !pinValido('25a0'))
ok('vazio não', !pinValido(''))

// ---------- fácil demais ----------
for (const p of ['0000', '7777', '1234', '4321', '6789', '0123', '9876']) ok(`${p} é fraco`, pinFraco(p))
for (const p of ['2580', '1357', '1122', '9021', '1243']) ok(`${p} passa`, !pinFraco(p))
t('mensagem do inválido', problemaDoPin('12'), 'O PIN tem que ter exatamente 4 números.')
ok('mensagem do fraco', problemaDoPin('1111').includes('fácil'))
t('PIN bom não tem problema', problemaDoPin('2580'), '')

// ---------- hash ----------
const h1 = await hashPin('uidA', '2580')
ok('hash não contém o PIN', !h1.includes('2580') && h1.length === 64)
t('hash é estável', await hashPin('uidA', '2580'), h1)
ok('mesmo PIN, outra pessoa, outro hash', (await hashPin('uidB', '2580')) !== h1)
ok('confere o certo', await conferePin('uidA', '2580', h1))
ok('recusa o errado', !(await conferePin('uidA', '2581', h1)))
ok('recusa o PIN de outra pessoa', !(await conferePin('uidB', '2580', h1)))
ok('sem hash cadastrado recusa', !(await conferePin('uidA', '2580', '')))

// ---------- documento ----------
const op = { nome: ' João ', perfil: 'operador', setores: ['silk', 'GRAFICA'], ativo: true }
t('doc do operador', docPin(op, 'H'), { nome: 'João', setores: ['PRODUCAO', 'GRAFICA'], ativo: true, hash: 'H' })
t('sem hash novo, não mexe no hash', 'hash' in docPin(op), false)
t('DESATIVAR o usuário desliga o PIN', docPin({ ...op, ativo: false }).ativo, false)
t('trocar para outro perfil desliga o PIN', docPin({ ...op, perfil: 'designer' }).ativo, false)
t('e não leva setor', docPin({ ...op, perfil: 'designer' }).setores, [])
t('usuário antigo sem campo ativo conta como ativo', docPin({ nome: 'X', perfil: 'operador' }).ativo, true)

// ---------- login interno ----------
t('primeiro + último nome, sem acento', loginInterno('Maria José da Silva'), 'maria.silva@jcsacolas.app')
t('nome único', loginInterno('Juninho'), 'juninho@jcsacolas.app')
t('repetido ganha número', loginInterno('João Souza', ['joao.souza@jcsacolas.app']), 'joao.souza2@jcsacolas.app')
t('compara sem caixa', loginInterno('João Souza', ['JOAO.SOUZA@jcsacolas.app', 'joao.souza2@jcsacolas.app']),
  'joao.souza3@jcsacolas.app')
t('nome vazio não inventa login', loginInterno('  '), '')
ok('reconhece login interno', ehLoginInterno('Maria.Silva@JCSACOLAS.APP'))
ok('e-mail real não é interno', !ehLoginInterno('maria@gmail.com'))

export default resultado('pin')
