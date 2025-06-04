// src/components/ServicosList.jsx (ou .tsx)
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

type Servico = {
  id: number;
  titulo: string;
  descricao: string;
  imagem: string;
  rota: string;
};

const servicos: Servico[] = [
  {
    id: 1,
    titulo: 'Visualização de Mapas Operacionais',
    descricao:
      'Acesse os mapas técnicos atualizados para análise e tomada de decisão no campo e na usina. Interface amigável e eficiente para consulta rápida.',
    imagem: '/src/assets/mapa-consulta.jpg',
    rota: '/mapas',
  },
  {
    id: 2,
    titulo: 'Integração de Mapas DXF ao Sistema',
    descricao:
      'Envie arquivos DXF dos projetos para que sejam automaticamente processados e incorporados ao layout digital da CEVASA. Simplifique o fluxo técnico.',
    imagem: '/src/assets/mapa-dxf.jpg',
    rota: '/upload-dxf',
  },
  
];

export default function ServicosList() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [erro, setErro] = useState<string>('');

  // 1) Ao montar, busca o user logado e depois busca o perfil (role)
  useEffect(() => {
    async function buscarRole() {
      // 1.1) Pega o usuário autenticado
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      
      console.log('→ supabase.auth.getUser() devolveu:', { user, userError });
      
      if (userError) {
        console.error('Erro ao obter usuário logado:', userError.message);
        setErro('Não foi possível obter o usuário.');
        return;
      }
      if (!user) {
        // Se não há usuário (sessão expirada, por exemplo), redireciona para login
        navigate('/login');
        return;
      }

      // 1.2) Busca o campo `role` na tabela `profiles`
      const { data: perfil, error: perfilError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (perfilError) {
        console.error('Erro ao buscar role em profiles:', perfilError.message);
        setErro('Não foi possível obter o perfil.');
        return;
      }

      // 1.3) Seta o estado local
      setRole(perfil.role);
    }

    buscarRole();
  }, [navigate]);

  // 2) Função de logout (igual a anterior)
  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 p-4 sm:p-6">
      {/* CABEÇALHO */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <img
            src="/src/assets/cevasa-logo.png"
            alt="Logo CEVASA"
            className="w-24 h-auto sm:w-28"
          />
          <div className="space-y-1 sm:space-y-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-green-700 leading-tight">
              Painel de Serviços Técnicos
            </h1>
            <p className="text-sm text-green-800 opacity-80 max-w-md">
              Soluções operacionais e integração de mapas da CEVASA
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-md transition shadow self-start sm:self-center"
        >
          Sair
        </button>
      </header>

      {/* GRID DE SERVIÇOS */}
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
        {servicos.map((servico) => (
          <Card
            key={servico.id}
            className="bg-white border border-green-200 shadow-sm hover:shadow-lg transform hover:scale-[1.01] transition-all duration-200 rounded-2xl overflow-hidden"
          >
            <Dialog>
              <DialogTrigger asChild>
                <img
                  src={servico.imagem}
                  alt={servico.titulo}
                  className="w-full h-44 sm:h-48 md:h-56 object-cover cursor-pointer"
                />
              </DialogTrigger>

              <DialogContent>
                <img
                  src={servico.imagem}
                  alt={servico.titulo}
                  className="rounded-md mb-4 max-h-64 w-full object-contain mx-auto"
                />
                <h3 className="text-xl font-bold text-green-700 mb-2">
                  {servico.titulo}
                </h3>
                <p className="text-gray-800 whitespace-pre-line mb-4">
                  {servico.descricao}
                </p>
                <button
                  onClick={() => navigate(servico.rota)}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition font-medium"
                >
                  Acessar
                </button>
              </DialogContent>
            </Dialog>

            <CardContent className="p-4">
              <h2 className="text-lg font-semibold text-green-700 mb-2">
                {servico.titulo}
              </h2>
              <p className="text-gray-700 mb-4">{servico.descricao}</p>

              <button
                onClick={() => navigate(servico.rota)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition font-medium"
              >
                Acessar
              </button>
            </CardContent>
          </Card>
        ))}

        {/* ─── NOVO CARD: Gerenciar Usuários (APENAS SE role === 'admin') ─── */}
{role === 'admin' && (
  <Card className="bg-white border border-green-200 shadow-sm hover:shadow-lg transform hover:scale-[1.01] transition-all duration-200 rounded-2xl overflow-hidden">
    {/* Banner de topo, com mesmas dimensões dos outros cards */}
    <Dialog>
      <DialogTrigger asChild>
        <img
          src="/src/assets/gerenciar-usuarios.png"
          alt="Gerenciar Usuários"
          className="w-full h-44 sm:h-48 md:h-56 object-cover cursor-pointer"
        />
      </DialogTrigger>

      <DialogContent>
        <img
          src="/src/assets/gerenciar-usuarios.png"
          alt="Gerenciar Usuários"
          className="rounded-md mb-4 max-h-64 w-full object-contain mx-auto"
        />
        <h3 className="text-xl font-bold text-green-700 mb-2">
          Gerenciar Usuários
        </h3>
        <p className="text-gray-800 whitespace-pre-line mb-4 text-center">
          Crie, edite e defina acesso de usuários não‐administradores.
        </p>
        <button
          onClick={() => navigate('/admin/users')}
          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition font-medium"
        >
          Acessar
        </button>
      </DialogContent>
    </Dialog>

        {/* Conteúdo do card abaixo da imagem */}
          <CardContent className="p-4">
            <h2 className="text-lg font-semibold text-green-700 mb-2">
              Gerenciar Usuários
            </h2>
            <p className="text-gray-700 mb-4 text-left">
              Crie, edite usuários e defina acesso de usuários não‐administradores a mapas.
            </p>
            <button
              onClick={() => navigate('/admin/users')}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition font-medium"
            >
              Acessar
            </button>
          </CardContent>
        </Card>
      )}
      </div>

      {/* Se der erro ao buscar role */}
      {erro && (
        <p className="mt-4 text-red-500 font-medium">Erro: {erro}</p>
      )}
    </div>
  );
}
