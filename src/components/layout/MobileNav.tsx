"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [isOpen]);

  const toggle = () => setIsOpen(!isOpen);

  return (
    <div className="md:hidden flex items-center ml-4">
      <button 
        onClick={toggle} 
        className="p-1 text-foreground hover:text-primary transition-colors focus:outline-none"
        aria-label="Toggle menu"
      >
        <Menu className="w-8 h-8" />
      </button>

      {/* Backdrop */}
      <div 
        className={`fixed inset-0 z-40 bg-foreground/10 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div 
        className={`fixed top-0 right-0 bottom-0 z-50 w-64 sm:w-80 bg-background border-l-2 border-border shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="h-16 flex items-center justify-end px-4 border-b-2 border-border">
          <button 
            onClick={toggle} 
            className="p-1 text-foreground hover:text-primary transition-colors focus:outline-none"
            aria-label="Close menu"
          >
            <X className="w-8 h-8" />
          </button>
        </div>
        
        <nav className="flex flex-col p-8 gap-8 text-xl font-black uppercase tracking-widest text-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-primary hover:underline underline-offset-8 block w-full">Dashboard</Link>
          <Link href="/orders" className="transition-colors hover:text-primary hover:underline underline-offset-8 block w-full">Orders</Link>
          <Link href="/collection" className="transition-colors hover:text-primary hover:underline underline-offset-8 block w-full">Distribution</Link>
        </nav>
      </div>
    </div>
  );
}
