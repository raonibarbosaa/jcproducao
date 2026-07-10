import { useState } from 'react'
import { doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import { fmtData } from '../utils.js'
import { useAuth } from '../contexts/AuthContext.jsx'

// Chip da data de entrega com edição manual (dono/designer).
// Recebe o pedido com p.previsao JÁ resolvida (previsaoDe) pela tela que usa.
// Data manual fica em pedidos/{idVenda}.previsaoManual — as telas recalculam
// no render, então salvar aqui reagrupa o pedido na hora em Produção/Rota.
export default function DataEntrega({ p, atrasado }) {
  const { perfil, nome } = useAuth()
  const podeEditar = perfil === 'dono' || perfil === 'designer'
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const manual = !!p.previsaoManual

  function abrir() {
    const d = p.previsao ? new Date(p.previsao) : new Date()
    const iso = isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setValor(iso)
    setEditando(true)
  }

  async function salvar() {
    if (!valor || salvando) return
    setSalvando(true)
    try {
      await updateDoc(doc(db, 'pedidos', p.idVenda), {
        previsaoManual: new Date(valor + 'T00:00:00').toISOString(),
        previsaoManualPor: nome || '',
        previsaoManualEm: new Date().toISOString(),
      })
      setEditando(false)
    } catch (e) {
      console.error('Erro ao salvar data manual:', e)
      alert('Erro ao salvar a data: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function voltarAutomatico() {
    if (salvando) return
    setSalvando(true)
    try {
      await updateDoc(doc(db, 'pedidos', p.idVenda), {
        previsaoManual: deleteField(),
        previsaoManualPor: deleteField(),
        previsaoManualEm: deleteField(),
      })
      setEditando(false)
    } catch (e) {
      console.error('Erro ao voltar ao automático:', e)
      alert('Erro: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  if (editando) {
    return (
      <span className="chip no-print" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <input
          type="date" value={valor} onChange={(e) => setValor(e.target.value)}
          style={{ background: 'transparent', border: 'none', color: 'inherit', font: 'inherit' }}
        />
        <button className="mini-btn ok" title="Salvar data" disabled={salvando} onClick={salvar}>✓</button>
        {manual && (
          <button className="mini-btn" title="Voltar à data automática do calendário" disabled={salvando} onClick={voltarAutomatico}>↺</button>
        )}
        <button className="mini-btn" title="Cancelar" disabled={salvando} onClick={() => setEditando(false)}>✕</button>
      </span>
    )
  }

  const titulo = manual
    ? `Data definida manualmente${p.previsaoManualPor ? ` por ${p.previsaoManualPor}` : ''}${p.previsaoManualEm ? ` em ${fmtData(p.previsaoManualEm)}` : ''}`
    : 'Data automática (calendário do vendedor)'

  return (
    <span className={`chip ${atrasado ? 'atrasado' : ''}`} title={titulo}>
      {atrasado ? 'Atrasado · ' : ''}{manual ? '📌 ' : ''}{fmtData(p.previsao)}
      {podeEditar && (
        <button className="mini-btn no-print" title="Alterar data de entrega" onClick={abrir}>✎</button>
      )}
    </span>
  )
}
