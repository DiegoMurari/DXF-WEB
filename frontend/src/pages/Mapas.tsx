import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PageHeader } from "../components/PageHeader";
const BACKEND_URL = "http://localhost:8000"; // ou seu endereço real de produção

interface Documento {
  id: string;
  nome_arquivo: string;
  propriedade: string;
  url_pdf: string;
  url_miniatura: string;
  data_geracao: string;
  usuario_email: string;
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
    window.location.reload();
  } else {
    alert("Erro ao excluir: " + result.error);
  }
}

export default function Mapas() {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroData, setFiltroData] = useState("");

  useEffect(() => {
    async function fetchDocumentos() {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;

      if (!email) {
        console.warn("Usuário não autenticado.");
        return;
      }

      try {
        const response = await fetch("http://localhost:8000/dxf/documentos", {
          headers: {
            "x-user-email": email,
          },
        });
        const data = await response.json();
        setDocumentos(data || []);
      } catch (err) {
        console.error("Erro ao buscar documentos:", err);
      }
    }

    fetchDocumentos();
  }, []);

  const documentosFiltrados = documentos.filter((doc) => {
    return (
      doc.propriedade.toLowerCase().includes(filtroNome.toLowerCase()) &&
      doc.data_geracao.includes(filtroData)
    );
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
              <img
                src={doc.url_miniatura}
                alt={`Visualização de ${doc.propriedade}`}
                className="w-full h-40 object-cover rounded mb-3"
              />
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
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 
                          transition font-medium w-full mt-auto text-center"
              >
                📄 Baixar PDF
              </button>
              <button
              onClick={() => excluirDocumento(doc.id)}
              className="mt-2 text-red-500 hover:text-red-700 text-sm"
            >
              🗑 Excluir
            </button>
              
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
