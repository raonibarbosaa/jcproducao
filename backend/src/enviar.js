// Fila de envio: o navegador grava `enviar/{id}` com status 'pendente'; este
// processo pega, manda pela Evolution, grava a mensagem em
// conversas/{tel}/mensagens/{waId} e fecha o item da fila.
//   enviar/{id} = { telefone, texto, porUid, porNome, assinar: true, status,
//                   midia?: { tipo, mime, nome, base64 }, criadoEm }
// O token nunca sai daqui; a rule de `enviar` só deixa criar com status 'pendente'.
import { chaveTelefone, assinaTextoWa, docMensagemWa, resumoConversaWa } from '../../src/utils.js'
import { db, FieldValue } from './firestore.js'
import { enviarTexto, enviarMidia, enviarAudio } from './evolution.js'
import { salvaMidia } from './midia.js'

const processando = new Set()

export function assinaFilaEnvio() {
  db().collection('enviar').where('status', '==', 'pendente').onSnapshot(
    (s) => { for (const ch of s.docChanges()) if (ch.type === 'added') processa(ch.doc).catch((e) => console.error('[enviar]', e.message)) },
    (e) => console.error('[enviar] onSnapshot', e.message),
  )
}

async function processa(doc) {
  if (processando.has(doc.id)) return
  processando.add(doc.id)
  const fs = db()
  try {
    // reivindica: se outro processo já pegou, sai
    const ok = await fs.runTransaction(async (tx) => {
      const d = await tx.get(doc.ref)
      if (d.get('status') !== 'pendente') return false
      tx.update(doc.ref, { status: 'enviando', enviandoEm: new Date().toISOString() })
      return true
    })
    if (!ok) return

    const x = doc.data()
    const telefone = chaveTelefone(x.telefone)
    if (!telefone) throw new Error('telefone inválido')
    const porNome = String(x.porNome || '').trim()
    const texto = String(x.texto || '').trim()
    const assinado = x.assinar === false ? texto : assinaTextoWa(porNome, texto)

    let r
    let tipo = 'texto'
    if (x.midia?.base64) {
      tipo = x.midia.tipo === 'audio' ? 'audio' : x.midia.tipo === 'image' ? 'imagem' : x.midia.tipo === 'video' ? 'video' : 'documento'
      r = x.midia.tipo === 'audio'
        ? await enviarAudio(telefone, x.midia.base64)
        : await enviarMidia(telefone, { tipo: x.midia.tipo, mime: x.midia.mime, nome: x.midia.nome || 'arquivo', legenda: assinado, base64: x.midia.base64 })
    } else {
      if (!texto) throw new Error('texto vazio')
      r = await enviarTexto(telefone, assinado)
    }
    if (!r.ok) throw new Error(r.erro)

    const waId = r.data.waId || `env-${doc.id}`
    const agora = new Date().toISOString()
    const ev = { telefone, de: 'nos', nome: '', tipo, texto, waId, quando: agora, temMidia: !!x.midia, mime: x.midia?.mime || '', nomeArquivo: x.midia?.nome || '', segundos: 0 }
    const msg = docMensagemWa(ev, { porUid: x.porUid || '', porNome: porNome || 'sistema', origem: x.origem || 'sistema', demandaId: x.demandaId || '', idVenda: x.idVenda || '' })
    if (x.midia?.base64) {
      try { msg.midiaPath = await salvaMidia({ telefone, waId, base64: x.midia.base64, mime: x.midia.mime, nome: x.midia.nome }) } catch (e) { msg.midiaErro = e.message }
    }
    const refConv = fs.doc(`conversas/${telefone}`)
    const batch = fs.batch()
    batch.set(refConv.collection('mensagens').doc(waId), msg)
    // só os campos que o ENVIO sabe: última mensagem e zera não lidas. Os dados
    // do contato (nome, tipo, razão social) vieram do recebimento e ficam como
    // estão — por isso não passam pelo resumo (um merge com eles vazios apagaria).
    const { ultimaMsg, ultimaEm, ultimaDe } = resumoConversaWa(ev, null)
    batch.set(refConv, { telefone, ultimaMsg, ultimaEm, ultimaDe, naoLidas: 0 }, { merge: true })
    batch.update(doc.ref, { status: 'enviada', waId, enviadaEm: agora, midia: FieldValue.delete() })
    await batch.commit()
    console.log(`[enviar] ${doc.id} → ${telefone} (${tipo}) ${waId}`)
  } catch (e) {
    console.error(`[enviar] ${doc.id} falhou:`, e.message)
    await doc.ref.set({ status: 'falhou', erro: e.message, falhouEm: new Date().toISOString() }, { merge: true }).catch(() => {})
  } finally {
    processando.delete(doc.id)
  }
}
