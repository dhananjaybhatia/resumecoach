import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import ConditionalNavbar from "@/components/ConditionalNavbar";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import UserSyncer from "@/components/userSyncer";
import SupabaseProvider from "@/lib/supabase-provider"; // Import the Supabase provider

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resume AI",
  description: "Resume AI Analyser",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Ensure pages render from top
              if (typeof window !== 'undefined') {
                window.scrollTo(0, 0);
              }
            `,
          }}
        />
      </head>
      <body className={`${bricolage.variable} antialiased`}>
        <ClerkProvider
          appearance={{
            variables: { colorPrimary: "#fe5933" },
            elements: {
              formButtonPrimary: "bg-orange-500 hover:bg-orange-600 text-white",
              footerActionLink: "text-orange-500 hover:text-orange-600",
              card: "shadow-lg border border-gray-200",
              headerTitle: "text-gray-800",
              headerSubtitle: "text-gray-600",
              formFieldInput: "border-gray-300 focus:border-orange-500",
              formFieldLabel: "text-gray-700",
              socialButtonsBlockButton: "border-gray-300 hover:bg-gray-50",
              socialButtonsBlockButtonText: "text-gray-700",
            },
          }}
        >
          <SupabaseProvider>
            <UserSyncer />
            <ConditionalNavbar />
            {children}
            <Toaster
              position="top-right"
              richColors
              closeButton
              duration={5000}
              expand={true}
              theme="light"
              swipeDirections={["right"]}
            />
          </SupabaseProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
