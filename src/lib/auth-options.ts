import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import allowedEmailsConfig from "@/config/allowed-emails.json";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (user.email && allowedEmailsConfig.allowedEmails.includes(user.email)) {
        return true;
      }
      return false; // Deny login if email is not in the allowed list
    },
    async session({ session }) {
      return session;
    }
  },
  pages: {
    signIn: "/login",
    error: "/login", // Redirect to login on error (e.g. access denied)
  },
  secret: process.env.NEXTAUTH_SECRET,
};
