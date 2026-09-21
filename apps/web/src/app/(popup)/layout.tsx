import "@/app/globals.css";
import { ThemeProvider } from "@/shared/providers/theme-provider";
import { QueryProvider } from "@/shared/providers/query-provider";

export default function PopupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
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
