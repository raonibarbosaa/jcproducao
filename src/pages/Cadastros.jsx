import { useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { SEED_VENDEDORES, normaliza } from '../utils.js'

const REF = () => doc(db, 'config', 'cadastros')

export default function Cadastros() {
  const [aba, setAba] = useState('vendedores')
  return (
    <>
      <div className="modo-btns" style={{ marginBottom: 16 }}>
        <button className="modo-btn" onClick={() => setAba('vendedores')}
          style={aba === 'vendedores' ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : null}>Vendedores</button>
        <button className="modo-btn" onClick={() => setAba('clientes')}
          style={aba === 'clientes' ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : null}>Clientes</button>
      </div>
      {aba === 'vendedores' ? <AbaVendedores /> : <AbaClientes />}
    </>
  )
}

// ============================================================
// ABA VENDEDORES
// ============================================================
function AbaVendedores() {
  const { vendedores } = useCadastros()
  const [editando, setEditando] = useState(null) // índice do vendedor em edição, ou 'novo'
  const [msg, setMsg] = useState('')

  async function salvarTudo(lista) {
    await setDoc(REF(), { vendedores: lista }, { merge: true })
  }

  async function importarSeed() {
    if (vendedores.length && !confirm('Isso vai SUBSTITUIR os cadastros atuais pelos dados originais do sistema. Continuar?')) return
    await salvarTudo(SEED_VENDEDORES)
    setMsg('Dados atuais importados! Agora é só ajustar o que precisar.')
  }

  async function salvarVendedor(dados, indice) {
    const lista = [...vendedores]
    if (indice === 'novo') lista.push(dados)
    else lista[indice] = dados
    await salvarTudo(lista)
    setEditando(null)
    setMsg('Vendedor salvo.')
  }

  async function excluirVendedor(indice) {
    if (!confirm(`Excluir o vendedor "${vendedores[indice].nome}"?`)) return
    const lista = vendedores.filter((_, i) => i !== indice)
    await salvarTudo(lista)
    setMsg('Vendedor excluído.')
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Cadastros
          <small>{vendedores.length} vendedor(es)</small>
        </h1>
        <div className="spacer" />
        <button className="btn" onClick={importarSeed}>↻ Importar dados atuais</button>
        <button className="btn primary" onClick={() => setEditando('novo')}>+ Novo vendedor</button>
      </div>

      {msg && <div className="filter-pill" style={{ marginBottom: 14 }}>{msg}</div>}

      {editando !== null && (
        <FormVendedor
          inicial={editando === 'novo' ? null : vendedores[editando]}
          onSalvar={(dados) => salvarVendedor(dados, editando)}
          onCancelar={() => setEditando(null)}
        />
      )}

      {vendedores.length === 0 ? (
        <div className="empty">
          <div className="big">👥</div>
          Nenhum vendedor cadastrado.<br />
          Clique em <b>Importar dados atuais</b> para começar com os vendedores e rotas já existentes.
        </div>
      ) : (
        <div className="cards">
          {vendedores.map((v, i) => (
            <CardVendedor key={i} v={v}
              onEditar={() => setEditando(i)}
              onExcluir={() => excluirVendedor(i)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CardVendedor({ v, onEditar, onExcluir }) {
  const totalCidades = (v.rotas || []).reduce((s, r) => s + (r.cidades?.length || 0), 0)
  return (
    <div className="card em_dia">
      <div className="card-top">
        <div className="cliente">{v.nome}</div>
        {v.codigo ? <div className="idv">{v.codigo}</div> : <div className="idv" style={{ color: 'var(--warn)' }}>sem código</div>}
      </div>
      <div className="meta-row">
        {v.dias?.length
          ? <span className="chip">📅 dias {v.dias.join(' e ')}</span>
          : <span className="chip rota-warn">sem dias de entrega</span>}
        <span className="chip">{(v.rotas || []).length} rota(s)</span>
        <span className="chip">{totalCidades} cidade(s)</span>
      </div>
      {(v.rotas || []).map((r, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
          <b>{r.nome}:</b> {(r.cidades || []).length ? r.cidades.join(', ') : '—'}
        </div>
      ))}
      <div className="modo-btns">
        <button className="modo-btn" onClick={onEditar}>Editar</button>
        <button className="modo-btn" onClick={onExcluir} style={{ color: 'var(--danger)' }}>Excluir</button>
      </div>
    </div>
  )
}

function FormVendedor({ inicial, onSalvar, onCancelar }) {
  const [codigo, setCodigo] = useState(inicial?.codigo || '')
  const [nome, setNome] = useState(inicial?.nome || '')
  const [dia1, setDia1] = useState(inicial?.dias?.[0] || '')
  const [dia2, setDia2] = useState(inicial?.dias?.[1] || '')
  const [rotas, setRotas] = useState(
    inicial?.rotas?.length
      ? inicial.rotas.map((r) => ({ nome: r.nome, cidades: (r.cidades || []).join(', ') }))
      : [{ nome: 'ROTA 01', cidades: '' }]
  )

  function addRota() {
    const n = String(rotas.length + 1).padStart(2, '0')
    setRotas([...rotas, { nome: `ROTA ${n}`, cidades: '' }])
  }
  function rmRota(i) { setRotas(rotas.filter((_, idx) => idx !== i)) }
  function setRota(i, campo, val) {
    const novo = [...rotas]; novo[i] = { ...novo[i], [campo]: val }; setRotas(novo)
  }

  function salvar() {
    if (!nome.trim()) { alert('Informe o nome do vendedor.'); return }
    const dias = [dia1, dia2].map((d) => parseInt(d)).filter((d) => d >= 1 && d <= 31)
    const rotasLimpas = rotas
      .map((r) => ({
        nome: r.nome.trim().toUpperCase(),
        cidades: r.cidades.split(',').map((c) => normaliza(c)).filter(Boolean),
      }))
      .filter((r) => r.nome)
    onSalvar({
      codigo: codigo.trim().toLowerCase(),
      nome: nome.trim(),
      dias,
      rotas: rotasLimpas,
    })
  }

  return (
    <div className="card em_dia" style={{ marginBottom: 18, borderLeftColor: 'var(--accent)' }}>
      <h3 style={{ marginBottom: 12 }}>{inicial ? 'Editar vendedor' : 'Novo vendedor'}</h3>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '0 0 110px' }}>
          <label>Código (planilha)</label>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="v1" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Sérgio" />
        </div>
        <div className="field" style={{ flex: '0 0 90px' }}>
          <label>Dia 1</label>
          <input type="number" min="1" max="31" value={dia1} onChange={(e) => setDia1(e.target.value)} placeholder="01" />
        </div>
        <div className="field" style={{ flex: '0 0 90px' }}>
          <label>Dia 2</label>
          <input type="number" min="1" max="31" value={dia2} onChange={(e) => setDia2(e.target.value)} placeholder="15" />
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0 12px' }}>
        Dias de entrega no mês (o pedido feito num mês é entregue no mês seguinte nessas datas).
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>Rotas e cidades</label>
      {rotas.map((r, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <input value={r.nome} onChange={(e) => setRota(i, 'nome', e.target.value)}
              style={{ width: 120, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 9px', color: 'var(--text)', fontWeight: 600 }} />
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>cidades separadas por vírgula</span>
            <button className="modo-btn" style={{ flex: 'none', padding: '4px 10px', color: 'var(--danger)' }} onClick={() => rmRota(i)}>remover</button>
          </div>
          <textarea value={r.cidades} onChange={(e) => setRota(i, 'cidades', e.target.value)}
            placeholder="ITABAIANA, OURO BRANCO, RIBEIROPOLIS"
            style={{ width: '100%', minHeight: 54, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, resize: 'vertical' }} />
        </div>
      ))}
      <button className="btn" style={{ marginTop: 8 }} onClick={addRota}>+ Adicionar rota</button>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn primary" onClick={salvar}>Salvar</button>
        <button className="btn" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

// ============================================================
// ABA CLIENTES — de/para de nome (razão social -> nome de exibição)
// ============================================================
function AbaClientes() {
  const { clientes } = useCadastros()
  const [editando, setEditando] = useState(null) // índice em edição, ou 'novo'
  const [msg, setMsg] = useState('')
  const [busca, setBusca] = useState('')

  async function salvarTudo(lista) {
    await setDoc(REF(), { clientes: lista }, { merge: true })
  }

  async function salvarCliente(dados, indice) {
    const dup = clientes.findIndex(
      (c, i) => i !== (indice === 'novo' ? -1 : indice) && normaliza(c.razao) === normaliza(dados.razao)
    )
    if (dup !== -1) {
      if (!confirm(`Já existe um cliente com a razão social "${clientes[dup].razao}" (exibido como "${clientes[dup].nome}"). Substituir?`)) return
      const lista = clientes.map((c, i) => (i === dup ? dados : c)).filter((_, i) => indice !== 'novo' ? i !== indice : true)
      await salvarTudo(lista)
    } else {
      const lista = [...clientes]
      if (indice === 'novo') lista.push(dados)
      else lista[indice] = dados
      await salvarTudo(lista)
    }
    setEditando(null)
    setMsg('Cliente salvo.')
  }

  async function excluirCliente(indice) {
    if (!confirm(`Excluir o cliente "${clientes[indice].nome}"?`)) return
    const lista = clientes.filter((_, i) => i !== indice)
    await salvarTudo(lista)
    setMsg('Cliente excluído.')
  }

  const filtrados = clientes
    .map((c, i) => ({ c, i }))
    .filter(({ c }) =>
      !busca ||
      normaliza(c.razao).includes(normaliza(busca)) ||
      normaliza(c.nome).includes(normaliza(busca))
    )

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Cadastros
          <small>{clientes.length} cliente(s)</small>
        </h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setEditando('novo')}>+ Novo cliente</button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 14px', maxWidth: 720 }}>
        A planilha traz o cliente pela <b>razão social</b>. Aqui você define como ele deve <b>aparecer</b> nos
        cards (o apelido que vocês usam). Feito uma vez, vale para todos os pedidos desse cliente — inclusive
        os já importados. Quem não tiver apelido cadastrado continua aparecendo com o nome da planilha.
      </div>

      {msg && <div className="filter-pill" style={{ marginBottom: 14 }}>{msg}</div>}

      {editando !== null && (
        <FormCliente
          inicial={editando === 'novo' ? null : clientes[editando]}
          onSalvar={(dados) => salvarCliente(dados, editando)}
          onCancelar={() => setEditando(null)}
        />
      )}

      {clientes.length > 0 && (
        <div className="field" style={{ maxWidth: 360, marginBottom: 14 }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por razão social ou apelido…" />
        </div>
      )}

      {clientes.length === 0 ? (
        <div className="empty">
          <div className="big">🏷️</div>
          Nenhum cliente cadastrado.<br />
          Clique em <b>Novo cliente</b> para criar o primeiro apelido.
        </div>
      ) : (
        <div className="cards">
          {filtrados.map(({ c, i }) => (
            <CardCliente key={i} c={c}
              onEditar={() => setEditando(i)}
              onExcluir={() => excluirCliente(i)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CardCliente({ c, onEditar, onExcluir }) {
  return (
    <div className="card em_dia">
      <div className="card-top">
        <div className="cliente">{c.nome}</div>
        <div className="idv">apelido</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
        <b>Razão social:</b> {c.razao}
      </div>
      <div className="modo-btns">
        <button className="modo-btn" onClick={onEditar}>Editar</button>
        <button className="modo-btn" onClick={onExcluir} style={{ color: 'var(--danger)' }}>Excluir</button>
      </div>
    </div>
  )
}

function FormCliente({ inicial, onSalvar, onCancelar }) {
  const [razao, setRazao] = useState(inicial?.razao || '')
  const [nome, setNome] = useState(inicial?.nome || '')

  function salvar() {
    if (!razao.trim()) { alert('Informe a razão social (como vem na planilha).'); return }
    if (!nome.trim()) { alert('Informe o nome de exibição (apelido).'); return }
    onSalvar({ razao: razao.trim(), nome: nome.trim() })
  }

  return (
    <div className="card em_dia" style={{ marginBottom: 18, borderLeftColor: 'var(--accent)' }}>
      <h3 style={{ marginBottom: 12 }}>{inicial ? 'Editar cliente' : 'Novo cliente'}</h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Razão social (como vem na planilha)</label>
          <input value={razao} onChange={(e) => setRazao(e.target.value)} placeholder="EXEMPLO LIMITADA" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Nome de exibição (apelido)</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Loja Exemplo" />
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0 12px' }}>
        Não precisa digitar igualzinho à planilha em maiúscula/minúscula ou acento — o sistema ignora essas diferenças ao cruzar.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button className="btn primary" onClick={salvar}>Salvar</button>
        <button className="btn" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
