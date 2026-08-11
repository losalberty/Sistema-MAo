import "./globals.css";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";

export const metadata = {
  title: "Sistema Save Notas",
  description: "Sistema de gestion propio - Notas de entrega",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900">
        <AuthGate>
          <Shell>{children}</Shell>
        </AuthGate>
      </body>
    </html>
  );
}
