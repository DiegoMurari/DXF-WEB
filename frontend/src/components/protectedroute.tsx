// src/components/protectedroute.tsx
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      } else {
        setSession(session);
      }
      setIsLoading(false);
    });
  }, []);

  if (isLoading) return <div className="p-4">Carregando...</div>;

  return session ? <>{children}</> : null;
}
