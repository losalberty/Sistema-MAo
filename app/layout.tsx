// La fuente Inter viene dentro del propio sistema (paquete de npm).
// No depende de Google ni de internet: siempre se ve igual y el despliegue
// no se cae si un servicio externo falla.
import "@fontsource-variable/inter";
import "./globals.css";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { AppToaster, ConfirmHost } from "@/components/ui";

export const metadata = {
  title: "Sistema Save Notas",
  description: "Sistema de gestion propio - Notas de entrega",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="font-sans">
        {/* modo oscuro: se aplica antes de pintar para que no haya parpadeo */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('tema')==='oscuro')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        <AuthGate>
          <Shell>{children}</Shell>
        </AuthGate>
        <AppToaster />
        <ConfirmHost />
      </body>
    </html>
  );
}
