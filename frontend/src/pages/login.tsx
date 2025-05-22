import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    console.log("Tentando logar com:", email, senha)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    })

    if (error) {
      console.error("Erro ao logar:", error.message)
      setErro('Email ou senha inválidos')
    } else {
      console.log("Login bem-sucedido!")
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm text-center">
        <img src="/src/assets/cevasa-logo.png" alt="Logo CEVASA" className="mx-auto mb-2 w-32 h-auto" />
        <h1 className="text-2xl font-bold text-green-700 mb-1">Acesso Restrito</h1>
        <p className="text-sm text-gray-600 mb-4">Entre com sua conta CEVASA para acessar os mapas</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          {erro && <p className="text-red-500 text-sm">{erro}</p>}
          <button
            type="submit"
            className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 transition"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
