"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

const ConditionalNavbar = () => {
  const pathname = usePathname();

  // Hide navbar on home page
  if (pathname === "/") {
    return null;
  }

  return <Navbar />;
};

export default ConditionalNavbar;
