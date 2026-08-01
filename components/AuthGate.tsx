"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError("Usuario o clave incorrectos.");
  }

  // Todavia no sabemos si hay sesion (evita parpadeo del formulario de login)
  if (session === undefined) {
    return null;
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-medium text-center mb-1 tracking-tight">
            SISTEMA SAVE NOTAS
          </h1>
          <p className="text-sm text-gray-500 text-center mb-8">Inicia sesion para continuar</p>
          <form
            onSubmit={handleLogin}
            className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 shadow-sm"
          >
            <div>
              <label className="text-xs text-gray-500 block mb-1">Usuario (correo)</label>
              <input
                type="email"
                required
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Clave</label>
              <input
                type="password"
                required
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 text-white text-sm px-4 py-2 rounded-md disabled:opacity-40"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
