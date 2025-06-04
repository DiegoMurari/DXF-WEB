// src/pages/AdminUsers.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

type Profile = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

type Documento = {
  id: number;
  nome_arquivo: string;
  url_miniatura: string; // caminho relativo no bucket
};

type UserDocumentAccess = {
  id: number;
  user_id: string;
  documento_id: number;
};

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Campos do formulário de usuário ───
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'usuario'>('usuario');
  const [formPassword, setFormPassword] = useState('');            
  const [formPasswordConfirm, setFormPasswordConfirm] = useState(''); 
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Campos do modal de mapas ───
  const [docList, setDocList] = useState<Documento[]>([]);
  const [accessList, setAccessList] = useState<UserDocumentAccess[]>([]);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [selectedUserForAccess, setSelectedUserForAccess] = useState<Profile | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [isAccessLoading, setIsAccessLoading] = useState(false);

  // ─── Carrega perfis e documentos quando o componente monta ───
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);

      // 1) Verifica se está logado e é admin
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        navigate('/login');
        return;
      }

      const { data: perfil, error: perfilError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (perfilError || !perfil || perfil.role !== 'admin') {
        setError('Acesso negado. Você não é administrador.');
        setLoading(false);
        return;
      }

      // 2) Carrega a lista de perfis
      const { data: allProfiles, error: allError } = await supabase
        .from('profiles')
        .select('id, email, role, created_at')
        .order('created_at', { ascending: false });
      if (allError) {
        setError(allError.message);
      } else if (allProfiles) {
        setUsers(allProfiles);
      }

      // 3) Carrega a lista de documentos (incluindo thumbnail_path)
      const { data: docs, error: docsError } = await supabase
        .from('documentos')
        .select('id, nome_arquivo, url_miniatura')
        .order('nome_arquivo', { ascending: true });
      if (docsError) {
        console.error('Erro ao buscar documentos:', docsError.message);
      } else if (docs) {
        setDocList(docs);
      }

      setLoading(false);
    }

    fetchAll();
  }, [navigate]);

  async function handleDeleteUser(userId: string) {
  if (!window.confirm("Tem certeza que deseja excluir este usuário?")) return;

  try {
    const resp = await fetch("/api/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId }),
    });

    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(msg);
    }

    // Recarrega lista de usuários
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: false });
    setUsers(allProfiles || []);
  } catch (err: any) {
    alert("Erro ao excluir usuário: " + err.message);
  }
}

  // ─── Limpa form de criar/editar usuário ───
  function resetForm() {
    setFormEmail('');
    setFormRole('usuario');
    setFormPassword('');
    setFormPasswordConfirm('');
    setEditingUser(null);
    setFormError(null);
    setIsSubmitting(false);
  }

  // ─── Abre o modal de criar usuário ───
  function openCreateModal() {
    resetForm();
    setShowUserForm(true);
  }

  // ─── Abre o modal de editar usuário ───
  function openEditModal(user: Profile) {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormRole(user.role as 'admin' | 'usuario');
    setFormPassword('');
    setFormPasswordConfirm('');
    setFormError(null);
    setShowUserForm(true);
  }

  // ─── Cria ou atualiza um usuário via endpoint server-side ───
  async function handleSubmitUserForm(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // validações mínimas
    if (!formEmail) {
      setFormError('O e-mail é obrigatório.');
      return;
    }
    if (!editingUser) {
      // criando: precisa de senha
      if (!formPassword) {
        setFormError('A senha é obrigatória para criar um usuário.');
        return;
      }
      if (formPassword !== formPasswordConfirm) {
        setFormError('As senhas não conferem.');
        return;
      }
    } else {
      // editando: senha opcional
      if (formPassword && formPassword !== formPasswordConfirm) {
        setFormError('As senhas não conferem.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (editingUser) {
        // CHAMA /api/update-user
        const payload: { id: string; email: string; role: string; password?: string } = {
          id: editingUser.id,
          email: formEmail,
          role: formRole,
        };
        if (formPassword) {
          payload.password = formPassword;
        }

        const resp = await fetch('/api/update-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // Se não for 2xx, leia como texto e jogue erro
        if (!resp.ok) {
          let errMsg = await resp.text();
          try {
            const j = JSON.parse(errMsg);
            errMsg = j.error || j.message || errMsg;
          } catch {
            // permaneça com errMsg=texto cru se não puder parsear JSON
          }
          throw new Error(errMsg);
        }

        // Agora atualiza o perfil (email, role) em profiles
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ email: formEmail, role: formRole })
          .eq('id', editingUser.id);
        if (updateError) {
          throw new Error(updateError.message);
        }
      } else {
        // CHAMA /api/create-user
        const payload = {
          email: formEmail,
          password: formPassword,
          role: formRole,
        };
        const resp = await fetch('/api/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          let errMsg = await resp.text();
          try {
            const j = JSON.parse(errMsg);
            errMsg = j.error || j.message || errMsg;
          } catch {
            // se não for JSON, mantém errMsg
          }
          throw new Error(errMsg);
        }
        // Sucesso: o endpoint já deve ter inserido em profiles, então só recarregamos abaixo
      }

      // Fecha modal e recarrega lista de perfis
      setShowUserForm(false);
      resetForm();
      const { data: allProfiles, error: allError } = await supabase
        .from('profiles')
        .select('id, email, role, created_at')
        .order('created_at', { ascending: false });
      if (!allError && allProfiles) {
        setUsers(allProfiles);
      }
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Carrega acessos de um usuário e abre o modal ───
  async function openAccessModal(user: Profile) {
    setSelectedUserForAccess(user);
    setIsAccessLoading(true);
    setAccessError(null);
    setAccessList([]);

    const { data: accesses, error: accessError } = await supabase
      .from('user_document_access')
      .select('id, user_id, documento_id')
      .eq('user_id', user.id);

    if (accessError) {
      setAccessError(accessError.message);
      setIsAccessLoading(false);
      setShowAccessModal(true);
      return;
    }
    setAccessList(accesses || []);
    setIsAccessLoading(false);
    setShowAccessModal(true);
  }

  // ─── Alterna (insert/delete) na tabela user_document_access ───
  async function toggleDocumentAccess(documentoId: number) {
    if (!selectedUserForAccess) return;
    setIsAccessLoading(true);
    setAccessError(null);

    const exists = accessList.find(
      (a) =>
        a.user_id === selectedUserForAccess.id &&
        a.documento_id === documentoId
    );

    if (exists) {
      // Remove acesso
      const { error: delError } = await supabase
        .from('user_document_access')
        .delete()
        .eq('id', exists.id);
      if (delError) {
        setAccessError(delError.message);
        setIsAccessLoading(false);
        return;
      }
    } else {
      // Adiciona acesso
      const { error: insError } = await supabase
        .from('user_document_access')
        .insert({
          user_id: selectedUserForAccess.id,
          documento_id: documentoId,
        });
      if (insError) {
        setAccessError(insError.message);
        setIsAccessLoading(false);
        return;
      }
    }

    // Recarrega lista de acessos
    const { data: newAccesses, error: accessError } = await supabase
      .from('user_document_access')
      .select('id, user_id, documento_id')
      .eq('user_id', selectedUserForAccess.id);

    if (!accessError && newAccesses) {
      setAccessList(newAccesses);
    }
    setIsAccessLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-green-700 text-lg">Carregando usuários…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-green-50 p-4 flex items-center justify-center">
        <p className="text-red-600 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-green-700">Gerenciar Usuários</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Voltar
          </button>
          <button
            onClick={openCreateModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Novo Usuário
          </button>
        </div>
      </header>

      <table className="min-w-full bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <thead className="bg-green-100">
          <tr>
            <th className="py-2 px-4 text-left font-medium">ID</th>
            <th className="py-2 px-4 text-left font-medium">Email</th>
            <th className="py-2 px-4 text-left font-medium">Role</th>
            <th className="py-2 px-4 text-left font-medium">Criado em</th>
            <th className="py-2 px-4 text-center font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="py-2 px-4 text-sm break-all">{u.id}</td>
              <td className="py-2 px-4 text-sm">{u.email}</td>
              <td className="py-2 px-4 text-sm">{u.role}</td>
              <td className="py-2 px-4 text-sm">
                {new Date(u.created_at).toLocaleString()}
              </td>
              <td className="py-2 px-4 text-center flex justify-center gap-2">
                
                <button
                  onClick={() => openEditModal(u)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs"
                >
                  Editar
                </button>
                <button
                  onClick={() => openAccessModal(u)}
                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                >
                  Mapas
                </button>
                <button
                onClick={() => handleDeleteUser(u.id)}
                className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                >
                Deletar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ─── Modal de Criar/Editar Usuário ─── */}
      {showUserForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-green-700 mb-4">
              {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
            </h2>
            <form onSubmit={handleSubmitUserForm} className="space-y-4">
              <div>
                <label className="block text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border px-3 py-2 rounded"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Role</label>
                <select
                  className="w-full border px-3 py-2 rounded"
                  value={formRole}
                  onChange={(e) =>
                    setFormRole(e.target.value as 'admin' | 'usuario')
                  }
                >
                  <option value="usuario">Usuário</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 mb-1">
                  Senha {editingUser ? '(opcional)' : ''}
                </label>
                <input
                  type="password"
                  className="w-full border px-3 py-2 rounded"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editingUser ? 'Nova senha (opcional)' : 'Senha'}
                  {...(!editingUser ? { required: true } : {})}
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">
                  Confirme a senha
                </label>
                <input
                  type="password"
                  className="w-full border px-3 py-2 rounded"
                  value={formPasswordConfirm}
                  onChange={(e) => setFormPasswordConfirm(e.target.value)}
                  placeholder={
                    editingUser
                      ? 'Confirme nova senha (opcional)'
                      : 'Confirme a senha'
                  }
                  {...(!editingUser ? { required: true } : {})}
                />
              </div>
              {formError && <p className="text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserForm(false);
                    resetForm();
                  }}
                  className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {editingUser ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal de Mapas para Usuário ─── */}
      {showAccessModal && selectedUserForAccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
            <h2 className="text-xl font-bold text-green-700 mb-4">
              Mapas para: {selectedUserForAccess.email}
            </h2>

            {isAccessLoading ? (
              <p className="text-green-700">Carregando...</p>
            ) : accessError ? (
              <p className="text-red-600">{accessError}</p>
            ) : (
              <div className="max-h-64 overflow-auto border rounded p-2 mb-4">
                {docList.length === 0 && (
                  <p className="text-gray-600">Nenhum documento cadastrado.</p>
                )}
                {docList.map((doc) => {
                  const hasAccess = accessList.some(
                    (a) =>
                      a.user_id === selectedUserForAccess.id &&
                      a.documento_id === doc.id
                  );

                  // Gera URL pública da miniatura (getPublicUrl retorna { data: { publicUrl } })
                  let thumbnailUrl = '';
                  if (doc.url_miniatura) {
                    const { data } = supabase
                      .storage
                      .from('mapas') // troque "mapas" pelo nome do seu bucket
                      .getPublicUrl(doc.url_miniatura);
                    thumbnailUrl = data.publicUrl;
                  }

                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between py-1 px-2 hover:bg-gray-100 rounded"
                    >
                      {thumbnailUrl ? (
                        <img
                        src={doc.url_miniatura}
                        alt={`Miniatura de ${doc.nome_arquivo}`}
                        className="w-10 h-10 object-cover rounded"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      ) : (
                        <div className="h-10 w-10 bg-gray-200 flex items-center justify-center rounded mr-2">
                          <span className="text-xs text-gray-500">Sem</span>
                        </div>
                      )}

                      <span className="text-gray-800 flex-1">
                        {doc.nome_arquivo}
                      </span>

                      <input
                        type="checkbox"
                        checked={hasAccess}
                        onChange={() => toggleDocumentAccess(doc.id)}
                        className="h-4 w-4 ml-4"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAccessModal(false);
                  setSelectedUserForAccess(null);
                }}
                className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
