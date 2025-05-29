// src/pages/UploadDXF.tsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase"; // ajuste o caminho se necessário
import React from "react";
import { PageHeader } from "../components/PageHeader";

const BACKEND_URL = "http://localhost:8000";

type Entidade = {
  type: string;
  layer: string;
  color: string | [number, number, number];
  start?: number[];
  end?: number[];
  points?: number[][];
  center?: number[];
  radius?: number;
  width?: number;       // para ELLIPSE
  height?: number;      // para ELLIPSE e TEXT
  rotation?: number;    // para TEXT/MTEXT
  angle?: number;       // para ARC ou ELLIPSE
  text?: string;
  position?: number[];
  start_angle?: number;
  end_angle?: number;
};

export default function UploadDXF() {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLayerPopup, setShowLayerPopup] = useState(false);
  const [panningEnabled, setPanningEnabled] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [imagemMapa, setImagemMapa] = useState<Blob | null>(null);
  const [camadasTabela, setCamadasTabela] = useState<Set<string>>(new Set());
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const user = supabase.auth.getUser().then((res) => res.data.user);
  const [removerAreasTalhoes, setRemoverAreasTalhoes] = useState(true);

  const [entidades, setEntidades] = useState<Entidade[]>([]);
  const [layers, setLayers] = useState<string[]>([]);
  const [visiveis, setVisiveis] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [propriedade, setPropriedade] = useState("");
  const [dataAtual] = useState(() => new Date().toLocaleDateString("pt-BR"));
  const [versao] = useState("0.1");
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1, h: 1 });

  // para panning
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const capturarImagemSVG = async (): Promise<Blob | null> => {
  if (!svgRef.current) return null;

  // 1) Clona o SVG inteiro (não afeta o que o usuário vê)
  const original = svgRef.current;
  const clone = original.cloneNode(true) as SVGSVGElement;

  // 2) Remove do clone **somente** o overlay pontilhado
  clone
    .querySelectorAll<SVGElement>(".capture-overlay")
    .forEach((el) => el.remove());

  // 3) Serializa o SVG limpo
  const svgData = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgData], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  // 4) Converte para PNG via canvas
  return new Promise<Blob | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const width = original.clientWidth * scale;
      const height = original.clientHeight * scale;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return resolve(null);
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        resolve(blob);
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.src = url;
  });
};
  
  async function handleDownload(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const blobUrl = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(blobUrl)
  } catch (err) {
    console.error("Erro ao baixar PDF:", err)
    alert("Não foi possível baixar o PDF.")
  }
}

  // 1) Upload + calcular viewBox
  async function handleUpload(file: File) {
    console.log("🔄 Iniciando upload de", file.name);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BACKEND_URL}/dxf/upload`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    console.log("📥 Resposta do backend:", data);

    if (data.error) {
      alert("Erro: " + data.error);
      return;
    }

    const ents: Entidade[] = data.entidades;
    console.log(
      `✅ Recebidas ${ents.length} entidades em ${data.layers.length} layers`
    );
    setEntidades(ents);
    setLayers(data.layers);
    setVisiveis(new Set(data.layers));
    setPropriedade(file.name.replace(".dxf", ""));

    // calcula limites
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const pad = 50;
    ents.forEach((ent) => {
      if (ent.start && ent.end) {
        const [x1, y1] = ent.start,
          [x2, y2] = ent.end;
        minX = Math.min(minX, x1, x2);
        maxX = Math.max(maxX, x1, x2);
        minY = Math.min(minY, y1, y2);
        maxY = Math.max(maxY, y1, y2);
      } else if (ent.center && ent.radius != null) {
        const [cx, cy] = ent.center,
          r = ent.radius;
        minX = Math.min(minX, cx - r);
        maxX = Math.max(maxX, cx + r);
        minY = Math.min(minY, cy - r);
        maxY = Math.max(maxY, cy + r);
      } else if (ent.points) {
        ent.points.forEach(([x, y]) => {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        });
      } else if (ent.position) {
        const [x, y] = ent.position;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    });
    if (minX < Infinity) {
      console.log("🔍 Ajustando viewBox");
      setViewBox({
        x: minX - pad,
        y: minY - pad,
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2,
      });
    }
  }

  
function zoomInOut(dir: "in" | "out") {
  const zf = 1.1;
  setViewBox((vb) => {
    const f = dir === "in" ? 1 / zf : zf;
    const w = vb.w * f,
      h = vb.h * f;
    return {
      x: vb.x - (w - vb.w) / 2,
      y: vb.y - (h - vb.h) / 2,
      w,
      h,
    };
  });
}

const recentrarViewBox = () => {
  if (!entidades.length) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pad = 100; // aumentamos de 50 → 100 para evitar cortes no topo e nas bordas

  entidades.forEach((ent) => {
    if (ent.start && ent.end) {
      const [x1, y1] = ent.start;
      const [x2, y2] = ent.end;
      minX = Math.min(minX, x1, x2);
      maxX = Math.max(maxX, x1, x2);
      minY = Math.min(minY, y1, y2);
      maxY = Math.max(maxY, y1, y2);
    } else if (ent.center && ent.radius != null) {
      const [cx, cy] = ent.center;
      const r = ent.radius;
      minX = Math.min(minX, cx - r);
      maxX = Math.max(maxX, cx + r);
      minY = Math.min(minY, cy - r);
      maxY = Math.max(maxY, cy + r);
    } else if (ent.points) {
      ent.points.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
    } else if (ent.position) {
      const [x, y] = ent.position;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  });

  if (minX === Infinity) return;

  const newX = minX - pad;
  const newY = minY - pad;
  const newW = maxX - minX + pad * 2;
  const newH = maxY - minY + pad * 2;

  // animação suave
  const duration = 300;
  const startTime = performance.now();
  const startViewBox = { ...viewBox };

  const animate = (time: number) => {
    const progress = Math.min((time - startTime) / duration, 1);
    const lerp = (a: number, b: number) => a + (b - a) * progress;

    setViewBox({
      x: lerp(startViewBox.x, newX),
      y: lerp(startViewBox.y, newY),
      w: lerp(startViewBox.w, newW),
      h: lerp(startViewBox.h, newH),
    });

    if (progress < 1) requestAnimationFrame(animate);
  };

  requestAnimationFrame(animate);
};

function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setGerandoPDF(true);

  const formData = new FormData(e.currentTarget);
  formData.append("nome_arquivo", propriedade + ".dxf");
  formData.append("selected_layers", JSON.stringify(Array.from(camadasTabela)));
  formData.append("viewBox", JSON.stringify(viewBox));
  formData.append("layers_visiveis", JSON.stringify(Array.from(visiveis)));
  formData.append("remover_areas_talhoes", removerAreasTalhoes ? "1" : "0");

  // SVG como blob
  const svgMarkup = svgRef.current?.outerHTML || "";
  const svgBlob1 = new Blob([svgMarkup], { type: "image/svg+xml" });
  formData.append("svg", svgBlob1, "mapa.svg");

  if (!svgRef.current) return;

  // Converte SVG para PNG em alta resolução
    capturarImagemSVG().then((blob) => {
    if (!blob) {
      setGerandoPDF(false);
      alert("Erro ao gerar imagem.");
      return;
    }

    formData.append("mapa", blob, "mapa.png");

    const entidadesVisiveis = entidades.filter((ent) => visiveis.has(ent.layer));
    const blobEnt = new Blob([JSON.stringify(entidadesVisiveis)], { type: "application/json" });
    formData.append("entidades_visiveis", blobEnt, "entidades_visiveis.txt");

    // Recupera e-mail e envia ao backend
    import("../lib/supabase").then(({ supabase }) => {
      supabase.auth.getUser().then((res) => {
        let email = "anon@anon.com";
        if (res.data?.user?.email) email = res.data.user.email;

        fetch(`${BACKEND_URL}/dxf/gerar-layout`, {
          method: "POST",
          headers: { "x-user-email": email },
          body: formData,
        })
          .then((r) => r.json())
          .then(async (d) => {
            setGerandoPDF(false);
            if (d.pdf_url) {
              // extrai nome do arquivo e dispara download
              const urlObj = new URL(d.pdf_url);
              const filename = urlObj.pathname.split("/").pop()!;
              await handleDownload(d.pdf_url, filename);
              setShowForm(false);
            } else {
              alert("Erro: " + (d.error || "desconhecido"));
            }
          })
          .catch(() => {
            setGerandoPDF(false);
            alert("Erro ao gerar layout.");
          });
      });
    });
  });
}

  async function svgToPng(svgElement: SVGSVGElement, width: number, height: number): Promise<Blob> {
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context inválido");
  
    const img = new Image();
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
  
    await new Promise<void>((resolve) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    });
  
    return new Promise((resolve) => canvas.toBlob((blob) => blob && resolve(blob), "image/png"));
  }

  // 2) Desenhar no SVG
  function desenharEntidades(
    svg: SVGSVGElement,
    ents: Entidade[],
    vis: Set<string>
  ) {
    console.log("🔄 Desenhando", ents.length, "entidades");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const ns = "http://www.w3.org/2000/svg";

    const vb = svg.viewBox.baseVal;
    const borda = document.createElementNS(ns, "rect");
    borda.setAttribute("class", "capture-overlay");
    borda.setAttribute("x",   `${vb.x}`);
    borda.setAttribute("y",   `${vb.y}`);
    borda.setAttribute("width",  `${vb.width}`);
    borda.setAttribute("height", `${vb.height}`);
    borda.setAttribute("fill",   "none");
    borda.setAttribute("stroke", "green");
    borda.setAttribute("stroke-dasharray", "4,4");
    borda.setAttribute("stroke-width", "2");
    svg.appendChild(borda);

    // 2) Desenha as formas e coleta textos
    const textos: SVGTextElement[] = [];
    ents.forEach((ent, i) => {
      if (ent.type === "HATCH") return;
      if (!vis.has(ent.layer)) return;

      // converte branco → preto
      let color: string;
      if (Array.isArray(ent.color)) {
        const [r, g, b] = ent.color.map((c) => Math.round(c * 255));
        color =
          r === 255 && g === 255 && b === 255
            ? "black"
            : `rgb(${r},${g},${b})`;
      } else {
        const c = ent.color.toLowerCase();
        color =
          /^#(?:fff|ffffff)$/i.test(c) || c === "white"
            ? "black"
            : ent.color;
      }

      const L = ent.layer.toUpperCase();
      const isXleg = L === "XLEGENDA SISTEMATIZAÇÃO";
      const isLomb = L.includes("LOMB");
      const isNum = L.includes("NUMERAÇÕES DOS TALHÕES");

      let elem: SVGElement | null = null;

      // — LINE
      if (ent.type === "LINE" && ent.start && ent.end) {
        elem = document.createElementNS(ns, "line");
        elem.setAttribute("x1", `${ent.start[0]}`);
        elem.setAttribute("y1", `${-ent.start[1]}`);
        elem.setAttribute("x2", `${ent.end[0]}`);
        elem.setAttribute("y2", `${-ent.end[1]}`);
        elem.setAttribute("stroke", color);
      }
      // — CIRCLE
      else if (
        ent.type === "CIRCLE" &&
        ent.center &&
        ent.radius != null
      ) {
        elem = document.createElementNS(ns, "circle");
        elem.setAttribute("cx", `${ent.center[0]}`);
        elem.setAttribute("cy", `${-ent.center[1]}`);
        elem.setAttribute("r", `${ent.radius}`);
        elem.setAttribute("fill", isLomb || isXleg ? color : "none");
        elem.setAttribute("stroke", color);
      }
      // — POLYLINE
      else if (ent.type === "POLYLINE" && ent.points) {
        if (isXleg && ent.points.length >= 3) {
          elem = document.createElementNS(ns, "polygon");
          const pts = ent.points
            .slice(0, 3)
            .map((p) => `${p[0]},${-p[1]}`)
            .join(" ");
          elem.setAttribute("points", pts);
          elem.setAttribute("fill", color);
          elem.setAttribute("stroke", color);
        } else {
          ent.points.forEach((_, j) => {
            if (j + 1 < ent.points!.length) {
              const [x1, y1] = ent.points![j];
              const [x2, y2] = ent.points![j + 1];
              const seg = document.createElementNS(ns, "line");
              seg.setAttribute("x1", `${x1}`);
              seg.setAttribute("y1", `${-y1}`);
              seg.setAttribute("x2", `${x2}`);
              seg.setAttribute("y2", `${-y2}`);
              seg.setAttribute("stroke", color);
              svg.appendChild(seg);
            }
          });
        }
      }
      // — SOLID
      else if (
        ent.type === "SOLID" &&
        ent.points &&
        ent.points.length >= 3
      ) {
        if (isXleg) {
          elem = document.createElementNS(ns, "polygon");
          const pts = ent.points
            .slice(0, 3)
            .map((p) => `${p[0]},${-p[1]}`)
            .join(" ");
          elem.setAttribute("points", pts);
          elem.setAttribute("fill", color);
          elem.setAttribute("stroke", color);
        } else {
          ent.points.forEach((_, j) => {
            if (j + 1 < ent.points!.length) {
              const [x1, y1] = ent.points![j];
              const [x2, y2] = ent.points![j + 1];
              const seg = document.createElementNS(ns, "line");
              seg.setAttribute("x1", `${x1}`);
              seg.setAttribute("y1", `${-y1}`);
              seg.setAttribute("x2", `${x2}`);
              seg.setAttribute("y2", `${-y2}`);
              seg.setAttribute("stroke", color);
              svg.appendChild(seg);
            }
          });
        }
      }
      // — ELLIPSE
      else if (
        ent.type === "ELLIPSE" &&
        ent.center &&
        ent.width != null &&
        ent.height != null
      ) {
        elem = document.createElementNS(ns, "ellipse");
        elem.setAttribute("cx", `${ent.center[0]}`);
        elem.setAttribute("cy", `${-ent.center[1]}`);
        elem.setAttribute("rx", `${ent.width}`);
        elem.setAttribute("ry", `${ent.height}`);
        elem.setAttribute(
          "transform",
          `rotate(${ent.angle || 0} ${ent.center[0]} ${-ent.center[1]})`
        );
        elem.setAttribute("fill", isLomb || isXleg ? color : "none");
        elem.setAttribute("stroke", color);
      }
      // — ARC
      else if (
        ent.type === "ARC" &&
        ent.center &&
        ent.radius != null &&
        ent.start_angle != null &&
        ent.end_angle != null
      ) {
        const sa = (ent.start_angle * Math.PI) / 180;
        const ea = (ent.end_angle * Math.PI) / 180;
        const x1 = ent.center[0] + ent.radius * Math.cos(sa);
        const y1 = ent.center[1] + ent.radius * Math.sin(sa);
        const x2 = ent.center[0] + ent.radius * Math.cos(ea);
        const y2 = ent.center[1] + ent.radius * Math.sin(ea);
        const largeArc = ((ent.end_angle - ent.start_angle) % 360) > 180 ? 1 : 0;
        const d = `M ${x1} ${-y1} A ${ent.radius} ${ent.radius} 0 ${largeArc} 0 ${x2} ${-y2}`;
        elem = document.createElementNS(ns, "path");
        elem.setAttribute("d", d);
        elem.setAttribute("fill", "none");
        elem.setAttribute("stroke", color);
      }
      // — SPLINE / LEADER / DIMENSION
      else if (
        ["SPLINE", "LEADER", "DIMENSION"].includes(ent.type) &&
        ent.points
      ) {
        ent.points.forEach((_, j) => {
          if (j + 1 < ent.points!.length) {
            const [x1, y1] = ent.points![j];
            const [x2, y2] = ent.points![j + 1];
            const seg = document.createElementNS(ns, "line");
            seg.setAttribute("x1", `${x1}`);
            seg.setAttribute("y1", `${-y1}`);
            seg.setAttribute("x2", `${x2}`);
            seg.setAttribute("y2", `${-y2}`);
            seg.setAttribute("stroke", color);
            seg.setAttribute("stroke-dasharray", "4,4");
            svg.appendChild(seg);
          }
        });
      }
      // — POINT
      else if (ent.type === "POINT" && ent.position) {
        elem = document.createElementNS(ns, "circle");
        elem.setAttribute("cx", `${ent.position[0]}`);
        elem.setAttribute("cy", `${-ent.position[1]}`);
        elem.setAttribute("r", "2");
        elem.setAttribute("fill", color);
      }

      // coleta textos para desenhar por último
      if (
        ["TEXT", "MTEXT", "ATTRIB", "ATTDEF"].includes(ent.type) &&
        ent.position &&
        ent.text != null
        
      ) {
        // Ignorar textos tipo "X.XX ha" se a opção estiver ativada
        if (removerAreasTalhoes && ent.text.match(/^\d+(\.\d+)?\s*ha$/i)) {
          return; // pula o desenho deste texto
        }
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", `${ent.position[0]}`);
        t.setAttribute("y", `${-ent.position[1]}`);

        const baseFs = ent.height || 12;
        const fs = baseFs * (isNum ? 1.0 : 1.5);
        t.setAttribute("font-size", `${fs}`);

        if (isNum) {
          t.setAttribute("fill", color);
          t.setAttribute("stroke", "white");
          t.setAttribute("stroke-width", "2");
          t.setAttribute("paint-order", "stroke fill");
        } else {
          t.setAttribute("fill", color);
          t.setAttribute("stroke", "none");
        }

        const rot = ent.rotation ?? ent.angle ?? 0;
        if (rot) {
          t.setAttribute(
            "transform",
            `rotate(${-rot} ${ent.position[0]} ${-ent.position[1]})`
          );
        }
        t.textContent = ent.text;
        textos.push(t);
      }

      if (elem) svg.appendChild(elem);
    });

    // 3) finalmente, desenha todos os textos por cima
    textos.forEach((t) => svg.appendChild(t));
  }

  // redesenha sempre que algo mudar
  useEffect(() => {
    if (svgRef.current) desenharEntidades(svgRef.current, entidades, visiveis);
  }, [entidades, visiveis, viewBox]);

  // alternating camadas
  function toggleLayer(layer: string) {
    const s = new Set(visiveis);
    s.has(layer) ? s.delete(layer) : s.add(layer);
    setVisiveis(s);
  }

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    svg.style.transition = "all 0.6s ease"; // animação ao mudar o viewBox
  }, []);

  // zoom via roda no container
  useEffect(() => {
    const wr = wrapperRef.current;
    if (!wr) return;
  
    const onWheel = (e: WheelEvent) => {
      if (showLayerPopup) {
        // Se o popup de camadas estiver aberto, ignora o zoom
        return;
      }
  
      e.preventDefault();
      const zf = 1.1;
      setViewBox((vb) => {
        const f = e.deltaY > 0 ? zf : 1 / zf;
        const w = vb.w * f,
          h = vb.h * f;
        return {
          x: vb.x - (w - vb.w) / 2,
          y: vb.y - (h - vb.h) / 2,
          w,
          h,
        };
      });
    };
  
    wr.addEventListener("wheel", onWheel, { passive: false });
    return () => wr.removeEventListener("wheel", onWheel);
  }, [showLayerPopup]); // <- importante: adicionamos essa dependência
  

  // panning via mouse no wrapper
  useEffect(() => {
    const wr = wrapperRef.current;
    if (!wr) return;
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      wr.style.cursor = "grabbing";
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanning || !panningEnabled) return;
      const dx = (e.clientX - panStart.current.x) * (viewBox.w / wr.clientWidth);
      const dy = (e.clientY - panStart.current.y) * (viewBox.h / wr.clientHeight);
      setViewBox((vb) => ({
        x: vb.x - dx,
        y: vb.y + dy,
        w: vb.w,
        h: vb.h,
      }));
      panStart.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      setIsPanning(false);
      wr.style.cursor = "grab";
    };

    wr.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    wr.style.cursor = "grab";

    return () => {
      wr.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isPanning, viewBox]);

  function handleMouseEnterPopup() {
    setShowLayerPopup(true);
  }
  function handleMouseLeavePopup() {
    setShowLayerPopup(false);
  }

  return (
    
    <div className="p-6 bg-green-50 min-h-screen relative font-sans">
      {/* Header */}
      <PageHeader title="" />
      <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-green-900 mb-4">
        Upload de DXF
      </h1>
      

      {/* Seletor de arquivo responsivo */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <button
          className="bg-green-600 hover:bg-green-700 text-white font-medium 
                    px-3 sm:px-4 md:px-5 
                    py-1.5 sm:py-2 md:py-2.5 
                    text-sm sm:text-base md:text-lg 
                    rounded shadow-sm transition"
          onClick={() => fileInputRef.current?.click()}
        >
          Escolher arquivo
        </button>
        <span className="text-sm sm:text-base text-gray-700">
          {propriedade || "Nenhum arquivo selecionado"}
        </span>
        <input
          type="file"
          accept=".dxf"
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
      </div>
      <div className="mb-4">
  <label className="flex items-center gap-2 text-gray-700">
    <input
      type="checkbox"
      checked={removerAreasTalhoes}
      onChange={() => setRemoverAreasTalhoes(!removerAreasTalhoes)}
      className="accent-green-600"
    />
    Remover área (ha) sob os números dos talhões e excluir layer TALHÕES da legenda
  </label>
</div>
      {/* Container do Mapa */}
      <div
        className="relative shadow bg-white overflow-hidden px-2 sm:px-6 md:px-12"
         ref={wrapperRef}
      >
         {/* ←–– OVERLAY BRANCO ––→ */}
          {entidades.length === 0 && (
            <div
              className="
                absolute inset-0
                bg-white
                z-20
              "
            />
          )}
          {/* Botões flutuantes de Zoom e Recentrar */}
          <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
            <button
              title="Zoom In"
              onClick={() => zoomInOut("in")}
              className="bg-white text-green-600 border border-green-300 hover:bg-green-100 w-9 h-9 md:w-11 md:h-11 rounded-full text-xl md:text-2xl shadow transition"
            >
              +
            </button>
            <button
              title="Zoom Out"
              onClick={() => zoomInOut("out")}
              className="bg-white text-green-600 border border-green-300 hover:bg-green-100 w-9 h-9 md:w-11 md:h-11 rounded-full text-xl md:text-2xl shadow transition"
            >
              −
            </button>
            <button
              title="Recentrar"
              onClick={recentrarViewBox}
              className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 w-9 h-9 md:w-11 md:h-11 rounded-full text-lg md:text-xl shadow transition"
            >
              ⟳
            </button>
          </div>

          {/* Popup de seleção de camadas */}
          <div
            className="absolute top-3 right-3 z-30 group"
            onMouseEnter={() => setShowLayerPopup(true)}
            onMouseLeave={() => setShowLayerPopup(false)}
          >
            {/* Invisível para bloquear panning */}
            <div className="absolute top-10 right-4 w-10 h-6 z-40 bg-transparent pointer-events-auto" />

            <button
              title="Mostrar camadas"
              className="peer bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-full text-sm shadow hover:bg-gray-100 transition relative z-50"
            >
              🗂 Camadas
            </button>

            <div
              className="absolute top-12 right-0 w-64 sm:w-72 md:w-80 max-h-[300px] overflow-y-auto bg-white rounded-xl shadow-xl transition-opacity duration-300 delay-500 opacity-0 hover:opacity-100 peer-hover:opacity-100 pointer-events-auto z-50 p-3"
              onWheel={(e) => { /* seu handler de wheel aqui */ }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-semibold text-sm text-gray-800 mb-2">
                Camadas visíveis
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 px-1 pr-2 text-sm">
                {layers.map((L) => (
                  <label key={L} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={visiveis.has(L)}
                      onChange={() => toggleLayer(L)}
                      className="accent-green-600"
                    />
                    <span className="text-gray-700">{L}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Wrapper exato do SVG: inline-block fecha na área que será capturada */}
          <div className="relative inline-block w-full h-[60vh] md:h-[70vh] lg:h-[80vh]">
            
            {/* Borda pontilhada mostrando a área de captura */}
            <div
              className="
                absolute inset-0
                pointer-events-none
                box-border
              "
            />
            {/* SVG do Mapa */}
            <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${-viewBox.y - viewBox.h} ${viewBox.w} ${viewBox.h}`}
            className="w-full h-[60vh] md:h-[70vh] lg:h-[80vh] cursor-grab select-none"
          />
          </div>
        </div>

      {/* Botão flutuante sobre o mapa para gerar layout */}
      {layers.length > 0 && (
        <button
          className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-3 rounded-full shadow-lg transition"
          onClick={async () => {
            const blob = await capturarImagemSVG();
            if (blob) {
              setImagemMapa(blob);
              setShowForm(true);
          
              // Inicializa camadas da tabela com as camadas visíveis atuais
              setCamadasTabela(new Set(visiveis));
            }
          }}          
        >
          📄 Gerar Layout
        </button>
      )}
  
      {/* Modal com formulário */}
{showForm && (
  <div className="fixed inset-0 top-0 left-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9999] px-2 animate-modal-fade-in">
    <div className="relative w-[95%] max-w-lg">
      {/* Overlay de carregamento */}
      {gerandoPDF && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-lg">
          <svg
            className="animate-spin h-8 w-8 text-green-700 mb-2"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 11-8 8z"
            ></path>
          </svg>
          <span className="text-green-800 text-sm font-medium">Gerando PDF, aguarde...</span>
        </div>
      )}

      <form
        onSubmit={handleFormSubmit}
        className={`bg-white w-full max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg space-y-4 animate-fadeZoomIn transition duration-300 ${
          gerandoPDF ? "blur-sm pointer-events-none select-none" : ""
        }`}
      >
        <h2 className="text-lg font-bold text-green-800">Informações para gerar layout</h2>

        <input name="desenhista" placeholder="Desenhista" className="input w-full" />
        <input name="escala" list="escalas" placeholder="Escala" className="input w-full" />
        <datalist id="escalas">
          {Array.from({ length: 10 }, (_, i) => 1000 * (i + 1)).map((v) => (
            <option key={v} value={`1:${v}`} />
          ))}
        </datalist>
        <input name="distancia" placeholder="Distância" className="input w-full" />
        <input name="area_cana" placeholder="Área Cana (ha)" className="input w-full" />
        <input name="mun_est" placeholder="Município / Estado" className="input w-full" />
        <input name="parc" placeholder="Parc Outorgante" className="input w-full" />
        <input
          name="propriedade"
          value={propriedade}
          onChange={(e) => setPropriedade(e.target.value)}
          className="input w-full"
        />
        <input name="data_atual" value={dataAtual} readOnly className="input w-full" />
        <input name="nova_versao" value={versao} readOnly className="input w-full" />

        {/* Camadas que irão para a tabela */}
        <div className="bg-gray-50 border border-gray-200 p-3 rounded">
          <h3 className="font-semibold text-gray-800 text-sm mb-2">
            Camadas a serem inseridas nas tabelas:
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 overflow-auto max-h-[40vh] pr-2 text-sm">
            {layers.map((layer) => (
              <label key={layer} className="flex items-start gap-2 break-words">
                <input
                  type="checkbox"
                  checked={camadasTabela.has(layer)}
                  onChange={() => {
                    const novoSet = new Set(camadasTabela);
                    if (novoSet.has(layer)) {
                      novoSet.delete(layer);
                    } else {
                      novoSet.add(layer);
                    }
                    setCamadasTabela(novoSet);
                  }}
                  className="accent-green-600 mt-1"
                />
                <span className="text-gray-700">{layer}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-green-700 hover:bg-green-800 text-white rounded shadow"
            disabled={gerandoPDF}
          >
            Confirmar e Gerar PDF
          </button>
        </div>
      </form>
    </div>
  </div>
)}
    </div>
  );
}