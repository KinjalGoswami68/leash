import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "@scaffold-ui/components/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

// next/font self-hosts the font files at build time, so no runtime call to Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
// Sora for headings: geometric, a bit more character than Inter, so headings don't read as a template.
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata = getMetadata({
  title: "Leash",
  description: "The AI got hacked. The money didn't.",
});

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    // data-theme + color-scheme set in the server HTML so the very first paint is dark (no light flash before JS).
    <html
      suppressHydrationWarning
      data-theme="dark"
      style={{ colorScheme: "dark" }}
      className={`${inter.variable} ${jetbrains.variable} ${sora.variable}`}
    >
      <head>
        {/* Our UI is already dark; stop the Dark Reader extension from repainting it (and breaking hydration). */}
        <meta name="darkreader-lock" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body>
        {/* Dark theme only, per the design spec: no system preference, no toggle. */}
        <ThemeProvider forcedTheme="dark" defaultTheme="dark" enableSystem={false}>
          <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default ScaffoldEthApp;
