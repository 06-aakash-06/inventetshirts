"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    // Console log Easter Egg
    const asciiArt = `
██╗███╗   ██╗██╗   ██╗███████╗███╗   ██╗████████╗███████╗
██║████╗  ██║██║   ██║██╔════╝████╗  ██║╚══██╔══╝██╔════╝
██║██╔██╗ ██║██║   ██║█████╗  ██╔██╗ ██║   ██║   █████╗
██║██║╚██╗██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║   ██║   ██╔══╝
██║██║ ╚████║ ╚████╔╝ ███████╗██║ ╚████║   ██║   ███████╗
╚═╝╚═╝  ╚═══╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝

                    '26
`;
    console.log("%c" + asciiArt, "color: #eab308; font-weight: bold;");
    console.log("%cIf you are looking here, you are either a creep or trying to break my app. So goodbye. -Aakash", "color: #ffffff; background: #000000; padding: 4px; font-size: 14px;");
  }, []);

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

        <div 
          className="mt-auto p-8 flex flex-col cursor-crosshair"
          onClick={() => setShowBarcode(!showBarcode)}
        >
          <div className={`overflow-hidden transition-all duration-500 ease-in-out flex items-center ${showBarcode ? 'max-h-10 opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0'}`}>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] whitespace-nowrap text-foreground">Engineered by Aakash</span>
          </div>
          <div className="flex items-end gap-1 h-6">
            <div className={`w-1 h-6 bg-foreground transition-all duration-300 ${showBarcode ? 'opacity-100' : 'opacity-20'}`}></div>
            <div className={`w-2 h-6 bg-foreground transition-all duration-300 delay-75 ${showBarcode ? 'opacity-100' : 'opacity-20'}`}></div>
            <div className={`w-1 h-6 bg-foreground transition-all duration-300 delay-100 ${showBarcode ? 'opacity-100' : 'opacity-20'}`}></div>
            <div className={`w-0.5 h-6 bg-foreground transition-all duration-300 ${showBarcode ? 'opacity-100' : 'opacity-20'}`}></div>
            <div className={`w-3 h-6 bg-foreground transition-all duration-300 delay-150 ${showBarcode ? 'opacity-100' : 'opacity-20'}`}></div>
            <div className={`w-1.5 h-6 bg-foreground transition-all duration-300 ${showBarcode ? 'opacity-100' : 'opacity-20'}`}></div>
            <div className={`w-0.5 h-6 bg-foreground transition-all duration-300 delay-75 ${showBarcode ? 'opacity-100' : 'opacity-20'}`}></div>
            <div className={`w-2 h-6 bg-foreground transition-all duration-300 delay-200 ${showBarcode ? 'opacity-100' : 'opacity-20'}`}></div>
          </div>
        </div>
      </div>
    </div>
  );
}
