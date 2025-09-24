// web/src/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CareerOS',
  description: 'Your job hunt, organized.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="min-h-screen bg-white text-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
