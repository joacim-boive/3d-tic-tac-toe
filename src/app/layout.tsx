import type { Metadata, Viewport } from "next";
import { AppUpdateBanner } from "@/ui/AppUpdateBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voxel Toe — 3D Tic-Tac-Toe",
  description: "Mobile-first 3D tic-tac-toe. Spin the cube, place coral and cyan.",
  applicationName: "Voxel Toe",
  appleWebApp: {
    capable: true,
    title: "Voxel Toe",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0e141b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppUpdateBanner />
        {children}
      </body>
    </html>
  );
}
