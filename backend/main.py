import os
import shutil
import json

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from supabase import create_client
from fastapi import Body
import uuid

uid = str(uuid.uuid4())[:8]  # ou use um timestamp

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

origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# (Opcional: se você gerar SVG/PDF posteriormente, mantenha este mount)
app.mount("/static", StaticFiles(directory="output"), name="static")

@app.post("/api/update-user")
async def update_user(body: dict = Body(...)):
    try:
        user_id = body.get("id")
        email = body.get("email")
        role = body.get("role")
        password = body.get("password", None)

        if not user_id or not email or not role:
            return {"error": "Dados incompletos."}

        # Atualiza usuário no Supabase Auth
        updates = {"email": email}
        if password:
            updates["password"] = password

        auth_response = supabase.auth.admin.update_user_by_id(user_id, updates)

        if not auth_response or not auth_response.user:
            return {"error": "Erro ao atualizar usuário no Supabase Auth."}

        # Atualiza também na tabela profiles
        supabase.table("profiles").update({
            "email": email,
            "role": role
        }).eq("id", user_id).execute()

        return {"success": True}

    except Exception as e:
        return {"error": str(e)}

@app.post("/api/delete-user")
async def delete_user(body: dict = Body(...)):
    try:
        user_id = body.get("id")
        if not user_id:
            return {"error": "ID do usuário não informado."}

        # Remove do Supabase Auth
        supabase.auth.admin.delete_user(user_id)

        # Remove do Supabase DB (profiles e acessos)
        supabase.table("profiles").delete().eq("id", user_id).execute()
        supabase.table("user_document_access").delete().eq("user_id", user_id).execute()

        return {"success": True}
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/create-user")
async def create_user(body: dict = Body(...)):
    try:
        email = body.get("email")
        password = body.get("password")
        role = body.get("role", "usuario")

        if not email or not password:
            return {"error": "Email e senha são obrigatórios."}

        # Cria o usuário no Supabase Auth
        auth_response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True
        })

        if not auth_response or not auth_response.user:
            return {"error": "Erro ao criar usuário no Supabase Auth."}

        user_id = auth_response.user.id

        # Adiciona perfil na tabela profiles
        supabase.table("profiles").insert({
            "id": user_id,
            "email": email,
            "role": role
        }).execute()

        return {"success": True, "user_id": user_id}

    except Exception as e:
        return {"error": str(e)}
    
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
        email_usuario_raw = request.headers.get("x-user-email")
        email_usuario = str(email_usuario_raw) if email_usuario_raw else "anon@anon.com"
        if not isinstance(email_usuario, str):
            email_usuario = str(email_usuario)
        if not doc_id or not email_usuario:
            return {"error": "ID ou usuário ausente"}

        # Verifica se pertence ao usuário
        match = supabase.table("documentos").select("*").eq("id", doc_id).eq("usuario_email", email_usuario).execute()
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
        email_usuario_raw = request.headers.get("x-user-email")
        email_usuario = str(email_usuario_raw) if email_usuario_raw else "anon@anon.com"
        if not isinstance(email_usuario, str):
             email_usuario = str(email_usuario)
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

        # 1) Salva a imagem do mapa, se vier
        if mapa:
            imagem_path = os.path.join("input", "mapa.png")
            with open(imagem_path, "wb") as f:
                shutil.copyfileobj(mapa.file, f)

        # 2) Salva o JSON de entidades visíveis
        entidades_visiveis_path = os.path.join("input", "entidades_visiveis.txt")
        with open(entidades_visiveis_path, "wb") as f:
            shutil.copyfileobj(entidades_visiveis.file, f)

        # 3) Carrega entidades visíveis
        with open(entidades_visiveis_path, "r", encoding="utf-8") as f:
            entidades_visiveis_json = json.load(f)

        # 4) Carrega todas as entidades do DXF para o filtro
        with open("input/entidades_temp.txt", "r", encoding="utf-8") as f:
            entidades = json.load(f)

        selected_layers = json.loads(selected_layers or "[]")
        entidades_filtradas = [e for e in entidades if e["layer"] in selected_layers]

        # 5) Extrai tabelas e legenda
        talhoes = extrair_talhoes_por_proximidade(entidades)
        legenda = extrair_legenda_layers(entidades_visiveis_json)

        # 6) Reabre o DXF e parseia todas as entidades
        dxf_path = os.path.join("input", nome_arquivo)
        doc = load_dxf(dxf_path)
        entidades_dxf = parse_dxf(doc)
        talhoes = extrair_talhoes_por_proximidade(entidades_dxf)
        legenda = extrair_legenda_layers(entidades_visiveis_json)

        # 7) Monta “exemplos” por camada
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

        # 8) Reabre o DXF para medir comprimentos
        dxf_path = os.path.join("input", nome_arquivo)
        doc = load_dxf(dxf_path)
        entidades_dxf = parse_dxf(doc)

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

        # 9) Gera o layout (PDF “sem UUID”)
        gerar_layout_final(
            dxf_path,
            layer_data,
            talhoes,
            legenda,
            entidades_visiveis_json,
            dados
        )

        # ─── AQUI começa a parte nova ───
        # 10) Nome base do PDF gerado pelo layout_generator (sem UUID)
        nome_base = nome_arquivo.replace(".dxf", "")
        pdf_gerado_base = os.path.join("output", f"{nome_base}_V{nova_versao}.pdf")

        # 11) Verifica se o PDF existe antes de renomear
        if not os.path.exists(pdf_gerado_base):
            return {"error": f"PDF não encontrado: {pdf_gerado_base}"}

        # 12) Gera um UUID curto e renomeia para "com UUID"
        uid = str(uuid.uuid4())[:8]
        pdf_filename = f"{nome_base}_V{nova_versao}_{uid}.pdf"
        pdf_path = os.path.join("output", pdf_filename)
        os.rename(pdf_gerado_base, pdf_path)

        # 13) Miniatura — continuamos usando a imagem em "input/mapa.png"
        miniatura_filename = pdf_filename.replace(".pdf", ".png")
        miniatura_path = os.path.join("input", "mapa.png")

        # 14) Usuário autenticado (passado no header x-user-email)
        email_usuario = request.headers.get("x-user-email", "anon@anon.com")

        # 15) Upload para Supabase Storage (PDF + miniatura)
        with open(pdf_path, "rb") as f:
            supabase.storage.from_("pdfs").upload(pdf_filename, f)

        with open(miniatura_path, "rb") as f:
            supabase.storage.from_("miniaturas").upload(miniatura_filename, f)

        # 16) Busca URLs públicas
        res_pdf = supabase.storage.from_("pdfs").get_public_url(pdf_filename)
        pdf_public = res_pdf if isinstance(res_pdf, str) else (res_pdf.get("publicUrl") or res_pdf.get("publicURL"))

        res_mini = supabase.storage.from_("miniaturas").get_public_url(miniatura_filename)
        mini_public = res_mini if isinstance(res_mini, str) else (res_mini.get("publicUrl") or res_mini.get("publicURL"))

        # 17) Remove qualquer registro anterior com mesmo usuário e mesmo nome, para evitar duplicata
        supabase.table("documentos") \
            .delete() \
            .eq("usuario_email", email_usuario) \
            .eq("nome_arquivo", pdf_filename) \
            .execute()

        # 18) Insere entrada em "documentos"
        supabase.table("documentos").insert({
            "usuario_email": email_usuario,
            "nome_arquivo":   pdf_filename,
            "url_pdf":        pdf_public,
            "url_miniatura":  mini_public,
            "propriedade":    propriedade,
            "data_geracao":   data_atual
        }).execute()

        return {
            "message": "Layout gerado com sucesso.",
            "pdf_url": pdf_public
        }

    except Exception as e:
        return {"error": str(e)}