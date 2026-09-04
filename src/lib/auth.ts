import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import headEmailsConfig from "@/config/head-emails.json";

export async function getSession() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const email = session.user?.email || "";
  const isHead = headEmailsConfig.headEmails.includes(email);

  return {
    user: {
      name: session.user?.name || "User",
      email,
      // Only heads get admin access (e.g. bulk QR email send); everyone else in
      // allowed-emails.json can still log in but sees a members-only dashboard.
      role: isHead ? "admin" : "member"
    }
  };
}
