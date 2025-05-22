// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import ProtectedRoute from "./components/protectedroute";
import ServicosList from "./pages/ServicosList";
import Mapas from "./pages/Mapas";
import UploadDXF from "./pages/UploadDXF";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Redireciona '/' para '/login' */}
        <Route path="/" element={<Navigate to="/login" />} />

        {/* Tela de login */}
        <Route path="/login" element={<Login />} />

        {/* Rota protegida */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/servicos"
          element={
            <ProtectedRoute>
              <ServicosList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mapas"
          element={
            <ProtectedRoute>
              <Mapas />
            </ProtectedRoute>
          }
        />

        <Route
          path="/upload-dxf"
          element={
            <ProtectedRoute>
              <UploadDXF />
            </ProtectedRoute>
          }
        />
        {/* Qualquer rota inválida */}
        <Route path="*" element={<div className="p-4">Página não encontrada</div>} />
      </Routes>
    </Router>
  );
}
