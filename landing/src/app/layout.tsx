import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-body',
  subsets: ['latin'],
  display: 'swap',
});

const grotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Linky — Le marché et l\'immobilier en Guinée',
    template: '%s · Linky',
  },
  description:
    'Linky est l\'application qui réunit le marché en ligne et l\'immobilier en Guinée. Paiement sécurisé via Mobile Money, escrow, vendeurs vérifiés, et un fil Découvrir TikTok-style.',
  applicationName: 'Linky',
  keywords: [
    'marketplace Guinée',
    'immobilier Conakry',
    'Orange Money paiement',
    'application Linky',
    'acheter vendre Guinée',
  ],
  openGraph: {
    title: 'Linky — Le marché et l\'immobilier en Guinée',
    description:
      'Achète, vends et trouve un logement en Guinée en toute sécurité. Paiement Mobile Money, escrow, vendeurs vérifiés.',
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Linky',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Linky',
    description: 'Le marché et l\'immobilier en Guinée.',
  },
  icons: {
    icon: '/images/icon.png',
    apple: '/images/icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0e6e55',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} ${grotesk.variable}`}>
      <body className="min-h-screen bg-bg text-text font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
