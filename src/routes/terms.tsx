import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: () => (
    <main className="mx-auto max-w-3xl p-6 sm:p-8">
      <h1 className="text-3xl font-bold tracking-tight">Terms</h1>
      <p className="mt-4 text-sm text-zinc-600">Terms and conditions placeholder.</p>
    </main>
  ),
});
