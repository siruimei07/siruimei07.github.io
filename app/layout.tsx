import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sirui Mei · Summer Profile",
  description: "Sirui Mei's GitHub-inspired personal homepage, cooled by a bright summer shoreline.",
  icons: {
    icon: "/assets/avatar.jpg",
    shortcut: "/assets/avatar.jpg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
