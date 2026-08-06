import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sirui Mei · Summer Profile",
  description: "Sirui Mei's GitHub-inspired personal homepage, cooled by a bright summer shoreline.",
  referrer: "strict-origin-when-cross-origin",
  icons: {
    icon: "/assets/avatar.jpg",
    shortcut: "/assets/avatar.jpg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/assets/avatar.jpg" as="image" fetchPriority="high" />
        <link rel="preload" href="/assets/contribution-sweeper.gif" as="image" fetchPriority="high" />
      </head>
      <body>{children}</body>
    </html>
  );
}
