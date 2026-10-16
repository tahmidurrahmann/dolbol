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
    title: { default: t("name"), template: `%s | ${t("name")}` },
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
  const bn = locale === "bn";

  return (
    <html
      lang={locale}
      className={`${notoSansBengali.variable} ${inter.variable}`}
    >
      <body
        suppressHydrationWarning
        className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-base text-[var(--color-fg)] antialiased"
      >
        {/* Lets keyboard users skip the header */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          {bn ? "মূল অংশে যান" : "Skip to content"}
        </a>

        <NextIntlClientProvider locale={locale} messages={messages}>
          <Header />
          <main id="main" className="flex flex-1 flex-col py-4 sm:py-6">
            <Container className="flex flex-1 flex-col">{children}</Container>
          </main>
          <footer className="border-t border-[var(--color-border)] py-5">
            <Container>
              <p className="text-center text-sm text-[var(--color-fg-muted)]">
                {t("footer")}
              </p>
            </Container>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
