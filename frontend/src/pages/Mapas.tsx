import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader } from "../components/PageHeader";

const BACKEND_URL = "http://localhost:8000";

interface Documento {
  id: string;
  nome_arquivo: string;
  propriedade: string;
  url_pdf: string;
  url_miniatura: string;
  data_geracao: string;
  usuario_email: string;
  owner_id: string;
}

async function handleDownload(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Erro ao baixar PDF:", err);
    alert("Não foi possível baixar o PDF.");
  }
}

export default function Mapas() {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroData, setFiltroData] = useState("");
  const [role, setRole] = useState<"admin" | "usuario" | null>(null);
  const [emailAtual, setEmailAtual] = useState("");

  async function excluirDocumento(id: string) {
    const confirmar = confirm("Tem certeza que deseja excluir este documento?");
    if (!confirmar) return;

    const { data: user } = await supabase.auth.getUser();
    const email = user.user?.email;

    if (!email) return alert("Usuário não autenticado");

    const res = await fetch(`${BACKEND_URL}/dxf/deletar-documento`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-email": email,
      },
      body: JSON.stringify({ id }),
    });

    const result = await res.json();
    if (result.success) {
      alert("Documento excluído com sucesso!");
      // Atualiza lista sem recarregar a página
      setDocumentos((prev) => prev.filter((doc) => doc.id !== id));
    } else {
      alert("Erro ao excluir: " + result.error);
    }
  }

useEffect(() => {
  async function fetchDocumentos() {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const email = userData?.user?.email?.trim().toLowerCase();
    setEmailAtual(email ?? "");

    if (!userId || !email) {
      console.warn("Usuário não autenticado.");
      return;
    }

    const { data: perfil } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    const userRole = perfil?.role;
    setRole(userRole);

    let docs = [];

    if (userRole === "admin") {
      // 🔥 Admin vê tudo
      const { data } = await supabase
        .from("documentos")
        .select("*")
        .order("data_geracao", { ascending: false });

      docs = data || [];
    } else {
      // 🔐 Usuário comum vê próprios + compartilhados
      const { data: acessos } = await supabase
        .from("user_document_access")
        .select("documento_id")
        .eq("user_id", userId);

      const idsLiberados = acessos?.map((a) => a.documento_id) || [];

      if (idsLiberados.length === 0) {
        const { data } = await supabase
          .from("documentos")
          .select("*")
          .eq("usuario_email", email)
          .order("data_geracao", { ascending: false });

        docs = data || [];
      } else {
        const { data } = await supabase
          .from("documentos")
          .select("*")
          .or(`usuario_email.eq.${email},id.in.(${idsLiberados.join(",")})`)
          .order("data_geracao", { ascending: false });

        docs = data || [];
      }
    }

    console.log("Email:", email);
    console.log("Role:", userRole);
    console.log("Documentos encontrados:", docs);

    setDocumentos(docs);
  }

  fetchDocumentos();
}, []);

  const documentosFiltrados = documentos.filter((doc) => {
    const dataDoc = doc.data_geracao.slice(0, 10);
    const nomeOk = doc.propriedade.toLowerCase().includes(filtroNome.toLowerCase());
    const dataOk = filtroData ? dataDoc === filtroData : true;
    return nomeOk && dataOk;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-green-100 p-6">
      <PageHeader title="" />
      <h1 className="text-2xl sm:text-3xl font-bold text-green-700 mb-1">
        Visualização de Mapas
      </h1>
      <p className="text-gray-700 mb-6">
        Arquivos gerados via integração DXF. Utilize os filtros abaixo para localizar arquivos específicos.
      </p>

      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <input
          type="text"
          placeholder="Buscar por propriedade"
          value={filtroNome}
          onChange={(e) => setFiltroNome(e.target.value)}
          className="px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-green-400 outline-none"
        />
        <input
          type="date"
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value)}
          className="px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-green-400 outline-none"
        />
      </div>

      {documentosFiltrados.length === 0 ? (
        <p className="text-gray-600 italic">Nenhum arquivo encontrado.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {documentosFiltrados.map((doc) => (
            <div
              key={doc.id}
              className="bg-white border border-green-200 rounded-xl shadow hover:shadow-md transition p-4 flex flex-col"
            >
              {doc.url_miniatura ? (
                <img
                  src={doc.url_miniatura}
                  alt={`Miniatura de ${doc.propriedade}`}
                  className="w-full h-40 object-cover rounded mb-3"
                />
              ) : (
                <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-gray-400 rounded mb-3">
                  Sem miniatura
                </div>
              )}

              <h3 className="text-lg font-semibold text-green-700 mb-1">
                {doc.propriedade}
              </h3>
              <p className="text-sm text-gray-600 mb-1">
                <strong>Data:</strong> {doc.data_geracao}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                <strong>Usuário:</strong> {doc.usuario_email}
              </p>

              <button
                onClick={() => handleDownload(doc.url_pdf, doc.nome_arquivo)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition font-medium w-full mt-auto text-center"
              >
                📄 Baixar PDF
              </button>

              {(role === "admin" || doc.usuario_email === emailAtual) && (
                <button
                  onClick={() => excluirDocumento(doc.id)}
                  className="mt-2 text-red-500 hover:text-red-700 text-sm"
                >
                  🗑 Excluir
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
