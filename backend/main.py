import os
import shutil
import json

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE"))

from dxf.dxf_loader import load_dxf
from dxf.dxf_parser import parse_dxf
from ui.talhoes_parser import (
    extrair_talhoes_por_proximidade,
    extrair_legenda_layers,
)
from ui.layout_generator import gerar_layout_final

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# (Opcional: se você gerar SVG/PDF posteriormente, mantenha este mount)
app.mount("/static", StaticFiles(directory="output"), name="static")


@app.post("/dxf/upload")
async def upload_dxf(file: UploadFile = File(...)):
    """
    Recebe .dxf, parseia e devolve JSON com:
      - entidades: lista completa de entidades para desenhar
      - layers: lista de nomes de camadas disponíveis
    """
    try:
        # salva o DXF
        os.makedirs("input", exist_ok=True)
        caminho = os.path.join("input", file.filename)
        with open(caminho, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # parse
        doc = load_dxf(caminho)
        entidades = parse_dxf(doc)
        layers = sorted({e["layer"] for e in entidades})

        return {
            "message": "DXF processado com sucesso.",
            "filename": file.filename,
            "entidades": entidades,
            "layers": layers
        }

    except Exception as e:
        return {"error": str(e)}


from fastapi import Request

@app.post("/dxf/deletar-documento")
async def deletar_documento(request: Request):
    try:
        payload = await request.json()
        doc_id = payload.get("id")
        email = request.headers.get("x-user-email")

        if not doc_id or not email:
            return {"error": "ID ou usuário ausente"}

        # Verifica se pertence ao usuário
        match = supabase.table("documentos").select("*").eq("id", doc_id).eq("usuario_email", email).execute()
        if not match.data:
            return {"error": "Documento não encontrado ou sem permissão"}

        doc = match.data[0]
        supabase.storage.from_("pdfs").remove([doc["nome_arquivo"]])
        supabase.storage.from_("miniaturas").remove([doc["nome_arquivo"].replace(".pdf", ".png")])
        supabase.table("documentos").delete().eq("id", doc_id).execute()

        return {"success": True}
    except Exception as e:
        return {"error": str(e)}
    
@app.get("/dxf/documentos")
async def listar_documentos(request: Request):
    try:
        email_usuario = request.headers.get("x-user-email")
        if not email_usuario:
            return {"error": "Usuário não autenticado."}

        response = supabase.table("documentos") \
            .select("*") \
            .eq("usuario_email", email_usuario) \
            .order("data_geracao", desc=True) \
            .execute()

        return response.data

    except Exception as e:
        return {"error": str(e)}
    
@app.post("/dxf/gerar-layout")
async def gerar_layout(
    request: Request,
    nome_arquivo: str = Form(""),
    selected_layers: str = Form("[]"),
    responsavel: str = Form(""),
    escala: str = Form(""),
    distancia: str = Form(""),
    area_cana: str = Form(""),
    nova_versao: str = Form(""),
    propriedade: str = Form(""),
    mun_est: str = Form(""),
    parc: str = Form(""),
    desenhista: str = Form(""),
    data_atual: str = Form(""),
    mapa: UploadFile = File(None),
    entidades_visiveis: UploadFile = File(...)
):
    try:
        os.makedirs("input", exist_ok=True)

        # 📥 Salva a imagem do mapa
        if mapa:
            imagem_path = os.path.join("input", "mapa.png")
            with open(imagem_path, "wb") as f:
                shutil.copyfileobj(mapa.file, f)

        # 📥 Salva o arquivo de entidades visíveis
        entidades_visiveis_path = os.path.join("input", "entidades_visiveis.txt")
        with open(entidades_visiveis_path, "wb") as f:
            shutil.copyfileobj(entidades_visiveis.file, f)

        # 📖 Carrega entidades visíveis
        with open(entidades_visiveis_path, "r", encoding="utf-8") as f:
            entidades_visiveis_json = json.load(f)

        # 📖 Carrega todas as entidades do DXF para filtrar para a tabela
        with open("input/entidades_temp.txt", "r", encoding="utf-8") as f:
            entidades = json.load(f)

        selected_layers = json.loads(selected_layers or "[]")

        entidades_filtradas = [
            e for e in entidades if e["layer"] in selected_layers
        ]

        # 📊 Tabelas e legenda
        talhoes = extrair_talhoes_por_proximidade(entidades)
        legenda = extrair_legenda_layers(entidades_visiveis_json)

        exemplos = {}
        for ent in entidades_filtradas:
            layer = ent["layer"]
            if layer not in exemplos:
                exemplos[layer] = ent

        dados = {
            "parc": parc,
            "escala": escala,
            "distancia": distancia,
            "area_cana": area_cana,
            "nova_versao": nova_versao,
            "propriedade": propriedade,
            "mun_est": mun_est,
            "desenhista": desenhista,
            "data_atual": data_atual,
            "selected_layers": selected_layers,
            "out_dir": "output",
            "entidades_exemplo": exemplos
        }

        # 📂 Reabre o DXF para medir comprimentos reais
        dxf_path = os.path.join("input", nome_arquivo)
        doc = load_dxf(dxf_path)
        entidades_dxf = parse_dxf(doc)

        # 📏 Calcula comprimento dos layers marcados
        layer_data = {}
        for ent in entidades_dxf:
            if ent["layer"] not in selected_layers:
                continue
            if ent["type"] not in ["LINE", "POLYLINE", "LWPOLYLINE"]:
                continue
            layer = ent["layer"]
            comp = ent.get("length", 0.0)
            if layer not in layer_data:
                layer_data[layer] = {"qtd": 0, "total": 0.0}
            layer_data[layer]["qtd"] += 1
            layer_data[layer]["total"] += comp

        # 🧠 Gera layout com tudo
        gerar_layout_final(
            dxf_path,
            layer_data,
            talhoes,
            legenda,
            entidades_visiveis_json,
            dados
        )

        # 📁 Caminhos do PDF e Miniatura
        pdf_path = os.path.join("output", nome_arquivo.replace(".dxf", f"_V{nova_versao}.pdf"))
        miniatura_path = os.path.join("input", "mapa.png")

        # 📛 Nomes de arquivos
        pdf_filename = os.path.basename(pdf_path)
        miniatura_filename = pdf_filename.replace(".pdf", ".png")

        # 🧠 Pega o e-mail do usuário autenticado (via header enviado pelo frontend)
        email_usuario = request.headers.get("x-user-email", "anon@anon.com")

        # ☁️ Upload no Supabase Storage
        with open(pdf_path, "rb") as f:
            supabase.storage.from_("pdfs").upload(pdf_filename, f, {
                "content-type": "application/pdf",
                "upsert": True  # ← permite sobrescrever
            })
        with open(miniatura_path, "rb") as f:
            supabase.storage.from_("miniaturas").upload(miniatura_filename, f, {
                "content-type": "image/png",
                "upsert": True  # ← permite sobrescrever
            })

        # 🗃️ Salva registro no Supabase Database
        supabase.table("documentos").insert({
            "usuario_email": email_usuario,
            "nome_arquivo": pdf_filename,
            "url_pdf": f"https://txdvsqdftdxotvzctwyf.supabase.co/storage/v1/object/public/pdfs/{pdf_filename}",
            "url_miniatura": f"https://txdvsqdftdxotvzctwyf.supabase.co/storage/v1/object/public/miniaturas/{miniatura_filename}",
            "propriedade": propriedade,
            "data_geracao": data_atual
        }).execute()

        pdf_url = f"https://txdvsqdftdxotvzctwyf.supabase.co/storage/v1/object/public/pdfs/{pdf_filename}"
        return {
            "message": "Layout gerado com sucesso.",
            "pdf_url": pdf_url
        }

    except Exception as e:
        return {"error": str(e)}
