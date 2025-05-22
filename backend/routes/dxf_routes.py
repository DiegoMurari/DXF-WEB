from fastapi import APIRouter, UploadFile, File
from uuid import uuid4
import os
import json
import matplotlib.pyplot as plt

from dxf.dxf_loader import load_dxf
from dxf.dxf_parser import parse_dxf
from ui.gui import draw_dxf

router = APIRouter()

@router.post("/upload")
async def upload_dxf(file: UploadFile = File(...)):
    # Salva arquivo em uma pasta da sessão
    session_id = uuid4().hex[:8]
    session_dir = os.path.join("sessions", session_id)
    os.makedirs(session_dir, exist_ok=True)
    dxf_path = os.path.join(session_dir, file.filename)
    with open(dxf_path, "wb") as f:
        f.write(await file.read())

    # Carrega e gera mapa + entidades
    doc = load_dxf(dxf_path)
    entities = parse_dxf(doc)
    visible_layers = sorted(set(e.get("layer") for e in entities))

    # Desenha preview
    output_img = os.path.join(session_dir, "mapa.png")
    fig, ax = plt.subplots()
    draw_dxf(ax, entities, visible_layers)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.savefig(output_img, dpi=150, bbox_inches="tight", pad_inches=0.1)

    # Salva entidades em JSON
    with open(os.path.join(session_dir, "entidades.json"), "w") as f:
        json.dump(entities, f)

    return {
        "session_id": session_id,
        "preview_url": f"/sessions/{session_id}/mapa.png",
        "layers": visible_layers,
        "filename": file.filename,
    }
