"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { ScrollProgress } from "~~/components/motion-primitives/scroll-progress";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    // reducedMotion="user": with the OS "reduce motion" setting on, every Motion transform/layout animation is
    // skipped (opacity fades stay). One switch here instead of a check in every component.
    <MotionConfig reducedMotion="user">
      <ScrollProgress className="fixed z-50 h-0.5 bg-lime" />
      <div className={`flex flex-col min-h-screen `}>
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </MotionConfig>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

// Dark only, so the wallet modal is themed once (no light first paint). CSS vars keep hex in globals.css only.
const baseRainbowTheme = darkTheme({
  accentColor: "var(--color-lime)",
  accentColorForeground: "var(--color-lime-ink)",
  borderRadius: "medium",
});
// RainbowKit's built-in error color is red; the design has no red, so errors use blush like the Blocked chip.
const rainbowTheme = {
  ...baseRainbowTheme,
  colors: { ...baseRainbowTheme.colors, error: "var(--color-blush)" },
};

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider avatar={BlockieAvatar} theme={rainbowTheme}>
          <ProgressBar height="3px" color="var(--color-lime)" />
          <ScaffoldEthApp>{children}</ScaffoldEthApp>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
