import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions";

export async function Navbar() {
  const session = await getSession();

  if (!session) return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background brutal-shadow">
      <div className="container flex h-16 items-center px-4 mx-auto justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <span className="font-bold text-xl tracking-tighter text-primary">INVENTE 11.0</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/dashboard" className="transition-colors hover:text-primary">Dashboard</Link>
            <Link href="/orders" className="transition-colors hover:text-primary">Orders</Link>
            <Link href="/collection" className="transition-colors hover:text-primary">Collection</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm hidden sm:block">
            <span className="text-muted-foreground">Logged in as </span>
            <span className="font-bold">{session.user.name}</span>
          </div>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit">Logout</Button>
          </form>
        </div>
      </div>
    </header>
  );
}
