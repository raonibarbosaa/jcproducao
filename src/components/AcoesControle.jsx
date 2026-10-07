import { useState } from 'react'
import { collection, doc, updateDoc, setDoc, deleteDoc, deleteField, writeBatch } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  lancarControle, lancadoNoControle, preparaRemessa, saiuParaEntrega, idxProntos,
  nomeCliente, fmtQtd, avisosEntregaAbertos, fechaAvisoPeloLancamento, podeFecharAviso,
} from '../utils.js'

// As AÇÕES do Controle de entrega — fonte única para a aba Controle e para o
// Localizar (Fase C): lançar (finalizado + saiu), voltou, saiu de novo,
// entregue. Quem usa dá o `quem()` da assinatura e recebe `salvando`.
export function useAcoesControle({ quem, nome, perfil, clientes, itensCad, podeLancar, podeEntregar, depois }) {
  const [salvando, setSalvando] = useState('')
  const fim = () => { setSalvando(''); depois?.() }

  // LANÇAR: baixa inteira + carimbo + saída + auditoria num batch só. Se há
  // aviso "já foi entregue" aberto e quem lança é staff, o aviso fecha junto —
  // o lançamento É a resposta ao aviso.
  async function lancar(p, motorista, avisos) {
    if (!podeLancar || salvando) return
    if (!motorista) { alert('Escolha o motorista: o lançamento diz que o pedido SAIU com alguém.'); return }
    const q = quem()
    const l = lancarControle(p, q, motorista, itensCad)
    if (!l) return
    const abertos = podeFecharAviso(perfil) ? avisosEntregaAbertos(avisos) : []
    const lista = l.movidos.length
      ? `\n\nO que ainda estava na fábrica passa a FINALIZADO:\n${l.movidos.map((m) =>
          `• ${m.produto} — ${fmtQtd(m.qtd)}${m.semPesagem ? ` (${fmtQtd(m.semPesagem)} sem pesagem)` : ''}`).join('\n')}`
      : '\n\nA fábrica já tinha dado baixa em tudo; fica só o lançamento e a saída.'
    const aviso = abertos.length ? `\n\nFecha também ${abertos.length} aviso(s) "já foi entregue" do vendedor.` : ''
    if (!confirm(`Lançar o pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)} como FINALIZADO e SAÍDO com ${motorista}?${lista}${aviso}\n\nFica registrado que a baixa foi do escritório.`)) return
    setSalvando(`lancar-${p.idVenda}`)
    try {
      const batch = writeBatch(db)
      batch.update(doc(db, 'pedidos', String(p.idVenda)), { ...(l.gravaEtapas ? { etapas: l.etapas } : {}), ...l.campos })
      for (const r of l.registros) batch.set(doc(collection(db, 'auditoria')), r)
      for (const x of abertos) batch.update(doc(db, 'problemas', x.id), fechaAvisoPeloLancamento(motorista, q))
      await batch.commit()
    } catch (e) {
      alert('Não foi possível lançar: ' + (e.code || e.message))
    } finally { fim() }
  }

  // "NÃO ENTREGOU": voltou no caminhão. Continua lançado; só a saída é apagada.
  async function voltou(p) {
    if (!podeLancar || salvando) return
    if (!confirm(`O pedido #${p.idVenda} voltou sem ser entregue? Ele fica como NÃO ENTREGOU, para sair de novo.`)) return
    setSalvando(`voltou-${p.idVenda}`)
    try {
      await updateDoc(doc(db, 'pedidos', String(p.idVenda)), {
        saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
      })
    } catch (e) {
      alert('Não foi possível registrar o retorno: ' + (e.code || e.message))
    } finally { fim() }
  }

  async function sairDeNovo(p, motorista) {
    if (!podeLancar || salvando) return
    if (!motorista) { alert('Escolha o motorista.'); return }
    if (!confirm(`O pedido #${p.idVenda} saiu de novo com ${motorista}?`)) return
    setSalvando(`saida-${p.idVenda}`)
    try {
      await updateDoc(doc(db, 'pedidos', String(p.idVenda)), {
        saidaEm: new Date().toISOString(), saidaMotorista: motorista, saidaPor: nome || '',
      })
    } catch (e) {
      alert('Não foi possível marcar a saída: ' + (e.code || e.message))
    } finally { fim() }
  }

  // ENTREGUE: a mesma remessa da Rota (`preparaRemessa`). Financeiro e dono.
  async function entregar(p) {
    if (!podeEntregar || salvando) return
    const motorista = p.saidaMotorista || p.baixaEscritorio?.motorista || ''
    const r = preparaRemessa(p, motorista, nome)
    if (!r) { alert('Nada expedido neste pedido — lance antes.'); return }
    if (!confirm(`Confirmar ENTREGA do pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)}${motorista ? ` por ${motorista}` : ''}?\n\nEle sai do Controle de entrega e vai para Entregues.`)) return
    setSalvando(`entrega-${p.idVenda}`)
    try {
      await setDoc(doc(db, 'entregues', r.docId), r.remessa)
      if (r.acabou) {
        await deleteDoc(doc(db, 'pedidos', String(p.idVenda)))
      } else {
        await updateDoc(doc(db, 'pedidos', String(p.idVenda)), {
          etapas: r.etapas, remessas: r.n,
          saidaEm: deleteField(), saidaMotorista: deleteField(), saidaPor: deleteField(),
        })
      }
    } catch (e) {
      alert('Não foi possível registrar a entrega: ' + (e.code || e.message))
    } finally { fim() }
  }

  return { salvando, lancar, voltou, sairDeNovo, entregar }
}

// A barra de botões do pedido (o mesmo bloco na aba Controle e no Localizar).
// `acoes` = o que `useAcoesControle` devolve. `problemas` = avisos do pedido.
export default function AcoesControle({ p, motoristas, podeLancar, podeEntregar, acoes, problemas }) {
  const [motorista, setMotorista] = useState('')
  if (!p || (!podeLancar && !podeEntregar)) return null
  const lancado = lancadoNoControle(p)
  const saiu = saiuParaEntrega(p)
  const ocupado = !!acoes?.salvando
  const mot = motorista || p.saidaMotorista || p.baixaEscritorio?.motorista || ''
  const prontos = idxProntos(p)
  return (
    <div className="ctl-acoes no-print">
      {podeLancar && (!lancado || !saiu) && (motoristas || []).length > 0 && (
        <select className="filtro-input" value={motorista} onChange={(e) => setMotorista(e.target.value)} disabled={ocupado}>
          <option value="">Motorista…</option>
          {motoristas.map((m) => <option key={m.id || m.nome} value={m.nome}>{m.nome}</option>)}
        </select>
      )}
      {podeLancar && !lancado && (
        <button className="btn primary" disabled={ocupado || !motorista} onClick={() => acoes.lancar(p, motorista, problemas)}>
          ✔ Lançar: finalizado e saiu{motorista ? ` com ${motorista}` : ''}
        </button>
      )}
      {podeLancar && lancado && !saiu && (
        <button className="btn primary" disabled={ocupado || !motorista} onClick={() => acoes.sairDeNovo(p, motorista)}>
          🚚 Saiu de novo{motorista ? ` com ${motorista}` : ''}
        </button>
      )}
      {podeLancar && lancado && saiu && (
        <button className="btn" disabled={ocupado} onClick={() => acoes.voltou(p)}>↩ Não entregou (voltou)</button>
      )}
      {podeEntregar && lancado && prontos.length > 0 && (
        <button className="btn ok" disabled={ocupado} onClick={() => acoes.entregar(p)}>
          📦 ENTREGUE{mot ? ` por ${mot}` : ''}
        </button>
      )}
      {!podeEntregar && lancado && <small className="ctl-nota">entregue: financeiro ou dono</small>}
    </div>
  )
}
