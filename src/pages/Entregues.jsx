import { useEffect, useState } from 'react'
import { collection, onSnapshot, doc, getDoc, setDoc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData, fmtMoeda, ORIGEM_NM, nomeCliente, ehGrafica, keyDoItem, valorDosItens, linhaDoItem,
  mapaEtapasComQtd, arredondaQtd } from '../utils.js'
import SeloLinha from '../components/SeloLinha.jsx'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Entregues() {
  const [itens, setItens] = useState([])
  const { clientes } = useCadastros()
  const { perfil, nome } = useAuth()
  const podeCancelar = perfil === 'dono' || perfil === 'designer'
  const podeBaixa = perfil === 'dono' || perfil === 'financeiro'   // baixa financeira
  const podeRetornar = perfil === 'dono' || perfil === 'designer' || perfil === 'financeiro' // não foi entregue
  const [busca, setBusca] = useState('')
  const [motoristaFiltro, setMotoristaFiltro] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'entregues'), (snap) => {
      setItens(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [])

  // motoristas que aparecem no histórico (inclui inativos/antigos)
  const motoristasNasEntregas = [...new Set(itens.map((p) => p.motorista).filter(Boolean))].sort()

  // Devolve os itens desta REMESSA para o pedido e apaga o registro da entrega.
  // Se o pedido ainda existe (entrega parcial: o resto ficou em produção), os itens
  // voltam para dentro dele; se não existe mais, o pedido é recriado só com eles.
  // `destino` é a etapa em que os itens voltam: 'expedido' (pronto, cai na Rota)
  // ou 'expedicao' (volta pro quadro de produção).
  // Desfaz a remessa devolvendo a QUANTIDADE entregue para `destino`.
  // Com produção parcial o item nunca saiu de `itens` — o que mudou foi a
  // distribuição —, então devolver é mover `entregue → destino` de volta.
  async function devolverAoPedido(p, destino) {
    const { id, entregueEm, motorista, pago, pagoPor, pagoEm,
            remessa, parcial, itensPendentes, ...pedido } = p
    const voltando = pedido.itens || []            // itens DESTA remessa (qtd = o que saiu)
    const agora = new Date().toISOString()
    const ref = doc(db, 'pedidos', p.idVenda)
    const atual = await getDoc(ref)

    if (atual.exists()) {
      const dados = atual.data()
      const movs = []
      voltando.forEach((it, n) => {
        const k = it.key || keyDoItem({ itens: voltando }, n)
        const idx = (dados.itens || []).findIndex((x, i) => (x.key || keyDoItem(dados, i)) === k)
        if (idx >= 0) movs.push({ idx, de: 'entregue', para: destino, qtd: arredondaQtd(it.qtd) })
      })
      await updateDoc(ref, { etapas: mapaEtapasComQtd(dados, movs, nome) })
    } else {
      // O pedido já tinha saído inteiro. Recria com as quantidades ORIGINAIS do
      // item; o que não veio nesta remessa foi entregue em outra, então continua
      // como `entregue` — senão essas quantidades reapareceriam na produção.
      const itens = voltando.map((it) => ({ ...it, qtd: arredondaQtd(it.qtdItem ?? it.qtd) }))
      const etapas = {}
      itens.forEach((it, i) => {
        const k = it.key || keyDoItem({ itens }, i)
        const devolvido = arredondaQtd(voltando[i].qtd)
        const total = arredondaQtd(it.qtd)
        etapas[k] = {
          montagem: 0, expedicao: 0, expedido: 0,
          entregue: Math.max(0, arredondaQtd(total - devolvido)),
          por: nome || '', em: agora,
        }
        etapas[k][destino] = arredondaQtd((etapas[k][destino] || 0) + devolvido)
      })
      await setDoc(ref, { ...pedido, itens, etapas, remessas: remessa ? remessa - 1 : 0 })
    }
    await deleteDoc(doc(db, 'entregues', p.id))
  }

  // desfaz a entrega: devolve o pedido ao fluxo (volta pra Rota) e sai do histórico
  async function cancelarEntrega(p) {
    if (!confirm(`Cancelar a entrega do pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)}${p.remessa ? ` (remessa ${p.remessa})` : ''}? ${p.itens?.length || 0} item(ns) voltam para a lista de rota.`)) return
    await devolverAoPedido(p, 'expedido')
  }

  // não foi entregue: devolve o pedido para a EXPEDIÇÃO (volta ao quadro de produção)
  async function retornarExpedicao(p) {
    if (!confirm(`O pedido #${p.idVenda} — ${nomeCliente(p.cliente, clientes)} NÃO foi entregue? ${p.itens?.length || 0} item(ns) voltam para a Expedição no quadro de produção.`)) return
    await devolverAoPedido(p, 'expedicao')
  }

  // baixa financeira: confirma o pagamento e fecha a remessa
  async function darBaixa(p) {
    await updateDoc(doc(db, 'entregues', p.id), {
      pago: true, pagoPor: nome || '', pagoEm: new Date().toISOString(),
    })
  }
  async function desfazerBaixa(p) {
    if (!confirm(`Reabrir o pagamento do pedido #${p.idVenda}? Ele volta para "pendente".`)) return
    await updateDoc(doc(db, 'entregues', p.id), {
      pago: false, pagoPor: deleteField(), pagoEm: deleteField(),
    })
  }

  const lista = itens
    .filter((p) =>
      !busca ||
      nomeCliente(p.cliente, clientes).toLowerCase().includes(busca.toLowerCase()) ||
      p.cliente?.toLowerCase().includes(busca.toLowerCase()) ||
      String(p.idVenda).includes(busca) ||
      p.cidade?.toLowerCase().includes(busca.toLowerCase())
    )
    .filter((p) => {
      if (!motoristaFiltro) return true
      if (motoristaFiltro === '__sem__') return !p.motorista
      return p.motorista === motoristaFiltro
    })
    .filter((p) => !soPendentes || !p.pago)
    .sort((a, b) => new Date(b.entregueEm) - new Date(a.entregueEm))

  // Total: com entrega parcial o mesmo pedido aparece em várias remessas, então o
  // valor do pedido só pode ser contado UMA vez (enquanto não houver valor por item).
  const valorRemessa = (p) => valorDosItens(p, (p.itens || []).map((_, i) => i))
  let totalMes = 0
  const jaContado = new Set()
  for (const p of lista) {
    const v = valorRemessa(p)
    if (v !== null) { totalMes += v; continue }
    if (!jaContado.has(p.idVenda)) { jaContado.add(p.idVenda); totalMes += Number(p.valorTotal) || 0 }
  }
  const nPendentes = itens.filter((p) => !p.pago).length

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Entregues
          <small>{lista.length} pedidos · {fmtMoeda(totalMes)}{nPendentes > 0 ? ` · ${nPendentes} pendente(s) de baixa` : ''}</small>
        </h1>
        <div className="spacer" />
        {(podeBaixa || nPendentes > 0) && (
          <label className="filter-pill">
            <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
            Só pendentes de baixa
          </label>
        )}
        {motoristasNasEntregas.length > 0 && (
          <select className="btn" style={{ minWidth: 170 }}
            value={motoristaFiltro} onChange={(e) => setMotoristaFiltro(e.target.value)}>
            <option value="">🚚 Todos os motoristas</option>
            {motoristasNasEntregas.map((m, i) => <option key={i} value={m}>{m}</option>)}
            <option value="__sem__">— sem motorista —</option>
          </select>
        )}
        <input className="btn" style={{ minWidth: 200 }} placeholder="Buscar cliente/cidade/ID…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {lista.length === 0 ? (
        <div className="empty"><div className="big">📦</div>Nenhuma entrega registrada ainda.</div>
      ) : (
        <div className="cards">
          {lista.map((p) => (
            <div key={p.id} className="card em_dia">
              <div className="card-top">
                <div className="cliente">{nomeCliente(p.cliente, clientes)}</div>
                <div className="idv">#{p.idVenda}{p.remessa > 1 ? ` · remessa ${p.remessa}` : ''}</div>
              </div>
              <div className="meta-row">
                {p.origem && <span className={`chip origem-${p.origem.toLowerCase()}`}>{ORIGEM_NM[p.origem] || p.origem}</span>}
                <span className="chip">{p.vendedor}</span>
                <span className="chip">{p.cidade || '—'}</span>
                {p.parcial && (
                  <span className="chip rota-warn" title="O resto do pedido ficou em produção">
                    📦 entrega parcial · faltaram {p.itensPendentes} item(ns)
                  </span>
                )}
                {p.motorista && <span className="chip">🚚 {p.motorista}</span>}
                <span className="chip" style={{ color: 'var(--ok)' }}>✓ {fmtData(p.entregueEm)}</span>
                {p.pago
                  ? <span className="chip" style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }} title={`Baixa por ${p.pagoPor || '—'}${p.pagoEm ? ` em ${fmtData(p.pagoEm)}` : ''}`}>💰 pago</span>
                  : <span className="chip rota-warn">⏳ pendente de baixa</span>}
              </div>
              <ul className="itens">
                {p.itens?.map((it, i) => (
                  <li key={i}><span><SeloLinha linha={linhaDoItem(p, i)} />{it.produto}</span><span className="q">{it.qtd}</span></li>
                ))}
              </ul>
              <div className="valor" style={{ marginTop: 8 }}>
                {valorRemessa(p) !== null
                  ? fmtMoeda(valorRemessa(p))
                  : <>{fmtMoeda(p.valorTotal)} {p.parcial && <small style={{ color: 'var(--text-faint)', fontWeight: 400 }}>total do pedido</small>}</>}
              </div>
              {(podeCancelar || podeBaixa || podeRetornar) && (
                <div className="modo-btns" style={{ marginTop: 10 }}>
                  {podeBaixa && (
                    p.pago
                      ? <button className="modo-btn" onClick={() => desfazerBaixa(p)}>↩ desfazer baixa</button>
                      : <button className="modo-btn" onClick={() => darBaixa(p)} style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>💰 Dar baixa (pago)</button>
                  )}
                  {podeRetornar && ehGrafica(p) && (
                    <button className="modo-btn" onClick={() => retornarExpedicao(p)} style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
                      ↩ Retornar para Expedição
                    </button>
                  )}
                  {podeCancelar && (
                    <button className="modo-btn" onClick={() => cancelarEntrega(p)} style={{ color: 'var(--danger)' }}>
                      ↩ Cancelar entrega
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
