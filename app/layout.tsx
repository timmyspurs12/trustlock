import type { Metadata } from 'next';
import Link from 'next/link';
import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { Nav } from '@/components/Nav';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});
const body = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});
const code = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-code',
});

export const metadata: Metadata = {
  title: 'TrustLock — Programmable milestone payments',
  description:
    'Escrow-like milestone protection powered by PayPal authorization. Client funds are held, verified by AI against contractual acceptance criteria, and released only when the work is done.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${code.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 tl-btn-primary"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5" aria-label="TrustLock home">
              <svg width="27" height="27" viewBox="0 0 27 27" fill="none" aria-hidden="true">
                <rect width="27" height="27" rx="6.5" fill="#101F38" />
                <path d="M6.5 9.5h14" stroke="#F6F4EE" strokeWidth="2" strokeLinecap="round" />
                <path d="M6.5 13.5h8.5" stroke="#F6F4EE" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
                <path
                  d="M9 18l2.6 2.6L17.5 14.7"
                  stroke="#0070E0"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="font-display text-xl font-semibold tracking-tight">TrustLock</span>
              <span className="ml-0.5 hidden border-l border-line pl-2.5 text-sm text-ink-faint md:inline">
                Programmable milestone payments
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Nav />
              <Link href="/milestones/new" className="tl-btn-primary hidden sm:inline-flex">
                New milestone
              </Link>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-2 px-4 py-6 text-xs text-ink-faint sm:flex-row sm:px-6">
            <span>TrustLock runs on the PayPal Sandbox. No real money moves.</span>
            <span>
              A PayPal authorization hold is not regulated escrow — it is escrow-like milestone
              protection powered by PayPal authorization.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
