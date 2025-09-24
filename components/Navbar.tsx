// components/Navbar.tsx
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

const Navbar = () => {
  return (
    <header className="relative z-50 w-full">
      <div className="mx-auto max-w-screen-xl px-3 sm:px-6 lg:px-8 pt-2 sm:pt-3">
        <nav
          className="flex items-center justify-between gap-3
                     bg-white/90 backdrop-blur rounded-full border border-gray-300
                     px-4 sm:px-6 md:px-10 py-2 sm:py-2"
        >
          {/* brand */}
          <Link href="/" className="shrink-0">
            <span className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
              RESUMECOACH
            </span>
          </Link>

          {/* Clerk Auth */}
          <div className="flex items-center">
            <SignedOut>
              <SignInButton>
                <button className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full cursor-pointer transition-all duration-300 transform hover:scale-105">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "w-8 h-8 sm:w-9 sm:h-9",
                    userButtonPopoverCard: "shadow-lg border border-gray-200",
                  },
                }}
              />
            </SignedIn>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
