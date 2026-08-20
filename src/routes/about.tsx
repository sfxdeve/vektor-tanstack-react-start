import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-8">
      <Link to="/" data-testid="about-back-home" className="text-sm underline underline-offset-2">
        ← Back home
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">About Vektor</h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-600">
        Vektor is SA Tender Co-Pilot for construction contractors.
      </p>
      <section className="mt-8">
        <h2 className="text-xl font-bold">Bargaining Councils</h2>
        <p className="mt-2 text-sm text-zinc-600">
          BCCEI (CE), NBCEI (EB/EP), MEIBC (ME), and regional BIBCs for GB.
        </p>
        <a
          href="https://registers.cidb.org.za"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="about-cidb-link"
          className="mt-2 inline-block text-sm font-semibold underline underline-offset-2"
        >
          Verify at CIDB Register
        </a>
      </section>
    </main>
  );
}
