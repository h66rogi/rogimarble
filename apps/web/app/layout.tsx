import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '주루마블 운영 콘솔',
  description: '방송용 주루마블 운영 및 OBS 화면',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
