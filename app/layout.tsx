// La fuente Inter viene dentro del propio sistema (paquete de npm).
// No depende de Google ni de internet: siempre se ve igual y el despliegue
// no se cae si un servicio externo falla.
import "@fontsource-variable/inter";
// letra del tema Dinamic: solo se descarga si alguien usa ese tema
import "@fontsource-variable/urbanist";
import "./globals.css";
// tema Dinamic: todas sus reglas empiezan con "html.dinamic", no tocan el Clásico
import "./dinamic.css";
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
        {/* modo oscuro y tema Dinamic: se aplican antes de pintar para que no haya parpadeo */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var h=document.documentElement;if(localStorage.getItem('tema')==='oscuro')h.classList.add('dark');if(localStorage.getItem('estilo')==='dinamic')h.classList.add('dinamic')}catch(e){}",
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
