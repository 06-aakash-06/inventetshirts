"use client"
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button 
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="px-4 py-2 text-xs font-black uppercase tracking-widest border-2 border-foreground hover:bg-foreground hover:text-background transition-colors duration-0"
    >
      Logout
    </button>
  );
}
