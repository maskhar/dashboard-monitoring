import { compare } from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import NextAuth, { type NextAuthConfig, type User } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { db } from "@/db";
import { users } from "@/db/schema";
import { validateProductionEnvironment } from "@/lib/server/env";

validateProductionEnvironment();

const demoEnabled = process.env.AUTH_MODE !== "production" && process.env.AUTH_DEMO_ENABLED !== "false";
const providers: NextAuthConfig["providers"] = [];

if (demoEnabled) {
  providers.push(
    Credentials({
      name: "Email dan password",
      credentials: { email: {}, password: { type: "password" } },
      async authorize(credentials): Promise<User | null> {
        const email = String(credentials.email ?? "").toLowerCase();
        const password = String(credentials.password ?? "");
        const demoUsers: Array<User & { password: string }> = [
          {
            id: "00000000-0000-4000-8000-000000000001",
            email: process.env.DEMO_ADMIN_EMAIL ?? "admin@utero.local",
            password: process.env.DEMO_ADMIN_PASSWORD ?? "admin123",
            name: "Demo Admin",
            role: "ADMIN",
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            email: process.env.DEMO_STAFF_EMAIL ?? "staff@utero.local",
            password: process.env.DEMO_STAFF_PASSWORD ?? "staff123",
            name: "Demo Staff",
            role: "STAFF",
          },
        ];
        const demoUser = demoUsers.find((candidate) => candidate.email === email && candidate.password === password);
        if (demoUser) {
          return { id: demoUser.id, email: demoUser.email, name: demoUser.name, role: demoUser.role };
        }
        if (!process.env.DATABASE_URL) return null;
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user?.passwordHash || user.status !== "ACTIVE") return null;
        if (!(await compare(password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  trustHost: true,
  callbacks: {
    authorized({ auth: session }) {
      return Boolean(session?.user);
    },
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      if (!process.env.DATABASE_URL || !user.email || profile?.email_verified !== true || !account.providerAccountId) return false;
      const [knownUser] = await db.select().from(users).where(eq(users.email, user.email.toLowerCase())).limit(1);
      if (knownUser?.status !== "ACTIVE") return false;
      if (knownUser.googleSubject) return knownUser.googleSubject === account.providerAccountId;
      const [bound] = await db.update(users).set({ googleSubject: account.providerAccountId }).where(and(eq(users.id, knownUser.id), isNull(users.googleSubject))).returning({ id: users.id });
      if (bound) return true;
      const [current] = await db.select({ googleSubject: users.googleSubject }).from(users).where(eq(users.id, knownUser.id)).limit(1);
      return current?.googleSubject === account.providerAccountId;
    },
    async jwt({ token, user }) {
      if (!user) return token;
      token.id = user.id;
      token.role = user.role ?? "STAFF";
      if (process.env.DATABASE_URL && user.email && !user.role) {
        const [knownUser] = await db.select().from(users).where(eq(users.email, user.email.toLowerCase())).limit(1);
        if (knownUser) {
          token.id = knownUser.id;
          token.role = knownUser.role;
        }
      }
      return token;
    },
    session({ session, token }) {
      Object.assign(session.user, { id: token.id, role: token.role });
      return session;
    },
  },
});



