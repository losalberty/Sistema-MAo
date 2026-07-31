import "./globals.css";

export const metadata = {
  title: "Sistema Mao",
  description: "Sistema de gestion propio - Notas de entrega",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
