import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function getSession() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  
  return {
    user: {
      name: session.user?.name || "User",
      email: session.user?.email || "",
      role: "admin" // All approved users are granted admin access
    }
  };
}
