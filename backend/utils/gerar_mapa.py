import matplotlib.pyplot as plt
from ui.gui import draw_dxf
import os

def gerar_mapa_png(entidades: list, layers_ativos: list[str], output_path: str = "output/mapa.png"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Extrai todos os pontos (x, y) das entidades
    all_x, all_y = [], []
    for ent in entidades:
        if "points" in ent:
            for p in ent["points"]:
                all_x.append(p[0])
                all_y.append(p[1])
        if "start" in ent:
            all_x.append(ent["start"][0])
            all_y.append(ent["start"][1])
        if "end" in ent:
            all_x.append(ent["end"][0])
            all_y.append(ent["end"][1])
        if "center" in ent:
            all_x.append(ent["center"][0])
            all_y.append(ent["center"][1])
        if "position" in ent:
            all_x.append(ent["position"][0])
            all_y.append(ent["position"][1])

    # Define limites e escala
    min_x, max_x = min(all_x), max(all_x)
    min_y, max_y = min(all_y), max(all_y)
    largura = max_x - min_x
    altura = max_y - min_y

    # Escala máxima para manter tamanho da imagem aceitável
    max_dim = 2000  # pixels (largura ou altura)
    escala = max(largura, altura) / max_dim

    # Aplica escala
    entidades_escaladas = []
    for ent in entidades:
        novo = ent.copy()
        for campo in ["start", "end", "center", "position"]:
            if campo in ent:
                novo[campo] = [
                    (ent[campo][0] - min_x) / escala,
                    (ent[campo][1] - min_y) / escala
                ]
        if "points" in ent:
            novo["points"] = [
                [(p[0] - min_x) / escala, (p[1] - min_y) / escala]
                for p in ent["points"]
            ]
        if "radius" in ent:
            novo["radius"] = ent["radius"] / escala
        if "width" in ent:
            novo["width"] = ent["width"] / escala
        if "height" in ent:
            novo["height"] = ent["height"] / escala
        entidades_escaladas.append(novo)

    # Desenha e salva a imagem
    fig, ax = plt.subplots(figsize=(11, 8.5), dpi=100)
    ax.axis("off")
    draw_dxf(ax, entidades_escaladas, layers_ativos)
    ax.set_aspect("equal", adjustable="box")
    fig.savefig(output_path, bbox_inches="tight", pad_inches=0.1, dpi=300)
    plt.close(fig)
    print(f"✅ Mapa salvo em: {output_path}")
