import { useEffect, useState } from 'react'
import { initializeApp, deleteApp } from 'firebase/app'
import {
  getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from 'firebase/auth'
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db, firebaseConfig } from '../firebase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const PERFIS = [
  { id: 'designer', nm: 'Designer', desc: 'Triagem, Produção e Cadastros' },
  { id: 'financeiro', nm: 'Financeiro', desc: 'Rota e Entregues' },
  { id: 'dono', nm: 'Dono (admin)', desc: 'Acesso total + gestão de usuários' },
]
const PERFIL_NM = Object.fromEntries(PERFIS.map((p) => [p.id, p.nm]))

export default function Usuarios() {
  const { user } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState(null) // uid em edição
  const [msg, setMsg] = useState('')

  // lista em tempo real
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snap) => {
      const lista = snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
      lista.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
      setUsuarios(lista)
    })
    return unsub
  }, [])

  function aviso(texto) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 6000)
  }

  // ---- criar usuário sem derrubar a sessão do admin ----
  // usa uma instância secundária do Firebase: o novo usuário "loga" nela,
  // a gente grava o perfil e desconecta — a sessão principal não é tocada.
  async function criarUsuario({ nome, email, senha, perfil }) {
    const appSec = initializeApp(firebaseConfig, 'criacao-usuario')
    const authSec = getAuth(appSec)
    try {
      const cred = await createUserWithEmailAndPassword(authSec, email.trim(), senha)
      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        perfil,
        ativo: true,
        criadoEm: new Date().toISOString(),
      })
      await signOut(authSec)
      setNovo(false)
      aviso(`Usuário ${nome.trim()} criado com o perfil ${PERFIL_NM[perfil]}.`)
    } finally {
      await deleteApp(appSec).catch(() => {})
    }
  }

  async function salvarEdicao(uid, { nome, perfil }) {
    await updateDoc(doc(db, 'usuarios', uid), { nome: nome.trim(), perfil })
    setEditando(null)
    aviso('Usuário atualizado.')
  }

  async function alternarAtivo(u) {
    if (u.uid === user.uid) { alert('Você não pode desativar o seu próprio acesso.'); return }
    const acao = u.ativo === false ? 'reativar' : 'desativar'
    if (!confirm(`Deseja ${acao} o acesso de "${u.nome || u.email}"?`)) return
    await updateDoc(doc(db, 'usuarios', u.uid), { ativo: u.ativo === false })
    aviso(u.ativo === false ? 'Acesso reativado.' : 'Acesso desativado. O usuário não consegue mais entrar.')
  }

  async function resetarSenha(u) {
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
              <FormEdicao key={u.uid} u={u}
                onSalvar={(dados) => salvarEdicao(u.uid, dados)}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <CardUsuario key={u.uid} u={u} euMesmo={u.uid === user.uid}
                onEditar={() => { setEditando(u.uid); setNovo(false) }}
                onAtivo={() => alternarAtivo(u)}
                onSenha={() => resetarSenha(u)}
              />
            )
          ))}
        </div>
      )}
    </>
  )
}

function CardUsuario({ u, euMesmo, onEditar, onAtivo, onSenha }) {
  const inativo = u.ativo === false
  return (
    <div className="card em_dia" style={inativo ? { opacity: 0.55 } : undefined}>
      <div className="card-top">
        <div className="cliente">{u.nome || u.email} {euMesmo && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>(você)</span>}</div>
        <div className="idv">{PERFIL_NM[u.perfil] || u.perfil}</div>
      </div>
      <div className="meta-row">
        <span className="chip">✉️ {u.email}</span>
        {inativo
          ? <span className="chip rota-warn">acesso desativado</span>
          : <span className="chip">ativo</span>}
      </div>
      <div className="modo-btns">
        <button className="modo-btn" onClick={onEditar}>Editar</button>
        <button className="modo-btn" onClick={onSenha}>Redefinir senha</button>
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

function FormUsuario({ onSalvar, onCancelar }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [perfil, setPerfil] = useState('designer')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    setErro('')
    if (!nome.trim()) { setErro('Informe o nome.'); return }
    if (!email.trim()) { setErro('Informe o e-mail.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== senha2) { setErro('As senhas não conferem.'); return }
    setBusy(true)
    try {
      await onSalvar({ nome, email, senha, perfil })
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
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@jcsacolas.com.br" />
        </div>
      </div>

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

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn primary" onClick={salvar} disabled={busy}>
          {busy ? 'Criando…' : 'Criar usuário'}
        </button>
        <button className="btn" onClick={onCancelar} disabled={busy}>Cancelar</button>
      </div>
    </div>
  )
}

function FormEdicao({ u, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(u.nome || '')
  const [perfil, setPerfil] = useState(u.perfil || 'designer')

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
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn primary" onClick={() => {
          if (!nome.trim()) { alert('Informe o nome.'); return }
          onSalvar({ nome, perfil })
        }}>Salvar</button>
        <button className="btn" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
