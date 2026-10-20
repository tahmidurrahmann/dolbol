import type { Metadata, Viewport } from "next";
import { Anek_Bangla } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Container } from "@/components/Container";
import { Header } from "@/components/Header";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Analytics } from "@vercel/analytics/next";
import { BRAND } from "@/config/brand";
import { ACTIVE_LANDING_META } from "@/config/seo";
import type { SupportedLocale } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
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
  themeColor: BRAND.themeColor,
  colorScheme: "light",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as SupportedLocale;
  const isBn = locale === "bn";
  const brandName = BRAND.name[isBn ? "bn" : "en"];
  const meta = ACTIVE_LANDING_META[isBn ? "bn" : "en"];
  const ogLocale = isBn ? "bn_BD" : "en_US";
  const siteUrl = getSiteUrl();

  return {
    metadataBase: siteUrl,
    title: {
      default: meta.title,
      template: `%s | ${brandName}`,
    },
    description: meta.description,
    applicationName: brandName,
    alternates: {
      canonical: "/",
    },
    openGraph: {
      type: "website",
      siteName: brandName,
      title: meta.title,
      description: meta.description,
      url: siteUrl.toString(),
      locale: ogLocale,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: brandName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: ["/og-image.png"],
    },
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
              <ServiceWorkerRegister />
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
