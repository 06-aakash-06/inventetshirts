"use client"
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md border-2 border-border bg-background flex flex-col">
        <div className="p-6 md:p-8 border-b-2 border-border bg-background">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase leading-none mb-2 text-primary">INVENTE 11.0</h1>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Logistics & Operations Portal
          </p>
        </div>
        <div className="p-6 md:p-8 flex flex-col space-y-6">
          {error === "AccessDenied" && (
            <div className="p-4 border-2 border-destructive bg-destructive/10 text-destructive text-xs font-bold uppercase tracking-widest text-center">
              Access Denied: Unapproved Email
            </div>
          )}
          {error && error !== "AccessDenied" && (
            <div className="p-4 border-2 border-destructive bg-destructive/10 text-destructive text-xs font-bold uppercase tracking-widest text-center">
              Authentication Error. Please try again.
            </div>
          )}
          
          <button 
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="w-full h-16 flex items-center justify-center space-x-4 border-2 border-foreground font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors duration-300"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-4"><div className="text-xl font-black uppercase tracking-widest animate-pulse">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
