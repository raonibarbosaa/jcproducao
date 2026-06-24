import { useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { SEED_VENDEDORES, normaliza, TIPOS_ITEM, UNIDADES_ITEM } from '../utils.js'
import SubTabs from '../components/SubTabs.jsx'

const REF = () => doc(db, 'config', 'cadastros')

// abas do hub e quais perfis veem cada uma
const ABAS_CADASTRO = [
  { id: 'clientes',   label: 'Clientes',   perfis: ['designer', 'dono'] },
  { id: 'itens',      label: 'Itens',      perfis: ['designer', 'dono'] },
  { id: 'motoristas', label: 'Motoristas', perfis: ['designer', 'dono'] },
  { id: 'vendedores', label: 'Vendedores', perfis: ['designer', 'dono'] },
]

export default function Cadastros() {
  const { perfil } = useAuth()
  const visiveis = ABAS_CADASTRO.filter((a) => a.perfis.includes(perfil) || perfil == null)
  const [aba, setAba] = useState(visiveis[0]?.id || 'clientes')

  return (
    <>
      <SubTabs abas={visiveis} ativa={aba} onTrocar={setAba} />
      {aba === 'clientes'   && <AbaClientes />}
      {aba === 'itens'      && <AbaItens />}
      {aba === 'motoristas' && <AbaMotoristas />}
      {aba === 'vendedores' && <AbaVendedores />}
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
// ABA MOTORISTAS — nome, telefone, placa, ativo/inativo
// ============================================================
function AbaMotoristas() {
  const { motoristas } = useCadastros()
  const [editando, setEditando] = useState(null) // índice em edição, ou 'novo'
  const [msg, setMsg] = useState('')

  async function salvarTudo(lista) {
    await setDoc(REF(), { motoristas: lista }, { merge: true })
  }

  async function salvarMotorista(dados, indice) {
    const lista = [...motoristas]
    if (indice === 'novo') lista.push(dados)
    else lista[indice] = dados
    await salvarTudo(lista)
    setEditando(null)
    setMsg('Motorista salvo.')
  }

  async function excluirMotorista(indice) {
    if (!confirm(`Excluir o motorista "${motoristas[indice].nome}"?`)) return
    const lista = motoristas.filter((_, i) => i !== indice)
    await salvarTudo(lista)
    setMsg('Motorista excluído.')
  }

  // ativo ausente (cadastro antigo) conta como ativo
  async function alternarAtivo(indice) {
    const lista = motoristas.map((m, i) =>
      i === indice ? { ...m, ativo: m.ativo === false } : m
    )
    await salvarTudo(lista)
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Cadastros
          <small>{motoristas.length} motorista(s)</small>
        </h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setEditando('novo')}>+ Novo motorista</button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 14px', maxWidth: 720 }}>
        Cadastre quem faz as entregas. Na aba <b>Rota</b>, ao marcar uma rota como entregue, você escolhe o
        motorista — e ele fica registrado no histórico de Entregues. Motorista <b>inativo</b> some da seleção,
        mas continua no histórico.
      </div>

      {msg && <div className="filter-pill" style={{ marginBottom: 14 }}>{msg}</div>}

      {editando !== null && (
        <FormMotorista
          inicial={editando === 'novo' ? null : motoristas[editando]}
          onSalvar={(dados) => salvarMotorista(dados, editando)}
          onCancelar={() => setEditando(null)}
        />
      )}

      {motoristas.length === 0 ? (
        <div className="empty">
          <div className="big">🚚</div>
          Nenhum motorista cadastrado.<br />
          Clique em <b>Novo motorista</b> para cadastrar o primeiro.
        </div>
      ) : (
        <div className="cards">
          {motoristas.map((m, i) => (
            <CardMotorista key={i} m={m}
              onEditar={() => setEditando(i)}
              onExcluir={() => excluirMotorista(i)}
              onAlternarAtivo={() => alternarAtivo(i)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CardMotorista({ m, onEditar, onExcluir, onAlternarAtivo }) {
  const inativo = m.ativo === false
  return (
    <div className="card em_dia" style={inativo ? { opacity: 0.55 } : null}>
      <div className="card-top">
        <div className="cliente">{m.nome}</div>
        {inativo
          ? <div className="idv" style={{ color: 'var(--warn)' }}>inativo</div>
          : <div className="idv" style={{ color: 'var(--ok)' }}>ativo</div>}
      </div>
      <div className="meta-row">
        {m.telefone
          ? <span className="chip">📞 {m.telefone}</span>
          : <span className="chip" style={{ color: 'var(--text-faint)' }}>sem telefone</span>}
      </div>
      <div className="modo-btns">
        <button className="modo-btn" onClick={onEditar}>Editar</button>
        <button className="modo-btn" onClick={onAlternarAtivo}>{inativo ? 'Reativar' : 'Desativar'}</button>
        <button className="modo-btn" onClick={onExcluir} style={{ color: 'var(--danger)' }}>Excluir</button>
      </div>
    </div>
  )
}

function FormMotorista({ inicial, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(inicial?.nome || '')
  const [telefone, setTelefone] = useState(inicial?.telefone || '')

  function salvar() {
    if (!nome.trim()) { alert('Informe o nome do motorista.'); return }
    onSalvar({
      nome: nome.trim(),
      telefone: telefone.trim(),
      ativo: inicial?.ativo === false ? false : true,
    })
  }

  return (
    <div className="card em_dia" style={{ marginBottom: 18, borderLeftColor: 'var(--accent)' }}>
      <h3 style={{ marginBottom: 12 }}>{inicial ? 'Editar motorista' : 'Novo motorista'}</h3>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="João da Silva" />
        </div>
        <div className="field" style={{ flex: '0 0 200px' }}>
          <label>Telefone</label>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(79) 99999-0000" />
        </div>
      </div>
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

// ============================================================
// ABA ITENS — produto -> tipo de material + unidade
// Tipo e unidade são INDEPENDENTES. Captura automática na importação;
// aqui você completa/ajusta. Filtro "sem unidade" ajuda a achar pendências.
// ============================================================
function AbaItens() {
  const { itens } = useCadastros()
  const [busca, setBusca] = useState('')
  const [soSemUnidade, setSoSemUnidade] = useState(false)
  const [editando, setEditando] = useState(null) // índice em edição, ou 'novo'
  const [msg, setMsg] = useState('')

  async function salvarTudo(lista) {
    await setDoc(REF(), { itens: lista }, { merge: true })
  }

  // altera tipo/unidade de um item direto no card (inline), salvando na hora
  async function setCampoItem(indice, campo, valor) {
    const lista = itens.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it))
    await salvarTudo(lista)
  }

  async function salvarItem(dados, indice) {
    const dup = itens.findIndex(
      (it, i) => i !== (indice === 'novo' ? -1 : indice) && normaliza(it.produto) === normaliza(dados.produto)
    )
    if (dup !== -1) {
      alert(`Já existe um item com esse nome: "${itens[dup].produto}".`)
      return
    }
    const lista = [...itens]
    if (indice === 'novo') lista.push(dados)
    else lista[indice] = dados
    await salvarTudo(lista)
    setEditando(null)
    setMsg('Item salvo.')
  }

  async function excluirItem(indice) {
    if (!confirm(`Excluir o item "${itens[indice].produto}"?`)) return
    const lista = itens.filter((_, i) => i !== indice)
    await salvarTudo(lista)
    setMsg('Item excluído.')
  }

  const semUnidade = itens.filter((it) => !it.unidade).length

  const filtrados = itens
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => !soSemUnidade || !it.unidade)
    .filter(({ it }) => !busca || normaliza(it.produto).includes(normaliza(busca)))

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Cadastros
          <small>{itens.length} item(ns)</small>
        </h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setEditando('novo')}>+ Novo item</button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 14px', maxWidth: 720 }}>
        Cada produto da planilha entra aqui automaticamente na importação. Defina o <b>tipo de material</b> e a
        <b> unidade</b> (são independentes). Feito uma vez, vale para todos os pedidos — inclusive os já importados.
        Itens <b>sem unidade</b> não entram nos relatórios de matéria-prima.
      </div>

      {msg && <div className="filter-pill" style={{ marginBottom: 14 }}>{msg}</div>}

      {editando !== null && (
        <FormItem
          inicial={editando === 'novo' ? null : itens[editando]}
          onSalvar={(dados) => salvarItem(dados, editando)}
          onCancelar={() => setEditando(null)}
        />
      )}

      {/* filtros */}
      {itens.length > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 360, flex: 1, minWidth: 200, marginBottom: 0 }}>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto…" />
          </div>
          <button className="btn" onClick={() => setSoSemUnidade((v) => !v)}
            style={soSemUnidade ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
            {soSemUnidade ? '✓ ' : ''}Só sem unidade{semUnidade > 0 ? ` (${semUnidade})` : ''}
          </button>
        </div>
      )}

      {itens.length === 0 ? (
        <div className="empty">
          <div className="big">📦</div>
          Nenhum item cadastrado ainda.<br />
          Os itens são capturados automaticamente quando você importa uma planilha — ou clique em <b>Novo item</b>.
        </div>
      ) : filtrados.length === 0 ? (
        <div className="empty">
          <div className="big">🔍</div>
          Nenhum item encontrado com esse filtro.
        </div>
      ) : (
        <div className="cards">
          {filtrados.map(({ it, i }) => (
            <CardItem key={i} it={it}
              onTipo={(v) => setCampoItem(i, 'tipo', v)}
              onUnidade={(v) => setCampoItem(i, 'unidade', v)}
              onEditar={() => setEditando(i)}
              onExcluir={() => excluirItem(i)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CardItem({ it, onTipo, onUnidade, onEditar, onExcluir }) {
  const semUnidade = !it.unidade
  return (
    <div className="card em_dia" style={semUnidade ? { borderLeftColor: 'var(--warn)' } : null}>
      <div className="card-top">
        <div className="cliente" style={{ fontSize: 14 }}>{it.produto}</div>
        {semUnidade && <div className="idv" style={{ color: 'var(--warn)' }}>sem unidade</div>}
      </div>

      {/* tipo de material (inline) */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Tipo de material</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TIPOS_ITEM.map((t) => (
            <button key={t.id} className="modo-btn"
              onClick={() => onTipo(it.tipo === t.id ? '' : t.id)}
              style={it.tipo === t.id ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
              {t.nome}
            </button>
          ))}
        </div>
      </div>

      {/* unidade (inline) */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Unidade</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {UNIDADES_ITEM.map((u) => (
            <button key={u.id} className="modo-btn"
              onClick={() => onUnidade(it.unidade === u.id ? '' : u.id)}
              style={it.unidade === u.id ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
              {u.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="modo-btns" style={{ marginTop: 10 }}>
        <button className="modo-btn" onClick={onEditar}>Renomear</button>
        <button className="modo-btn" onClick={onExcluir} style={{ color: 'var(--danger)' }}>Excluir</button>
      </div>
    </div>
  )
}

function FormItem({ inicial, onSalvar, onCancelar }) {
  const [produto, setProduto] = useState(inicial?.produto || '')
  const [tipo, setTipo] = useState(inicial?.tipo || '')
  const [unidade, setUnidade] = useState(inicial?.unidade || '')

  function salvar() {
    if (!produto.trim()) { alert('Informe o nome do produto.'); return }
    onSalvar({ produto: produto.trim(), tipo, unidade })
  }

  return (
    <div className="card em_dia" style={{ marginBottom: 18, borderLeftColor: 'var(--accent)' }}>
      <h3 style={{ marginBottom: 12 }}>{inicial ? 'Editar item' : 'Novo item'}</h3>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Nome do produto (como vem na planilha)</label>
        <input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="SACOLA PLÁSTICA BOCA PALHAÇO 40X50 REC" />
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 5, fontWeight: 600 }}>Tipo de material</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {TIPOS_ITEM.map((t) => (
              <button key={t.id} className="modo-btn"
                onClick={() => setTipo(tipo === t.id ? '' : t.id)}
                style={tipo === t.id ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
                {t.nome}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 5, fontWeight: 600 }}>Unidade</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {UNIDADES_ITEM.map((u) => (
              <button key={u.id} className="modo-btn"
                onClick={() => setUnidade(unidade === u.id ? '' : u.id)}
                style={unidade === u.id ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
                {u.nome}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn primary" onClick={salvar}>Salvar</button>
        <button className="btn" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
