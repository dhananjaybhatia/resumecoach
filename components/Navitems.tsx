"use client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  {
    label: "Resume",
    href: "/resume",
  },
  {
    label: "Subscription",
    href: "/subscription",
  },
];

interface NavitemsProps {
  mobile?: boolean;
}

const Navitems = ({ mobile = false }: NavitemsProps) => {
  const pathName = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav
      className={cn(
        mobile ? "flex flex-col space-y-2" : "flex items-center gap-4"
      )}
    >
      {navItems.map(({ label, href }) => (
        <Link
          href={href}
          key={label}
          className={cn(
            "text-gray-800 transition-colors hover:text-orange-500",
            mounted && pathName === href && "text-orange-500 font-semibold",
            mobile ? "text-lg py-2 px-3 rounded-lg hover:bg-white/10" : ""
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
};

export default Navitems;
