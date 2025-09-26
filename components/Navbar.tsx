"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import Navitems from "./Navitems";

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

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

          {/* Desktop Navigation Items */}
          <div className="hidden md:block">
            <Navitems />
          </div>

          {/* Desktop Auth */}
          <div className="hidden md:flex items-center">
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

          {/* Mobile Auth */}
          <div className="md:hidden flex items-center">
            <SignedOut>
              <SignInButton>
                <button className="inline-flex items-center px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full cursor-pointer transition-all duration-300 text-sm">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              {/* Mobile Menu Button - Only show when signed in */}
              <button
                onClick={toggleMobileMenu}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6 text-gray-600" />
                ) : (
                  <Menu className="h-6 w-6 text-gray-600" />
                )}
              </button>
            </SignedIn>
          </div>
        </nav>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-2 bg-white/95 backdrop-blur rounded-2xl border border-gray-300 shadow-lg">
            <div className="px-4 py-4 space-y-4">
              {/* Mobile Navigation Items */}
              <div className="space-y-2">
                <Navitems mobile={true} />
              </div>

              {/* Mobile Auth */}
              <div className="pt-4 border-t border-gray-200">
                <SignedOut>
                  <SignInButton>
                    <button className="w-full inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-full cursor-pointer transition-all duration-300">
                      Sign In
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <div className="flex items-center justify-center">
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "w-10 h-10",
                          userButtonPopoverCard:
                            "shadow-lg border border-gray-200",
                        },
                      }}
                    />
                  </div>
                </SignedIn>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
