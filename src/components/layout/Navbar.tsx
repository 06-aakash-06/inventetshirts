import Link from "next/link";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";

export async function Navbar() {
  const session = await getSession();

  if (!session) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b-2 border-border bg-background">
      <div className="container flex h-16 items-center px-4 mx-auto justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center">
            <span className="font-black text-xl tracking-tighter uppercase text-primary">INVENTE 11.0</span>
          </Link>
          <nav className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Link href="/dashboard" className="transition-colors hover:text-foreground">Dashboard</Link>
            <Link href="/orders" className="transition-colors hover:text-foreground">Orders</Link>
            <Link href="/collection" className="transition-colors hover:text-foreground">Distribution</Link>
          </nav>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-[10px] hidden sm:block uppercase tracking-widest font-bold text-muted-foreground">
            USER / <span className="text-foreground">{session.user.email}</span>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
