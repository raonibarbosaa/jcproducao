// Recebimento: evento da Evolution → Firestore.
//   conversas/{tel}                  resumo (última msg, não lidas, contato)
//   conversas/{tel}/mensagens/{waId} a mensagem (id = waId: repetir o evento não duplica)
//   contatos/{tel}                   quem é o número (resolvido pelos cadastros)
import { normalizaEventoWa, resolveContato, numerosDePedidoNoTexto, docMensagemWa, resumoConversaWa } from '../../src/utils.js'
import { db, FieldValue, getCadastros, getPedidosConhecidos, heartbeat } from './firestore.js'
import { baixarMidia } from './evolution.js'
import { salvaMidia } from './midia.js'

export async function processaEvento(payload) {
  const ev = normalizaEventoWa(payload)
  if (ev.evento === 'ignorado') return { ignorado: ev.motivo }
  if (ev.evento === 'conexao') {
    console.log(`[wa] conexão: ${ev.estado}${ev.motivo != null ? ` (${ev.motivo})` : ''}`)
    await heartbeat({ estado: ev.estado, estadoEm: new Date().toISOString() })
    return { conexao: ev.estado }
  }
  if (ev.evento === 'status') {
    await atualizaStatus(ev.itens)
    return { status: ev.itens.length }
  }
  return gravaMensagem(ev)
}

async function gravaMensagem(ev) {
  const fs = db()
  const refConv = fs.doc(`conversas/${ev.telefone}`)
  const refMsg = refConv.collection('mensagens').doc(ev.waId || `${Date.now()}`)

  // repetição do webhook: já temos, não conta de novo
  if (ev.waId && (await refMsg.get()).exists) return { repetida: ev.waId }
  const convExiste = (await refConv.get()).exists

  const contato = resolveContato(ev.telefone, getCadastros())
  const sugeridos = numerosDePedidoNoTexto(ev.texto, getPedidosConhecidos().size ? getPedidosConhecidos() : null)
  const msg = docMensagemWa(ev, { idVendasSugeridos: sugeridos })

  // mídia: baixa da Evolution e guarda no disco. Falha na mídia NÃO perde a mensagem.
  if (ev.temMidia && ev.waId) {
    const m = await baixarMidia(ev.waId)
    if (m.ok) {
      try {
        msg.midiaPath = await salvaMidia({ telefone: ev.telefone, waId: ev.waId, base64: m.data.base64, mime: m.data.mime || ev.mime, nome: m.data.nome || ev.nomeArquivo })
        msg.midiaMime = m.data.mime || ev.mime
      } catch (e) {
        console.error('[midia] gravar', e.message); msg.midiaErro = e.message
      }
    } else {
      console.error('[midia] baixar', m.erro); msg.midiaErro = m.erro
    }
  }

  const resumo = resumoConversaWa(ev, contato)
  // Só a mensagem do CLIENTE mexe no status (abre/reabre) e soma não lida; a
  // nossa — do celular ou do sistema — zera as não lidas e não toca no status.
  const conv = ev.de === 'cliente'
    ? { ...resumo, naoLidas: FieldValue.increment(1), status: 'aberta' }
    : { ...resumo, naoLidas: 0 }
  const batch = fs.batch()
  batch.set(refMsg, msg)
  if (!convExiste) conv.criadaEm = ev.quando
  batch.set(refConv, conv, { merge: true })
  batch.set(fs.doc(`contatos/${ev.telefone}`), {
    telefone: ev.telefone,
    nome: contato?.clienteNome || contato?.vendedorNome || contato?.motoristaNome || ev.nome || '',
    ...(ev.nome ? { pushName: ev.nome } : {}),
    tipo: contato?.tipo || '',
    clienteRazao: contato?.clienteRazao || '',
    vendedorNome: contato?.vendedorNome || '',
    motoristaNome: contato?.motoristaNome || '',
    atualizadoEm: ev.quando,
  }, { merge: true })
  await batch.commit()
  return { gravada: ev.waId, telefone: ev.telefone, tipo: ev.tipo, contato: contato?.tipo || 'desconhecido', sugeridos }
}

// status de entrega/leitura das mensagens que NÓS mandamos (messages.update)
async function atualizaStatus(itens) {
  const fs = db()
  const mapa = { delivery_ack: 'entregue', read: 'lida', played: 'lida', server_ack: 'enviada', error: 'falhou' }
  for (const it of itens) {
    const st = mapa[it.status]
    if (!st) continue
    // não sabemos o telefone pelo evento: busca a mensagem pelo waId (collection group)
    const q = await fs.collectionGroup('mensagens').where('waId', '==', it.waId).limit(1).get()
    if (q.empty) continue
    await q.docs[0].ref.set({ statusWa: st }, { merge: true })
  }
}
