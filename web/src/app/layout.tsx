import { Providers } from './providers';
export const metadata = { title: 'CareerOS', description: 'Placeholder app' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
