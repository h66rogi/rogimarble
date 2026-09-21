import type { Metadata } from 'next';
import { nanumSquareNeo } from './fonts';
import { QueryProvider } from '@/shared/providers/query-provider';
import { ThemeProvider } from '@/shared/providers/theme-provider';
import '../src/app/globals.css';
import './legacy-surfaces.css';
import './board-surface.css';

export const metadata: Metadata = {
  title: '주루마블 운영 콘솔',
  description: '방송용 주루마블 운영 및 OBS 화면',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={nanumSquareNeo.variable} suppressHydrationWarning>
      <body className="font-sans">
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
