import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setErro(''); setBusy(true)
    try {
      await login(email, senha)
    } catch (e) {
      const map = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/invalid-email': 'E-mail inválido.',
        'auth/user-not-found': 'Usuário não encontrado.',
        'auth/wrong-password': 'Senha incorreta.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco.',
        'auth/api-key-not-valid': 'API key inválida — confira src/firebase.js.',
        'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'API key inválida — confira src/firebase.js.',
      }
      setErro(map[e.code] || ('Erro: ' + e.code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand"><span className="dot" /> JC Sacolas</div>
        <p className="sub">Controle de Produção</p>

        {erro && <div className="login-err">{erro}</div>}

        <div className="field">
          <label>E-mail</label>
          <input
            type="email" value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <div className="field">
          <label>Senha</label>
          <input
            type="password" value={senha} autoComplete="current-password"
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>

        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
          onClick={submit} disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
    </div>
  )
}
