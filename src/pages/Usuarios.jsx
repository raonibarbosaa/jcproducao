import { useEffect, useState } from 'react'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from 'firebase/auth'
import { collection, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore'
import { auth, db, firebaseConfig } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useCadastros } from '../contexts/CadastrosContext.jsx'
import {
  SETORES_PROD, normSetor, MATERIAIS, nomeDoMaterial,
  problemaDoPin, hashPin, docPin, loginInterno, ehLoginInterno,
} from '../utils.js'

const PERFIS = [
  { id: 'designer', nm: 'Designer', desc: 'Triagem, Produção, Cadastros e Usuários' },
  { id: 'financeiro', nm: 'Financeiro', desc: 'Rota e Entregues' },
  { id: 'vendedor', nm: 'Vendedor', desc: 'Vê só os próprios pedidos e dá ciência' },
  { id: 'operador', nm: 'Operador', desc: 'Chão de fábrica: move só os setores liberados (não vê valores)' },
  { id: 'expedicao', nm: 'Expedição', desc: 'Vê só o card de Expedição no quadro (não vê valores)' },
  { id: 'dono', nm: 'Dono (admin)', desc: 'Acesso total + gestão de usuários' },
]
const PERFIL_NM = Object.fromEntries(PERFIS.map((p) => [p.id, p.nm]))

// setores que um Operador pode ser liberado a movimentar — as colunas do quadro
// (uma por linha de produção) + Montagem, Expedição e Entrega. Vem do utils para
// não sair do lugar quando uma linha de produção for criada/renomeada.
const SETORES = SETORES_PROD
const SETOR_NM = Object.fromEntries(SETORES.map((s) => [s.id, s.nm]))

export default function Usuarios() {
  const { user } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState(null) // uid em edição
  const [msg, setMsg] = useState('')
  // pins/{uid} — só para saber quem já tem PIN do tablet (o hash não aparece)
  const [pins, setPins] = useState({})

  // lista em tempo real
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const lista = snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
      lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
      setUsuarios(lista)
    })
    return unsub
  }, [])
  useEffect(() => onSnapshot(collection(db, 'pins'),
    (snap) => setPins(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))),
    (e) => console.error('pins:', e)), [])

  function aviso(texto) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 6000)
  }

  // ---- criar usuário sem derrubar a sessão do admin ----
  // usa uma instância secundária do Firebase: o novo usuário "loga" nela,
  // a gente grava o perfil e desconecta — a sessão principal não é tocada.
  async function criarUsuario({ nome, email, senha, perfil, vendedorNome, setores, materiais, pin }) {
    const appSec = initializeApp(firebaseConfig, 'criacao-usuario')
    const authSec = getAuth(appSec)
    try {
      const cred = await createUserWithEmailAndPassword(authSec, email.trim(), senha)
      const uid = cred.user.uid
      const perfilDoc = {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        perfil,
        vendedorNome: perfil === 'vendedor' ? (vendedorNome || '') : '',
        setores: perfil === 'operador' ? (setores || []) : [],
        // 2º eixo da permissão: com que material ele trabalha ([] = todos)
        materiais: perfil === 'operador' ? (materiais || []) : [],
        ativo: true,
        criadoEm: new Date().toISOString(),
      }
      // perfil e PIN no MESMO batch: não pode existir PIN sem usuário
      const batch = writeBatch(db)
      batch.set(doc(db, 'usuarios', uid), perfilDoc)
      if (pin && perfil === 'operador') {
        batch.set(doc(db, 'pins', uid), {
          ...docPin(perfilDoc, await hashPin(uid, pin)),
          definidoEm: new Date().toISOString(), definidoPor: user?.uid || '',
        })
      }
      await batch.commit()
      await signOut(authSec)
      setNovo(false)
      aviso(`Usuário ${nome.trim()} criado com o perfil ${PERFIL_NM[perfil]}`
        + `${pin && perfil === 'operador' ? ' e PIN do tablet' : ''} — login: ${email.trim().toLowerCase()}`)
    } finally {
      await deleteApp(appSec).catch(() => {})
    }
  }

  // Nome, setor e perfil também vivem no `pins` (é o que a faixa do tablet
  // mostra), então editar o usuário regrava o PIN junto — senão o tablet
  // continuaria mostrando o nome antigo ou o setor que ele já não tem.
  async function salvarEdicao(u, { nome, perfil, vendedorNome, setores, materiais, pin }) {
    const mudou = {
      nome: nome.trim(), perfil,
      vendedorNome: perfil === 'vendedor' ? (vendedorNome || '') : '',
      setores: perfil === 'operador' ? (setores || []) : [],
      materiais: perfil === 'operador' ? (materiais || []) : [],
    }
    const batch = writeBatch(db)
    batch.update(doc(db, 'usuarios', u.uid), mudou)
    const novoPin = pin && perfil === 'operador'
    if (pins[u.uid] || novoPin) {
      const d = docPin({ ...u, ...mudou }, novoPin ? await hashPin(u.uid, pin) : '')
      if (novoPin) { d.definidoEm = new Date().toISOString(); d.definidoPor = user?.uid || '' }
      batch.set(doc(db, 'pins', u.uid), d, { merge: true })
    }
    await batch.commit()
    setEditando(null)
    aviso(novoPin ? 'Usuário atualizado com PIN novo.' : 'Usuário atualizado.')
  }

  // ⚠️ Desativar desliga o PIN no MESMO batch: quem saiu da empresa não pode
  // continuar dando baixa no tablet, que fica logado com outra conta.
  async function alternarAtivo(u) {
    if (u.uid === user.uid) { alert('Você não pode desativar o seu próprio acesso.'); return }
    const acao = u.ativo === false ? 'reativar' : 'desativar'
    const extra = pins[u.uid] && u.ativo !== false ? '\n\nO PIN do tablet também deixa de funcionar.' : ''
    if (!confirm(`Deseja ${acao} o acesso de "${u.nome || u.email}"?${extra}`)) return
    const ativo = u.ativo === false
    const batch = writeBatch(db)
    batch.update(doc(db, 'usuarios', u.uid), { ativo })
    if (pins[u.uid]) batch.update(doc(db, 'pins', u.uid), { ativo: docPin({ ...u, ativo }).ativo })
    await batch.commit()
    aviso(ativo ? 'Acesso reativado.' : 'Acesso desativado. O usuário não consegue mais entrar nem usar o PIN.')
  }

  async function removerPin(u) {
    if (!confirm(`Remover o PIN do tablet de "${u.nome || u.email}"? Ele deixa de aparecer no tablet.`)) return
    await deleteDoc(doc(db, 'pins', u.uid))
    aviso('PIN removido.')
  }

  async function resetarSenha(u) {
    if (ehLoginInterno(u.email)) {
      alert(`${u.email} é um login interno: não existe caixa de e-mail para receber a redefinição.\n\n`
        + 'No dia a dia ele usa o PIN — para esse, use Editar › Novo PIN. '
        + 'Se a senha for indispensável, desative este usuário e crie outro.')
      return
    }
    if (!confirm(`Enviar e-mail de redefinição de senha para ${u.email}?`)) return
    await sendPasswordResetEmail(auth, u.email)
    aviso(`E-mail de redefinição enviado para ${u.email}.`)
  }

  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Usuários
          <small>{usuarios.length} usuário(s)</small>
        </h1>
        <div className="spacer" />
        <button className="btn primary" onClick={() => { setNovo(true); setEditando(null) }}>
          + Novo usuário
        </button>
      </div>

      {msg && <div className="filter-pill" style={{ marginBottom: 14 }}>{msg}</div>}

      {novo && (
        <FormUsuario
          emails={usuarios.map((u) => u.email)}
          onSalvar={criarUsuario}
          onCancelar={() => setNovo(false)}
        />
      )}

      {usuarios.length === 0 ? (
        <div className="empty">
          <div className="big">🔐</div>
          Nenhum usuário cadastrado por aqui ainda.<br />
          Usuários criados direto no console do Firebase não aparecem nesta lista
          até terem um perfil salvo — crie os próximos por este painel.
        </div>
      ) : (
        <div className="cards">
          {usuarios.map((u) => (
            editando === u.uid ? (
              <FormEdicao key={u.uid} u={u} temPin={!!pins[u.uid]}
                onSalvar={(dados) => salvarEdicao(u, dados)}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <CardUsuario key={u.uid} u={u} euMesmo={u.uid === user.uid} pin={pins[u.uid]}
                onEditar={() => { setEditando(u.uid); setNovo(false) }}
                onAtivo={() => alternarAtivo(u)}
                onSenha={() => resetarSenha(u)}
                onRemoverPin={() => removerPin(u)}
              />
            )
          ))}
        </div>
      )}
    </>
  )
}

export function CardUsuario({ u, euMesmo, pin, onEditar, onAtivo, onSenha, onRemoverPin }) {
  const inativo = u.ativo === false
  const interno = ehLoginInterno(u.email)
  return (
    <div className="card em_dia" style={inativo ? { opacity: 0.55 } : undefined}>
      <div className="card-top">
        <div className="cliente">{u.nome || u.email} {euMesmo && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>(você)</span>}</div>
        <div className="idv">{PERFIL_NM[u.perfil] || u.perfil}</div>
      </div>
      <div className="meta-row">
        <span className="chip">✉️ {u.email}</span>
        {interno && <span className="chip" title="Sem caixa de e-mail: não recebe redefinição de senha">login interno</span>}
        {pin && (pin.ativo
          ? <span className="chip">🔢 PIN do tablet</span>
          : <span className="chip rota-warn" title="Usuário inativo ou fora do perfil Operador">🔢 PIN desligado</span>)}
        {u.perfil === 'vendedor' && u.vendedorNome && <span className="chip">👤 {u.vendedorNome}</span>}
        {u.perfil === 'operador' && (
          (u.setores || []).length
            ? (u.setores || []).map((s) => <span key={s} className="chip">🏭 {SETOR_NM[normSetor(s)] || s}</span>)
            : <span className="chip rota-warn">sem setor liberado</span>
        )}
        {u.perfil === 'operador' && (
          (u.materiais || []).length
            ? (u.materiais || []).map((m) => <span key={m} className="chip">📦 {nomeDoMaterial(m)}</span>)
            : <span className="chip">📦 todos os materiais</span>
        )}
        {u.perfil === 'expedicao' && <span className="chip">🏭 Expedição</span>}
        {inativo
          ? <span className="chip rota-warn">acesso desativado</span>
          : <span className="chip">ativo</span>}
      </div>
      <div className="modo-btns">
        <button className="modo-btn" onClick={onEditar}>Editar</button>
        <button className="modo-btn" onClick={onSenha}>Redefinir senha</button>
        {pin && <button className="modo-btn" onClick={onRemoverPin}>Remover PIN</button>}
        {!euMesmo && (
          <button className="modo-btn" onClick={onAtivo}
            style={{ color: inativo ? 'var(--ok, #4caf50)' : 'var(--danger)' }}>
            {inativo ? 'Reativar' : 'Desativar'}
          </button>
        )}
      </div>
    </div>
  )
}

function SetoresPicker({ setores, onToggle }) {
  return (
    <div className="field" style={{ marginTop: 10 }}>
      <label>Setores liberados (o operador só movimenta pedidos nesses setores)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {SETORES.map((s) => {
          const on = setores.map(normSetor).includes(s.id)
          return (
            <button key={s.id} type="button" className="modo-btn" onClick={() => onToggle(s.id)}
              style={on ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
              {s.nm}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// 2º eixo: quem monta papel não monta plástico. Vazio = todos os materiais.
function MateriaisPicker({ materiais, onToggle }) {
  return (
    <div className="field" style={{ marginTop: 10 }}>
      <label>
        Materiais liberados — <b>nenhum marcado = todos</b>. Divide a Montagem
        (papel × plástico × etiq./alça) e filtra o que ele vê nas linhas.
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {MATERIAIS.map((m) => {
          const on = (materiais || []).includes(m.id)
          return (
            <button key={m.id} type="button" className="modo-btn" onClick={() => onToggle(m.id)}
              style={on ? { background: 'var(--accent)', color: '#1a1205', borderColor: 'var(--accent)' } : null}>
              {m.nome}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// PIN do tablet: só números, 4 dígitos. Fica escondido (quem está do lado não
// lê), com um olho para quem digita conferir.
function PinCampo({ valor, onChange, rotulo, dica }) {
  const [ver, setVer] = useState(false)
  return (
    <div className="field" style={{ marginTop: 10, maxWidth: 320 }}>
      <label>{rotulo}</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={valor} type={ver ? 'text' : 'password'} inputMode="numeric"
          autoComplete="off" maxLength={4} placeholder="4 números"
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          style={{ letterSpacing: '0.4em', fontSize: 18, width: 120 }} />
        <button type="button" className="modo-btn" onClick={() => setVer((v) => !v)}>
          {ver ? 'ocultar' : 'mostrar'}
        </button>
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{dica}</span>
    </div>
  )
}

export function FormUsuario({ emails, onSalvar, onCancelar }) {
  const { vendedores } = useCadastros()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [perfil, setPerfil] = useState('designer')
  const [vendedorNome, setVendedorNome] = useState('')
  const [setores, setSetores] = useState([])
  const [materiais, setMateriais] = useState([])
  const [semEmail, setSemEmail] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  // normaliza antes de mexer: usuário antigo pode ter 'grafica' salvo no lugar de 'GRAFICA'
  const toggleSetor = (id) => setSetores((s) => {
    const atual = s.map(normSetor)
    return atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
  })
  const toggleMaterial = (id) => setMateriais((m) =>
    m.includes(id) ? m.filter((x) => x !== id) : [...m, id])

  // sem e-mail, o login sai do nome — e acompanha o que se digita
  const login = semEmail ? loginInterno(nome, emails) : email

  async function salvar() {
    setErro('')
    if (!nome.trim()) { setErro('Informe o nome.'); return }
    if (!login.trim()) { setErro(semEmail ? 'Informe o nome para gerar o login.' : 'Informe o e-mail.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== senha2) { setErro('As senhas não conferem.'); return }
    if (perfil === 'vendedor' && !vendedorNome) { setErro('Escolha qual vendedor este usuário representa.'); return }
    if (perfil === 'operador' && !setores.length) { setErro('Libere pelo menos um setor para o operador.'); return }
    if (perfil === 'operador' && pin && problemaDoPin(pin)) { setErro(problemaDoPin(pin)); return }
    setBusy(true)
    try {
      await onSalvar({ nome, email: login, senha, perfil, vendedorNome, setores, materiais, pin })
    } catch (e) {
      const map = {
        'auth/email-already-in-use': 'Já existe um usuário com este e-mail.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/weak-password': 'Senha fraca — use pelo menos 6 caracteres.',
      }
      setErro(map[e.code] || ('Erro ao criar usuário: ' + (e.code || e.message)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card em_dia" style={{ marginBottom: 18, borderLeftColor: 'var(--accent)' }}>
      <h3 style={{ marginBottom: 12 }}>Novo usuário</h3>

      {erro && <div className="login-err" style={{ marginBottom: 10 }}>{erro}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>E-mail (será o login)</label>
          {semEmail
            ? <input value={login} disabled placeholder="digite o nome" style={{ opacity: 0.75 }} />
            : <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@jcsacolas.com.br" />}
        </div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '-2px 0 10px' }}>
        <input type="checkbox" checked={semEmail} onChange={(e) => setSemEmail(e.target.checked)} />
        Não tem e-mail — gerar login interno
        {semEmail && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          (anote o login e a senha para entregar a ele: não há como recuperar a senha por e-mail)
        </span>}
      </label>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Senha (mín. 6 caracteres)</label>
          <input type="password" value={senha} autoComplete="new-password"
            onChange={(e) => setSenha(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 160 }}>
          <label>Confirmar senha</label>
          <input type="password" value={senha2} autoComplete="new-password"
            onChange={(e) => setSenha2(e.target.value)} />
        </div>
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>Perfil de acesso</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 4px' }}>
        {PERFIS.map((p) => (
          <button key={p.id} className="modo-btn"
            onClick={() => setPerfil(p.id)}
            style={{
              flex: '1 1 160px', textAlign: 'left', padding: '10px 12px',
              border: perfil === p.id ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: perfil === p.id ? 'var(--surface-2)' : 'transparent',
            }}>
            <b>{p.nm}</b>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{p.desc}</div>
          </button>
        ))}
      </div>

      {perfil === 'vendedor' && (
        <div className="field" style={{ marginTop: 10, maxWidth: 320 }}>
          <label>Qual vendedor este usuário representa?</label>
          <select value={vendedorNome} onChange={(e) => setVendedorNome(e.target.value)}
            style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)' }}>
            <option value="">— escolha o vendedor —</option>
            {vendedores.map((v, i) => <option key={i} value={v.nome}>{v.nome}</option>)}
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Ele verá apenas os pedidos deste vendedor.</span>
        </div>
      )}

      {perfil === 'operador' && <SetoresPicker setores={setores} onToggle={toggleSetor} />}
      {perfil === 'operador' && <MateriaisPicker materiais={materiais} onToggle={toggleMaterial} />}
      {perfil === 'operador' && (
        <PinCampo valor={pin} onChange={setPin} rotulo="PIN do tablet (opcional)"
          dica="Para dar baixa no tablet do setor. Ele pode trocar depois, entrando com o login dele." />
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn primary" onClick={salvar} disabled={busy}>
          {busy ? 'Criando…' : 'Criar usuário'}
        </button>
        <button className="btn" onClick={onCancelar} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

export function FormEdicao({ u, temPin, onSalvar, onCancelar }) {
  const { vendedores } = useCadastros()
  const [nome, setNome] = useState(u.nome || '')
  const [perfil, setPerfil] = useState(u.perfil || 'designer')
  const [vendedorNome, setVendedorNome] = useState(u.vendedorNome || '')
  const [setores, setSetores] = useState(u.setores || [])
  const [materiais, setMateriais] = useState(u.materiais || [])
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  // normaliza antes de mexer: usuário antigo pode ter 'grafica' salvo no lugar de 'GRAFICA'
  const toggleSetor = (id) => setSetores((s) => {
    const atual = s.map(normSetor)
    return atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]
  })
  const toggleMaterial = (id) => setMateriais((m) =>
    m.includes(id) ? m.filter((x) => x !== id) : [...m, id])

  async function salvar() {
    if (!nome.trim()) { alert('Informe o nome.'); return }
    if (perfil === 'vendedor' && !vendedorNome) { alert('Escolha qual vendedor este usuário representa.'); return }
    if (perfil === 'operador' && !setores.length) { alert('Libere pelo menos um setor para o operador.'); return }
    if (perfil === 'operador' && pin && problemaDoPin(pin)) { alert(problemaDoPin(pin)); return }
    if (temPin && perfil !== 'operador'
      && !confirm('Só Operador usa o tablet: o PIN deste usuário vai ficar desligado. Continuar?')) return
    setBusy(true)
    try {
      await onSalvar({ nome, perfil, vendedorNome, setores, materiais, pin })
    } catch (e) {
      alert('Não foi possível salvar: ' + (e.code || e.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card em_dia" style={{ borderLeftColor: 'var(--accent)' }}>
      <h3 style={{ marginBottom: 12 }}>Editar usuário</h3>
      <div className="field">
        <label>Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="field">
        <label>E-mail</label>
        <input value={u.email} disabled style={{ opacity: 0.6 }} />
      </div>
      <div className="field">
        <label>Perfil</label>
        <select value={perfil} onChange={(e) => setPerfil(e.target.value)}
          style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)' }}>
          {PERFIS.map((p) => <option key={p.id} value={p.id}>{p.nm}</option>)}
        </select>
      </div>
      {perfil === 'vendedor' && (
        <div className="field">
          <label>Vendedor representado</label>
          <select value={vendedorNome} onChange={(e) => setVendedorNome(e.target.value)}
            style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)' }}>
            <option value="">— escolha o vendedor —</option>
            {vendedores.map((v, i) => <option key={i} value={v.nome}>{v.nome}</option>)}
          </select>
        </div>
      )}
      {perfil === 'operador' && <SetoresPicker setores={setores} onToggle={toggleSetor} />}
      {perfil === 'operador' && <MateriaisPicker materiais={materiais} onToggle={toggleMaterial} />}
      {perfil === 'operador' && (
        <PinCampo valor={pin} onChange={setPin}
          rotulo={temPin ? 'Novo PIN do tablet (em branco = manter o atual)' : 'PIN do tablet (opcional)'}
          dica={temPin
            ? 'Use para redefinir quando ele esquecer. O PIN atual não é mostrado.'
            : 'Para dar baixa no tablet do setor.'} />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn primary" onClick={salvar} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button className="btn" onClick={onCancelar} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}
