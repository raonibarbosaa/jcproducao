// WhatsApp — o que se protege aqui (ver WHATSAPP.md):
//  - o MESMO telefone escrito de jeitos diferentes (com/sem nono dígito, com/sem
//    DDI) vira UMA chave — senão o cliente vira dois contatos;
//  - grupo, status e @lid NÃO viram conversa;
//  - o número de pedido citado no texto é reconhecido, e "2026" não é pedido;
//  - o evento da Evolution é normalizado sem derrubar o webhook quando falta campo;
//  - o backend "vivo" é o que carimbou há pouco.
import {
  chaveTelefone, telefoneDoJid, fmtTelefone, resolveContato, numerosDePedidoNoTexto,
  tipoDaMensagemWa, textoDaMensagemWa, normalizaEventoWa, docMensagemWa, resumoConversaWa,
  assinaTextoWa, backendVivo,
} from '../src/utils.js'
import { t, ok, resultado } from './_harness.mjs'

// ---------- telefone ----------
t('celular com tudo', chaveTelefone('+55 (79) 99999-0000'), '5579999990000')
t('sem DDI ganha 55', chaveTelefone('79 99999-0000'), '5579999990000')
t('sem nono dígito ganha o 9', chaveTelefone('557999990000'), '5579999990000')
t('fixo sem DDI não ganha 9 (começa com 3)', chaveTelefone('79 3211-0000'), '557932110000')
t('vazio', chaveTelefone(''), '')
t('outro país fica como veio', chaveTelefone('+351 912 345 678'), '351912345678')
t('formata brasileiro', fmtTelefone('5579999990000'), '+55 (79) 99999-0000')

t('jid comum', telefoneDoJid('5579999990000@s.whatsapp.net'), '5579999990000')
t('jid com sufixo de device', telefoneDoJid('5579999990000:12@s.whatsapp.net'), '5579999990000')
t('jid sem nono dígito normaliza', telefoneDoJid('557999990000@s.whatsapp.net'), '5579999990000')
t('grupo não tem telefone', telefoneDoJid('120363012345678901@g.us'), null)
t('status não tem telefone', telefoneDoJid('status@broadcast'), null)
t('lid não tem telefone', telefoneDoJid('123456789@lid'), null)
t('nulo', telefoneDoJid(null), null)

// ---------- quem é ----------
const cad = {
  clientes: [
    { razao: 'ATUAL MODAS LTDA', nome: 'Atual Modas', telefones: ['79 99999-0000', '(79) 98888-1111'] },
    { razao: 'LUX BEACHWEAR', nome: 'Lux', telefone: '5579977776666' },
  ],
  vendedores: [{ nome: 'SERGIO', telefone: '79 91111-2222', rotas: [] }],
  motoristas: [{ nome: 'JUNINHO', telefone: '7993333-4444', ativo: true }],
}
t('cliente pela lista de telefones', resolveContato('5579999990000', cad), { tipo: 'cliente', clienteRazao: 'ATUAL MODAS LTDA', clienteNome: 'Atual Modas' })
t('cliente pelo 2º telefone, sem nono dígito', resolveContato('557988881111', cad), { tipo: 'cliente', clienteRazao: 'ATUAL MODAS LTDA', clienteNome: 'Atual Modas' })
t('cliente com campo `telefone` (singular) também vale', resolveContato('5579977776666', cad).clienteRazao, 'LUX BEACHWEAR')
t('vendedor', resolveContato('5579911112222', cad), { tipo: 'vendedor', vendedorNome: 'SERGIO' })
t('motorista', resolveContato('5579933334444', cad), { tipo: 'motorista', motoristaNome: 'JUNINHO' })
t('desconhecido', resolveContato('5579900000000', cad), null)
t('cadastros vazios não quebram', resolveContato('5579900000000', {}), null)
// vendedor cadastrado também como telefone do cliente: quem fala é o vendedor
const cad2 = { ...cad, clientes: [{ razao: 'X', telefones: ['79 91111-2222'] }] }
t('vendedor ganha do cliente', resolveContato('5579911112222', cad2).tipo, 'vendedor')

// ---------- número de pedido no texto ----------
t('#5458', numerosDePedidoNoTexto('e o #5458?'), ['5458'])
t('solto', numerosDePedidoNoTexto('cadê o pedido 5458 e o 5111'), ['5458', '5111'])
t('com ponto de milhar', numerosDePedidoNoTexto('pedido 5.458'), ['5458'])
t('repetido sai uma vez', numerosDePedidoNoTexto('5458 5458'), ['5458'])
t('44000+ é de outro sistema', numerosDePedidoNoTexto('nota 44123'), [])
t('3 dígitos não é pedido', numerosDePedidoNoTexto('são 500 sacolas'), [])
t('telefone não vira pedido', numerosDePedidoNoTexto('liga 99999-0000'), [])
t('com lista de conhecidos, só quem existe', numerosDePedidoNoTexto('2026 foi bom, e o 5458?', ['5458', '5111']), ['5458'])
t('vazio', numerosDePedidoNoTexto(''), [])

// ---------- mensagens da Evolution ----------
t('texto simples', textoDaMensagemWa({ conversation: ' oi ' }), 'oi')
t('texto estendido', textoDaMensagemWa({ extendedTextMessage: { text: 'link' } }), 'link')
t('legenda da imagem', textoDaMensagemWa({ imageMessage: { caption: 'foto', mimetype: 'image/jpeg' } }), 'foto')
t('áudio não tem texto', textoDaMensagemWa({ audioMessage: { mimetype: 'audio/ogg' } }), '')
t('tipo imagem', tipoDaMensagemWa({ imageMessage: {} }), 'imagem')
t('tipo áudio', tipoDaMensagemWa({ audioMessage: {} }), 'audio')
t('tipo documento com legenda (embrulhado)', tipoDaMensagemWa({ documentWithCaptionMessage: { message: { documentMessage: { fileName: 'a.pdf' } } } }), 'documento')
t('viewOnce embrulhado', tipoDaMensagemWa({ viewOnceMessageV2: { message: { imageMessage: {} } } }), 'imagem')
t('desconhecido', tipoDaMensagemWa({ pollCreationMessage: {} }), 'outro')
t('mensagem nula', tipoDaMensagemWa(null), 'outro')

const upsert = {
  event: 'messages.upsert', instance: 'jc_principal',
  data: {
    key: { remoteJid: '557999990000@s.whatsapp.net', fromMe: false, id: 'ABC123' },
    pushName: 'Maria', message: { conversation: 'cadê o 5458?' }, messageTimestamp: 1790000000,
  },
}
const ev = normalizaEventoWa(upsert)
t('evento vira mensagem', ev.evento, 'mensagem')
t('telefone normalizado (ganhou o 9)', ev.telefone, '5579999990000')
t('de cliente', ev.de, 'cliente')
t('nome do push', ev.nome, 'Maria')
t('texto', ev.texto, 'cadê o 5458?')
t('sem mídia', ev.temMidia, false)
t('timestamp em segundos vira ISO', ev.quando, new Date(1790000000 * 1000).toISOString())
t('waId', ev.waId, 'ABC123')

t('evento em MAIÚSCULA também', normalizaEventoWa({ ...upsert, event: 'MESSAGES_UPSERT' }).evento, 'mensagem')
t('fromMe = nós (digitado no celular também conta)', normalizaEventoWa({ ...upsert, data: { ...upsert.data, key: { ...upsert.data.key, fromMe: true } } }).de, 'nos')
t('grupo é ignorado', normalizaEventoWa({ ...upsert, data: { ...upsert.data, key: { remoteJid: '1203@g.us', id: 'x' } } }).evento, 'ignorado')
t('stub (entrou no grupo etc.) é ignorado', normalizaEventoWa({ ...upsert, data: { ...upsert.data, message: null, messageStubType: 2 } }).evento, 'ignorado')
t('reação é ignorada', normalizaEventoWa({ ...upsert, data: { ...upsert.data, message: { reactionMessage: { text: '👍' } } } }).evento, 'ignorado')
t('payload vazio não quebra', normalizaEventoWa({}).evento, 'ignorado')
t('payload nulo não quebra', normalizaEventoWa(null).evento, 'ignorado')

const img = normalizaEventoWa({ ...upsert, data: { ...upsert.data, message: { imageMessage: { caption: 'canhoto', mimetype: 'image/jpeg' } } } })
t('imagem tem mídia', img.temMidia, true)
t('imagem guarda o mime', img.mime, 'image/jpeg')

t('connection.update', normalizaEventoWa({ event: 'connection.update', instance: 'jc', data: { state: 'open' } }), { evento: 'conexao', instancia: 'jc', estado: 'open', motivo: null })
const st = normalizaEventoWa({ event: 'messages.update', instance: 'jc', data: [{ keyId: 'ABC', status: 'READ' }, { key: { id: 'DEF' }, status: 'DELIVERY_ACK' }] })
t('messages.update lista de status', st, { evento: 'status', instancia: 'jc', itens: [{ waId: 'ABC', status: 'read' }, { waId: 'DEF', status: 'delivery_ack' }] })

// ---------- documentos ----------
const doc = docMensagemWa(ev, { idVendasSugeridos: ['5458'] })
t('doc: recebida', doc.statusWa, 'recebida')
t('doc: nome de quem falou', doc.porNome, 'Maria')
t('doc: sugestão de pedido', doc.idVendasSugeridos, ['5458'])
t('doc: vínculo começa vazio', doc.idVenda, '')
const docNos = docMensagemWa({ ...ev, de: 'nos', nome: '' })
t('doc: enviada do celular sem autor conhecido', docNos.porNome, '📱 celular')
t('doc: enviada pelo sistema leva o autor', docMensagemWa({ ...ev, de: 'nos' }, { porNome: 'Ana' }).porNome, 'Ana')

const contato = resolveContato(ev.telefone, cad)
const res = resumoConversaWa(ev, contato)
t('conversa: nome do cadastro ganha do push', res.contatoNome, 'Atual Modas')
t('conversa: razão social para casar com pedidos', res.clienteRazao, 'ATUAL MODAS LTDA')
t('conversa: última msg', res.ultimaMsg, 'cadê o 5458?')
t('conversa: sem cadastro usa o push', resumoConversaWa(ev, null).contatoNome, 'Maria')
t('conversa: mídia vira prefixo', resumoConversaWa(img, null).ultimaMsg, '[imagem] canhoto')

t('assinatura', assinaTextoWa('Ana', 'oi'), '*Ana:*\n\noi')
t('sem nome não assina', assinaTextoWa('', 'oi'), 'oi')

// ---------- backend vivo ----------
const agora = new Date('2026-09-27T12:00:00Z')
ok('carimbo de 1 min atrás = vivo', backendVivo('2026-09-27T11:59:00Z', agora))
ok('carimbo de 5 min atrás = fora', !backendVivo('2026-09-27T11:55:00Z', agora))
ok('sem carimbo = fora', !backendVivo('', agora))
ok('carimbo inválido = fora', !backendVivo('ontem', agora))

export default resultado('whatsapp')
