import type { Metadata, Viewport } from "next";
import { Anek_Bangla } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Container } from "@/components/Container";
import { Header } from "@/components/Header";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const anekBangla = Anek_Bangla({
  subsets: ["bengali", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-anek-bangla",
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
    other: {
      google: "notranslate",
    },
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
      translate="no"
      className={`notranslate ${anekBangla.variable}`}
    >
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body
        translate="no"
        suppressHydrationWarning
        className="notranslate flex min-h-dvh flex-col bg-[var(--color-bg)] text-base text-[var(--color-fg)] antialiased"
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
            <Container className="flex flex-1 flex-col">
              {children}
              <Analytics />
            </Container>
          </main>
          <footer className="border-t border-[var(--color-border)] py-5">
            <Container>
              <p className="text-center text-sm text-neutral-400">
                {t("footer")}
              </p>
            </Container>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
