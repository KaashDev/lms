import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LMS",
  description: "Self-hosted learning management",
  // No tracking, no third-party fonts beyond what we explicitly load.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fraunces.variable} suppressHydrationWarning>
      <body>
        {/* Skip-to-main is required for keyboard users; it's invisible until
            focused. Critical for screen reader nav. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
