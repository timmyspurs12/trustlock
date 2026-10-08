import type { Metadata } from 'next';

/**
 * Deterministic demo fixture: a real, inspectable "client website" that the
 * TrustLock AI agent can genuinely verify against the demo milestone's
 * acceptance criteria. The evidence fetcher retrieves this page server-side
 * and the agent evaluates the criteria from the extracted content.
 */
export const metadata: Metadata = {
  title: 'Sunrise Bakery — Fresh bread every morning',
  description: 'Sunrise Bakery — artisan bread, pastries, and cakes. About, Menu, Visit Us, and Contact.',
};

export default function DemoDeliverablePage() {
  return (
    <div className="min-h-screen bg-[#FFF8EE] text-slate-900">
      <header className="bg-[#7C4A21] text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="text-xl font-bold tracking-tight">Sunrise Bakery</div>
          <nav className="flex gap-6 text-sm">
            <a href="#about" className="hover:underline">About</a>
            <a href="#menu" className="hover:underline">Menu</a>
            <a href="#visit" className="hover:underline">Visit Us</a>
            <a href="#contact" className="hover:underline">Contact</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-[#7C4A21]">Sunrise Bakery</h1>
          <p className="mt-4 text-lg text-slate-700">Fresh bread every morning — baked on-site since 2012.</p>
        </section>

        <section id="about" className="mx-auto max-w-4xl px-6 py-10">
          <h2 className="text-2xl font-bold text-[#7C4A21]">About</h2>
          <p className="mt-3 text-slate-700">
            Sunrise Bakery is a family-run bakery. We mill our own flour, use slow fermentation, and bake in
            small batches throughout the day so every loaf is fresh when it reaches you.
          </p>
        </section>

        <section id="menu" className="mx-auto max-w-4xl px-6 py-10">
          <h2 className="text-2xl font-bold text-[#7C4A21]">Menu</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            <li className="rounded-lg bg-white p-4 shadow-sm"><strong>Sourdough Loaf</strong> — $8</li>
            <li className="rounded-lg bg-white p-4 shadow-sm"><strong>Croissant</strong> — $4</li>
            <li className="rounded-lg bg-white p-4 shadow-sm"><strong>Cinnamon Roll</strong> — $5</li>
            <li className="rounded-lg bg-white p-4 shadow-sm"><strong>Carrot Cake Slice</strong> — $6</li>
          </ul>
        </section>

        <section id="visit" className="mx-auto max-w-4xl px-6 py-10">
          <h2 className="text-2xl font-bold text-[#7C4A21]">Visit Us</h2>
          <p className="mt-3 text-slate-700">
            12 Harbour Lane, Old Town. Open Tuesday to Sunday, 7am–6pm. Free coffee with every loaf before 9am.
          </p>
        </section>

        <section id="contact" className="mx-auto max-w-4xl px-6 py-10">
          <h2 className="text-2xl font-bold text-[#7C4A21]">Contact</h2>
          <form className="mt-4 space-y-3 rounded-lg bg-white p-6 shadow-sm" action="#" method="post">
            <div>
              <label htmlFor="name" className="block text-sm font-medium">Name</label>
              <input id="name" name="name" type="text" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium">Email</label>
              <input id="email" name="email" type="email" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium">Message</label>
              <textarea id="message" name="message" rows={4} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <button type="submit" className="rounded-md bg-[#7C4A21] px-4 py-2 text-sm font-medium text-white hover:bg-[#5f3817]">
              Send message
            </button>
          </form>
        </section>
      </main>

      <footer className="bg-[#7C4A21] py-6 text-center text-sm text-white">
        © {new Date().getFullYear()} Sunrise Bakery · 12 Harbour Lane, Old Town
      </footer>
    </div>
  );
}
