import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Bengali } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Container } from "@/components/Container";
import { Header } from "@/components/Header";
import "./globals.css";

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-bengali",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f6b4a",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: t("name"),
    description: t("tagline"),
  };
}

interface RootLayoutProps {
  children: ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("app");

  return (
    <html
      lang={locale}
      className={`${notoSansBengali.variable} ${inter.variable}`}
    >
      <body className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-base text-[var(--color-fg)]">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Header />
          <main className="flex flex-1 flex-col py-6">
            <Container className="flex flex-1 flex-col">{children}</Container>
          </main>
          <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-4">
            <Container>
              <p className="text-center text-base text-[var(--color-fg-muted)]">
                {t("footer")}
              </p>
            </Container>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
