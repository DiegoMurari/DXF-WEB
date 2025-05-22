import os
import math
import sys
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QVBoxLayout, QPushButton, QLabel, QFileDialog,
    QListWidget, QListWidgetItem, QMessageBox, QApplication, QDialog,
    QSplitter, QGroupBox, QScrollArea, QCheckBox, QProgressBar
)
from PySide6.QtCore import Qt
from PySide6.QtGui import QCursor, QDragEnterEvent, QDropEvent
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from ui.config_manager import salvar_pasta_saida, carregar_pasta_saida
from PySide6.QtWidgets import QFileDialog

from dxf.dxf_loader import load_dxf
from dxf.dxf_parser import parse_dxf
from ui.talhoes_parser import extrair_talhoes_por_proximidade, extrair_legenda_layers
from ui.layout_generator import gerar_layout_final  # Ajuste para usar dados["out_dir"] ao salvar PDF/Excel
from ui.gui import draw_dxf
from ui.imagem_utils import salvar_mapa_como_png

class DXFInterface(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("DXF Layout Generator - QGIS Style")
        self.setMinimumSize(1200, 700)
        self.setAcceptDrops(True)
        self.setStyleSheet(self.dark_theme())

        self.dxf_path = None
        self.dxf_entities = []
        self.visible_layers = []
        self.measurement_mode = False
        self.measurement_points = []
        self.medicoes_salvas = []
        self._selected_point = None
        self._is_panning = False
        self._pan_start = None

        ultima_pasta = carregar_pasta_saida()
        self.output_dir = ultima_pasta if ultima_pasta and os.path.exists(ultima_pasta) else os.path.abspath("saida_pdf_excel")
        os.makedirs(self.output_dir, exist_ok=True)

        import matplotlib.pyplot as plt
        self.fig, self.ax = plt.subplots()
        self.canvas = FigureCanvas(self.fig)
        self.canvas.mpl_connect("motion_notify_event", self.on_hover)
        self.canvas.mpl_connect("button_press_event", self.on_mouse_press)
        self.canvas.mpl_connect("motion_notify_event", self.on_mouse_move)
        self.canvas.mpl_connect("button_release_event", self.on_mouse_release)
        self.canvas.wheelEvent = self.wheel_zoom_event

        self.ax.axis("off")
        self.ax.text(
            0.5, 0.5,
            "ARRASTE O ARQUIVO DXF AQUI\nOU CLIQUE EM 'SELECIONAR DXF'",
            fontsize=16, color='grey', ha='center', va='center',
            transform=self.ax.transAxes, alpha=0.7
        )
        self.canvas.draw()

        self.sidebar_widget = QWidget(self)
        sidebar_layout = QVBoxLayout(self.sidebar_widget)
        sidebar_layout.setContentsMargins(10, 10, 10, 10)
        sidebar_layout.setSpacing(10)

        self.file_group = QGroupBox("Arquivo")
        file_layout = QVBoxLayout(self.file_group)
        self.select_button = QPushButton("📂 Selecionar DXF")
        self.select_button.clicked.connect(self.select_dxf)
        file_layout.addWidget(self.select_button)
        self.generate_button = QPushButton("✨ Gerar Layout")
        self.generate_button.setStyleSheet("background-color: #007ACC; font-weight: bold; padding: 10px; font-size: 16px;")
        self.generate_button.clicked.connect(self.gerar_layout)
        file_layout.addWidget(self.generate_button)
        sidebar_layout.addWidget(self.file_group)

        self.medicao_group = QGroupBox("Medições")
        medicao_layout = QVBoxLayout(self.medicao_group)
        self.ruler_button = QPushButton("📏 Medir")
        self.ruler_button.clicked.connect(self.toggle_measurement_mode)
        medicao_layout.addWidget(self.ruler_button)
        self.clear_button = QPushButton("🧹 Limpar Medições")
        self.clear_button.clicked.connect(self.limpar_medicoes)
        medicao_layout.addWidget(self.clear_button)
        self.zoom_in_button = QPushButton("🔍 Zoom +")
        self.zoom_in_button.clicked.connect(lambda: self.ajustar_zoom(0.9))
        medicao_layout.addWidget(self.zoom_in_button)
        self.zoom_out_button = QPushButton("🔎 Zoom −")
        self.zoom_out_button.clicked.connect(lambda: self.ajustar_zoom(1.1))
        medicao_layout.addWidget(self.zoom_out_button)
        self.reset_button = QPushButton("♻️ Redefinir Visualização")
        self.reset_button.clicked.connect(self.reset_view)
        medicao_layout.addWidget(self.reset_button)
        sidebar_layout.addWidget(self.medicao_group)

        self.layer_group = QGroupBox("Layers Disponíveis")
        layer_layout = QVBoxLayout(self.layer_group)
        self.layer_list = QListWidget(self)
        layer_layout.addWidget(self.layer_list)
        sidebar_layout.addWidget(self.layer_group)
        sidebar_layout.addStretch()

        splitter = QSplitter(Qt.Horizontal, self)
        splitter.addWidget(self.canvas)
        splitter.addWidget(self.sidebar_widget)
        splitter.setStretchFactor(0, 4)
        splitter.setStretchFactor(1, 1)
        main_layout = QVBoxLayout(self)
        main_layout.addWidget(splitter)

        self.output_panel = QWidget(self)
        self.output_panel.setFixedHeight(40)
        output_layout = QHBoxLayout(self.output_panel)
        output_layout.setContentsMargins(5, 5, 5, 5)
        output_layout.setSpacing(10)

        self.btn_set_output = QPushButton("Definir Local de Saída", self.output_panel)
        self.btn_set_output.clicked.connect(self.definir_local_saida)
        output_layout.addWidget(self.btn_set_output)
        self.btn_open_output = QPushButton("Abrir Local de Saída", self.output_panel)
        self.btn_open_output.clicked.connect(self.abrir_local_saida)
        output_layout.addWidget(self.btn_open_output)
        output_layout.addStretch(1)
        self.progress_bar = QProgressBar(self.output_panel)
        self.progress_bar.setFixedWidth(120)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.hide()
        output_layout.addWidget(self.progress_bar)
        self.status_label = QLabel("Pronto", self.output_panel)
        self.status_label.setStyleSheet("color: #ffffff;")
        output_layout.addWidget(self.status_label)
        self.output_panel.setStyleSheet("""
            background-color: #2d2d30;
            color: #ffffff;
            font-size: 11px;
        """)
        main_layout.addWidget(self.output_panel, alignment=Qt.AlignLeft)
        self.setLayout(main_layout)
        
    def dark_theme(self):
        return """
            QWidget {
                background-color: #2d2d30;
                color: #ffffff;
                font-family: "Segoe UI", Verdana, sans-serif;
                font-size: 12px;
            }
            QPushButton {
                background-color: #3e3e42;
                border: 1px solid #555;
                padding: 5px;
            }
            QPushButton:hover {
                background-color: #505055;
            }
            QGroupBox {
                border: 1px solid #555;
                margin-top: 10px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top left;
                padding: 0 3px;
                background-color: #2d2d30;
            }
            QListWidget {
                background-color: #3e3e42;
                border: 1px solid #555;
                color: #ffffff;
            }
            QListWidget::item {
                padding: 4px;
            }
            QListWidget::item:selected, QListWidget::item:selected:hover {
                background-color: #005999;
                color: #ffffff;
            }
            QListWidget::item:hover {
                background-color: #464646;
                color: #ffffff;
            }
        """

    # 1) Definir local de saída
    def definir_local_saida(self):
        # Carrega o último caminho salvo, se houver
        pasta_salva = carregar_pasta_saida()

        # Abre o seletor de pasta com o caminho salvo como padrão
        directory = QFileDialog.getExistingDirectory(self, "Selecione o Local de Saída", pasta_salva or self.output_dir)
        
        if directory:
            self.output_dir = directory
            salvar_pasta_saida(directory)  # Salva para uso futuro
            QMessageBox.information(self, "Local de Saída", f"Local de saída definido para:\n{self.output_dir}")

    # 2) Abrir local de saída
    def abrir_local_saida(self):
        if os.path.exists(self.output_dir):
            if sys.platform.startswith('win'):
                os.startfile(self.output_dir)
            elif sys.platform.startswith('darwin'):
                os.system(f'open "{self.output_dir}"')
            else:
                os.system(f'xdg-open "{self.output_dir}"')
        else:
            QMessageBox.warning(self, "Local de Saída", "O local de saída não existe.")

    # Botão: Selecionar DXF
    def select_dxf(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Selecione um arquivo DXF", "", "Arquivos DXF (*.dxf)")
        if file_path:
            self.carregar_dxf(file_path)

    # Carregar DXF via file_path
    def carregar_dxf(self, file_path):
        doc = load_dxf(file_path)
        if not doc:
            QMessageBox.critical(self, "Erro", "Erro ao carregar o DXF.")
            return
        self.dxf_path = file_path
        self.dxf_entities = parse_dxf(doc)
        self.visible_layers = sorted(set(e.get("layer") for e in self.dxf_entities))
        self.setWindowTitle(f"DXF Layout Generator - {os.path.basename(file_path)}")
        self.layer_list.clear()

        from PySide6.QtWidgets import QCheckBox, QListWidgetItem
        for nome in self.visible_layers:
            item = QListWidgetItem()
            checkbox = QCheckBox(nome)
            checkbox.setChecked(True)
            checkbox.setStyleSheet("color: white;")
            checkbox.stateChanged.connect(lambda _, cb=checkbox: self.redesenhar(reset_view=False))
            self.layer_list.addItem(item)
            self.layer_list.setItemWidget(item, checkbox)

        # Remove placeholder e desenha
        self.ax.clear()
        self.ax.axis("on")
        self.redesenhar(reset_view=True)

    # Botão: Gerar Layout
    def gerar_layout(self):
        from dxf.dxf_parser import calcular_tabelas
        from ui.layout_dialog import ExtendedLayoutInfoDialog
        from ui.layout_generator import gerar_layout_final
        from ui.talhoes_parser import extrair_talhoes_por_proximidade, extrair_legenda_layers

        selected_layers = [
            self.layer_list.itemWidget(self.layer_list.item(i)).text()
            for i in range(self.layer_list.count())
            if self.layer_list.itemWidget(self.layer_list.item(i)).isChecked()
        ]
        if not selected_layers:
            QMessageBox.warning(self, "Atenção", "Nenhum layer selecionado na interface principal.")
            return

        dialog = ExtendedLayoutInfoDialog(dxf_path=self.dxf_path, available_layers=self.visible_layers)
        if dialog.exec() == QDialog.Accepted:
            dados = dialog.get_result()
        else:
            QMessageBox.information(self, "Operação Cancelada", "Operação cancelada pelo usuário.")
            return

        dados["out_dir"] = self.output_dir

        selected_layers_legendas = dados.get("selected_layers", selected_layers)
        filtered_entities = [e for e in self.dxf_entities if e.get("layer") in selected_layers_legendas]
        if not filtered_entities:
            QMessageBox.warning(self, "Atenção", "Nenhum layer selecionado após o filtro.")
            return

        mapa_path = os.path.join("output", "mapa.png")
        salvar_mapa_como_png(self.canvas.figure, self.ax, output_path=mapa_path, dpi=300, padding_factor=0.1)

        layer_data, _ = calcular_tabelas(filtered_entities)
        legenda_layers = extrair_legenda_layers(filtered_entities)
        talhoes_dict = extrair_talhoes_por_proximidade(self.dxf_entities)

        # ✅ CAPTURA AS ENTIDADES EXEMPLO
        exemplos = {}
        for ent in filtered_entities:
            layer = ent.get("layer")
            if layer not in exemplos and ent["type"] in ["LINE", "POLYLINE", "SOLID"]:
                exemplos[layer] = ent
        dados["entidades_exemplo"] = exemplos  # <-- adiciona no dicionário

        gerar_layout_final(self.dxf_path, layer_data, talhoes_dict, legenda_layers, dados)

    # Zoom via Scroll
    def wheel_zoom_event(self, event):
        modifiers = QApplication.keyboardModifiers()
        if modifiers == Qt.ControlModifier:
            delta = event.angleDelta().y()
            if delta > 0:
                self.ajustar_zoom(fator=0.9)
            else:
                self.ajustar_zoom(fator=1.1)
        else:
            super(DXFInterface, self).wheelEvent(event)

    # Redesenha o que está na tela
    def redesenhar(self, reset_view=False):
        manter_visao = not reset_view and self.ax.has_data()
        xlim = self.ax.get_xlim() if manter_visao else None
        ylim = self.ax.get_ylim() if manter_visao else None

        layers_ativos = [
            self.layer_list.itemWidget(self.layer_list.item(i)).text()
            for i in range(self.layer_list.count())
            if self.layer_list.itemWidget(self.layer_list.item(i)).isChecked()
        ]

        # Limpa e redesenha
        self.ax.clear()
        draw_dxf(self.ax, self.dxf_entities, layers_ativos)
        for p1, p2, dist in self.medicoes_salvas:
            self.plot_medicao(p1, p2, dist)

        # Restaura a visão do usuário se necessário
        if manter_visao and xlim and ylim:
            self.ax.set_xlim(xlim)
            self.ax.set_ylim(ylim)
        else:
            self.ax.relim()
            self.ax.autoscale_view()

        self.ax.set_aspect('equal', adjustable='box')
        self.canvas.draw_idle()

    # Desenha medição (linhas e rótulos de distância)
    def plot_medicao(self, p1, p2, dist):
        x1, y1 = p1
        x2, y2 = p2
        self.ax.plot([x1, x2], [y1, y2], color='black', linewidth=2)
        self.ax.annotate(f"{dist:.2f} m", ((x1 + x2)/2, (y1 + y2)/2),
                         color='white', fontsize=10,
                         bbox=dict(boxstyle="round", fc="black", ec="black", alpha=0.8))
        self.ax.plot(x1, y1, 'o', color='black', markersize=6, zorder=11)
        self.ax.plot(x2, y2, 'o', color='black', markersize=6, zorder=11)

    # Botão: Reset View
    def reset_view(self):
        self.redesenhar(reset_view=True)

    # Evento: clique do mouse
    def on_mouse_press(self, event):
        if event.button != 1 or event.inaxes != self.ax:
            return
        self._selected_point = None

        # Verifica se clicou em algum ponto já medido
        for i, (p1, p2, _) in enumerate(self.medicoes_salvas):
            if self.ponto_proximo((event.xdata, event.ydata), p1):
                self._selected_point = (i, 0)
                break
            elif self.ponto_proximo((event.xdata, event.ydata), p2):
                self._selected_point = (i, 1)
                break

        # Se clicou em um ponto existente, prepara arrastar
        if self._selected_point:
            QApplication.setOverrideCursor(QCursor(Qt.ClosedHandCursor))
            return

        # Se modo medição está ativo
        if self.measurement_mode:
            if len(self.measurement_points) < 2:
                self.measurement_points.append((event.xdata, event.ydata))
                if len(self.measurement_points) == 2:
                    dist = math.dist(*self.measurement_points)
                    self.medicoes_salvas.append((self.measurement_points[0], self.measurement_points[1], dist))
                    self.measurement_points.clear()
                    xlim = self.ax.get_xlim()
                    ylim = self.ax.get_ylim()

                    self.redesenhar()

                    # Restaura os limites para manter a visão do usuário
                    self.ax.set_xlim(xlim)
                    self.ax.set_ylim(ylim)
                    self.canvas.draw_idle()
            return

        # Se não está medindo, ativa o pan
        self._is_panning = True
        self._pan_start = (event.xdata, event.ydata)
        QApplication.setOverrideCursor(QCursor(Qt.ClosedHandCursor))

    # Verifica se um ponto está próximo de outro (ex.: para arrastar)
    def ponto_proximo(self, p1, p2, tolerancia=5):
        if not p1 or not p2:
            return False
        dx = p1[0] - p2[0]
        dy = p1[1] - p2[1]
        return math.hypot(dx, dy) < tolerancia


    # Evento: mover o mouse

    def on_mouse_move(self, event):
        if event.inaxes != self.ax:
            return

        if self._selected_point is not None:
            i, idx = self._selected_point
            p1, p2, _ = self.medicoes_salvas[i]
            new_point = (event.xdata, event.ydata)
            if idx == 0:
                dist = math.dist(new_point, p2)
                self.medicoes_salvas[i] = (new_point, p2, dist)
            else:
                dist = math.dist(p1, new_point)
                self.medicoes_salvas[i] = (p1, new_point, dist)

            xlim = self.ax.get_xlim()
            ylim = self.ax.get_ylim()
            self.redesenhar()
            self.ax.set_xlim(xlim)
            self.ax.set_ylim(ylim)
            self.canvas.draw_idle()
            return

        if self._is_panning and event.xdata and event.ydata and self._pan_start:
            dx = self._pan_start[0] - event.xdata
            dy = self._pan_start[1] - event.ydata
            xlim = self.ax.get_xlim()
            ylim = self.ax.get_ylim()
            self.ax.set_xlim(xlim[0] + dx, xlim[1] + dx)
            self.ax.set_ylim(ylim[0] + dy, ylim[1] + dy)
            self.canvas.draw_idle()

    # Evento: soltar o mouse
    def on_mouse_release(self, event):
        self._is_panning = False
        self._pan_start = None
        self._selected_point = None
        QApplication.restoreOverrideCursor()

    # Evento: hover do mouse
    def on_hover(self, event):
        if not event.inaxes:
            QApplication.restoreOverrideCursor()
            return

        for p1, p2, _ in self.medicoes_salvas:
            if self.ponto_proximo((event.xdata, event.ydata), p1) or self.ponto_proximo((event.xdata, event.ydata), p2):
                QApplication.setOverrideCursor(QCursor(Qt.OpenHandCursor))
                return
        QApplication.restoreOverrideCursor()

    # Drag & Drop
    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self.drag_hover_active = True
            self.aplicar_estilo_hover_drag()

    def dragLeaveEvent(self, event):
        self.drag_hover_active = False
        self.aplicar_estilo_hover_drag()

    def dropEvent(self, event: QDropEvent):
        self.drag_hover_active = False
        self.aplicar_estilo_hover_drag()
        urls = event.mimeData().urls()
        if urls:
            file_path = urls[0].toLocalFile()
            if file_path.lower().endswith(".dxf"):
                self.carregar_dxf(file_path)

    def aplicar_estilo_hover_drag(self):
        self.ax.clear()

        if self.drag_hover_active:
            # Fundo escuro (ou pode manter #2d2d30)
            self.ax.set_facecolor("#2d2d30")

            import matplotlib.patches as patches
            # Retângulo pontilhado grande no centro
            rect = patches.Rectangle(
                (0.08, 0.25),  # canto inferior-esquerdo (em coordenadas Axes [0..1])
                0.84, 0.5,     # largura, altura
                transform=self.ax.transAxes,
                fill=False,
                edgecolor="#888",
                linewidth=2,
                linestyle="--"
            )
            self.ax.add_patch(rect)

            # Texto principal (frase chamativa)
            self.ax.text(
                0.5, 0.55,
                "SOLTE SEU ARQUIVO DXF AQUI",
                ha="center", va="center",
                fontsize=18, color="#DDD",
                transform=self.ax.transAxes,
                fontweight="bold"
            )

            # Texto secundário (complemento)
            self.ax.text(
                0.5, 0.48,
                "Ou clique em 'Selecionar DXF'",
                ha="center", va="center",
                fontsize=12, color="#AAA",
                transform=self.ax.transAxes
            )

        else:
            if not self.dxf_path:
                self.ax.set_facecolor("#2d2d30")
                self.ax.text(
                    0.5, 0.5,
                    "ARRASTE O ARQUIVO DXF AQUI\nOU CLIQUE EM 'SELECIONAR DXF'",
                    fontsize=16, color='grey', ha='center', va='center',
                    transform=self.ax.transAxes, alpha=0.7
                )
            else:
                # Se já há DXF carregado, redesenha o conteúdo normal
                self.redesenhar()
                return

        self.ax.axis("off")
        self.canvas.draw_idle()
    # Zoom via Scroll do mouse
    def ajustar_zoom(self, fator=1.1):
        xlim = self.ax.get_xlim()
        ylim = self.ax.get_ylim()
        x_center = (xlim[0] + xlim[1]) / 2
        y_center = (ylim[0] + ylim[1]) / 2
        x_range = (xlim[1] - xlim[0]) * fator / 2
        y_range = (ylim[1] - ylim[0]) * fator / 2
        self.ax.set_xlim([x_center - x_range, x_center + x_range])
        self.ax.set_ylim([y_center - y_range, y_center + y_range])
        self.canvas.draw_idle()

    # Alternar modo Medição
    def toggle_measurement_mode(self):
        self.measurement_mode = not self.measurement_mode
        self.measurement_points = []
        self._selected_point = None
        status = "🔧 Medindo..." if self.measurement_mode else "📏 Medir"
        self.ruler_button.setText(status)

    # Botão: Limpar Medições
    def limpar_medicoes(self):
        self.medicoes_salvas = []
        self.redesenhar()


def gerar_mapa_web(dxf_path: str, dados: dict):
    from ui.talhoes_parser import extrair_talhoes_por_proximidade, extrair_legenda_layers
    from ui.layout_generator import gerar_layout_final

    # Extrai dados (essas funções você já usa no app local)
    talhoes_dict = extrair_talhoes_por_proximidade(dxf_path, dados["distancia"])
    legenda_layers, entidades_exemplo = extrair_legenda_layers(dxf_path)

    # Simula o que viria do app
    layer_data = {}  # você pode calcular isso ou receber no frontend
    dados["entidades_exemplo"] = entidades_exemplo

    gerar_layout_final(
        dxf_file_path=dxf_path,
        layer_data=layer_data,
        talhoes_dict=talhoes_dict,
        legenda_layers=legenda_layers,
        dados=dados
    )


