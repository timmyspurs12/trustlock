import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrustLock — escrow-like milestone protection powered by PayPal authorization',
  description:
    'TrustLock holds client funds in a PayPal authorization until AI-verified work is delivered. Funds are held, not captured.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F7F5F0] text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              TrustLock
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-slate-600 hover:text-slate-900">
                Milestones
              </Link>
              <Link
                href="/milestones/new"
                className="rounded-md bg-[#0070E0] px-3 py-1.5 font-medium text-white hover:bg-[#005ea6]"
              >
                New milestone
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-6 pb-8 text-xs text-slate-400">
          TrustLock runs on the PayPal Sandbox. No real money moves. An authorization hold is not regulated
          escrow — it is escrow-like milestone protection powered by PayPal authorization.
        </footer>
      </body>
    </html>
  );
}
