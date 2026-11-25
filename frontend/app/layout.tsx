import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/hooks/useAuth";
import { SettingsProvider } from "@/hooks/useSettings";
import { ToastProvider } from "@/hooks/useToast";

export const metadata: Metadata = {
  title: "ArchOpt — Intelligent Architectural Space & Circulation Optimizer",
  description: "Generate and analyse optimised architectural floor-plan layouts.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <SettingsProvider>
            <AuthProvider>{children}</AuthProvider>
          </SettingsProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
