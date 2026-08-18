import { useState } from 'react'
import { doc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase.js'
import {
  nomeCampoErro, ehErroEntrega, nomeCliente, fmtData, fmtDataHora, fmtQtd, arredondaQtd,
  keyDoItem, filtraPedidos, vendedoresDe, previsaoDe,
} from '../utils.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import FiltrosBar from '../components/FiltrosBar.jsx'

// SOLUÇÃO DE ERROS — o vendedor lançou errado no Posseidon, o papel que chegou na
// fábrica tem a informação certa, e quem produz reportou a diferença.
//
// "Já foi entregue" vem do outro lado: é o VENDEDOR avisando que a mercadoria já
// está com o cliente e o pedido continua na produção. Não tem correção
// automática de propósito — dar a entrega abre a cobrança, então ela é feita à
// mão na aba Rota (ou Entregas) por quem confere o que saiu, e aqui só se fecha
// o aviso depois.
//
// Corrigir a QUANTIDADE grava em `pedidos/{id}.correcoes`, que o import não
// conhece: o Posseidon pode reimportar o valor errado quantas vezes quiser que a
// correção continua valendo. Os outros tipos de erro (produto, cliente) não têm
// correção estruturada — quem resolve descreve o que fez e fecha, e o conserto de
// verdade é o vendedor arrumar no Posseidon.
export default function Erros({ pedidos, problemas }) {
  const { clientes, vendedores: cadastros } = useCadastros()
  const { nome } = useAuth()
  const [filtros, setFiltros] = useState({})
  const [soAbertos, setSoAbertos] = useState(true)
  const [salvando, setSalvando] = useState('')
  const [correcao, setCorrecao] = useState({})   // { problemaId: valor digitado }
  const [nota, setNota] = useState({})

  const base = (pedidos || []).map((p) => ({ ...p, previsao: previsaoDe(p, cadastros) }))
  const porId = new Map(base.map((p) => [String(p.idVenda), p]))
  const vendedoresFiltro = vendedoresDe(base)
  const idsFiltrados = new Set(filtraPedidos(base, filtros, clientes).map((p) => p.idVenda))
  const temFiltro = Object.values(filtros).some(Boolean)

  const lista = (problemas || [])
    .filter((x) => !soAbertos || x.status === 'aberto')
    .filter((x) => !temFiltro || idsFiltrados.has(x.idVenda))
    .sort((a, b) => (b.quando || '').localeCompare(a.quando || ''))
  const abertos = (problemas || []).filter((x) => x.status === 'aberto').length

  // aplica a quantidade certa no pedido e fecha o report
  async function corrigirQtd(x) {
    const p = porId.get(String(x.idVenda))
    if (!p) { alert('Este pedido não está mais na produção.'); return }
    const q = arredondaQtd(String(correcao[x.id] ?? '').replace(',', '.'))
    if (!(q > 0)) { alert('Informe a quantidade correta.'); return }
    const idx = (p.itens || []).findIndex((it, i) => (it.key || keyDoItem(p, i)) === x.itemKey)
    if (idx < 0) { alert('Não achei este item no pedido. Ele pode ter mudado de nome na planilha.'); return }
    if (!confirm(
      `Corrigir "${x.produto}" do pedido #${x.idVenda} para ${fmtQtd(q)}?\n\n` +
      `A correção passa a valer mesmo se o Posseidon reimportar o valor antigo.`)) return
    setSalvando(x.id)
    try {
      const agora = new Date().toISOString()
      await updateDoc(doc(db, 'pedidos', String(x.idVenda)), {
        [`correcoes.${x.itemKey}`]: { qtd: q, por: nome || '', em: agora },
      })
      await updateDoc(doc(db, 'problemas', x.id), {
        status: 'resolvido', resolucao: `Quantidade corrigida para ${fmtQtd(q)}`,
        resolvidoPor: nome || '', resolvidoEm: agora,
      })
    } catch (e) {
      alert('Não foi possível corrigir: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  // fecha sem mexer na quantidade (avisou o vendedor, foi resolvido no Posseidon…)
  async function fechar(x) {
    const txt = String(nota[x.id] || '').trim()
    if (!txt) { alert('Escreva o que foi feito antes de fechar.'); return }
    setSalvando(x.id)
    try {
      await updateDoc(doc(db, 'problemas', x.id), {
        status: 'resolvido', resolucao: txt,
        resolvidoPor: nome || '', resolvidoEm: new Date().toISOString(),
      })
    } catch (e) {
      alert('Não foi possível fechar: ' + (e.code || e.message))
    } finally { setSalvando('') }
  }

  async function reabrir(x) {
    if (!confirm('Reabrir este erro?')) return
    await updateDoc(doc(db, 'problemas', x.id), {
      status: 'aberto', resolucao: deleteField(),
      resolvidoPor: deleteField(), resolvidoEm: deleteField(),
    })
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Erros
          <small>{abertos ? `${abertos} em aberto` : 'nenhum erro em aberto'}</small>
        </h1>
        <div className="spacer" />
        <button className={`btn${soAbertos ? ' primary' : ''}`} onClick={() => setSoAbertos((v) => !v)}>
          {soAbertos ? '☑' : '☐'} Só em aberto
        </button>
      </div>

      <FiltrosBar filtros={filtros} setFiltros={setFiltros}
        vendedores={vendedoresFiltro} pedidos={base} />

      {lista.length === 0 ? (
        <div className="empty"><div className="big">✅</div>
          {soAbertos ? 'Nenhum erro em aberto.' : 'Nenhum erro reportado.'}
        </div>
      ) : lista.map((x) => {
        const p = porId.get(String(x.idVenda))
        const aberto = x.status === 'aberto'
        return (
          <div key={x.id} className={`card ${aberto ? 'atrasado' : 'em_dia'}`} style={{ marginBottom: 12 }}>
            <div className="card-top">
              <div className="cliente">{nomeCliente(x.cliente, clientes)}</div>
              <div className="idv">#{x.idVenda}</div>
            </div>
            <div className="meta-row">
              <span className="chip">{nomeCampoErro(x.campo)}</span>
              {x.vendedor && <span className="chip">👤 {x.vendedor}</span>}
              {x.rota && <span className="chip">📍 {x.rota}</span>}
              {p ? <span className="chip">{fmtData(p.previsao)}</span>
                 : <span className="chip rota-warn">fora da produção</span>}
            </div>

            {x.produto && <div style={{ fontWeight: 700, marginTop: 8 }}>{x.produto}</div>}

            {ehErroEntrega(x.campo) ? (
              <div className="erro-comp">
                <div><span>No sistema</span><b>em produção</b></div>
                <div className="certo"><span>Entregue em</span>
                  <b>{x.entregueEm ? fmtData(`${x.entregueEm}T00:00:00`) : '—'}</b></div>
                {x.entreguePor && (
                  <div><span>Quem entregou</span><b style={{ fontSize: 13 }}>{x.entreguePor}</b></div>
                )}
              </div>
            ) : (
              <div className="erro-comp">
                <div><span>No sistema</span><b>{x.noSistema || '—'}</b></div>
                <div className="certo"><span>No papel</span><b>{x.noPapel || '—'}</b></div>
              </div>
            )}
            {x.obs && <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>{x.obs}</div>}

            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
              reportado por {x.porNome || x.porEmail || '—'} ({x.perfil}) · {fmtDataHora(x.quando)}
            </div>

            {aberto ? (
              <div className="erro-acoes no-print">
                {ehErroEntrega(x.campo) && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    Confira e dê a entrega na aba <b>Rota</b> — a baixa não sai daqui,
                    porque é ela que abre a cobrança. Depois feche este aviso abaixo.
                  </div>
                )}
                {x.campo === 'quantidade' && x.itemKey && p && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input className="filtro-input" style={{ width: 130 }} inputMode="decimal"
                      placeholder="quantidade certa"
                      value={correcao[x.id] ?? ''}
                      onChange={(e) => setCorrecao((s) => ({ ...s, [x.id]: e.target.value }))} />
                    <button className="btn ok" disabled={!!salvando} onClick={() => corrigirQtd(x)}>
                      {salvando === x.id ? 'Salvando…' : '✓ Corrigir e fechar'}
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input className="filtro-input" style={{ flex: 1, minWidth: 200 }}
                    placeholder="o que foi feito (avisei o vendedor, corrigido no Posseidon…)"
                    value={nota[x.id] ?? ''}
                    onChange={(e) => setNota((s) => ({ ...s, [x.id]: e.target.value }))} />
                  <button className="btn" disabled={!!salvando} onClick={() => fechar(x)}>
                    Fechar sem corrigir
                  </button>
                </div>
              </div>
            ) : (
              <div className="erro-resolvido">
                ✓ {x.resolucao} — {x.resolvidoPor || '—'} · {fmtDataHora(x.resolvidoEm)}
                <button className="mini-btn" style={{ marginLeft: 8 }} onClick={() => reabrir(x)}>reabrir</button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
