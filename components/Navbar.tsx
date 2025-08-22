import Image from "next/image";
import Link from "next/link";
import Navitems from "./Navitems";
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
  // SignOutButton, // optional if you want a separate sign-out button
} from "@clerk/nextjs";

const Navbar = () => {
  return (
    <nav className="navbar">
      <Link href="/" className="flex items-center gap-2.5 cursor-pointer">
        <Image src="/images/logo.svg" alt="logo" width={46} height={46} />
      </Link>

      <div className="flex items-center gap-8">
        <Navitems />

        <SignedOut>
          {/* mode="modal" opens a modal; omit for redirect to /sign-in */}
          <SignInButton>
            <button className="btn-signin"> Sign In</button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </nav>
  );
};

export default Navbar;
