import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-xl font-medium mb-1">Buenos dias, Mao</h1>
      <p className="text-sm text-gray-500 mb-6">Panel general</p>
      <Link
        href="/notas/nueva"
        className="inline-block bg-gray-900 text-white text-sm px-4 py-2 rounded-md"
      >
        + Nueva nota
      </Link>
    </main>
  );
}
