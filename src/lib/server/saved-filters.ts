import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { savedFilters } from "@/db/schema";
import { HttpError } from "./authz";
import type { Actor } from "./access";

export type SavedFilterInput = {
  name: string;
  filters: { query: string; type: "all" | "week" | "day" | "gate"; status: string; assigneeId: string };
};

const columns = { id: savedFilters.id, name: savedFilters.name, filters: savedFilters.filters };

export async function listSavedFilters(actor: Actor) {
  return db.select(columns).from(savedFilters).where(eq(savedFilters.userId, actor.id)).orderBy(asc(savedFilters.createdAt));
}

export async function saveFilter(actor: Actor, input: SavedFilterInput) {
  const [row] = await db.insert(savedFilters).values({ userId: actor.id, name: input.name, nameKey: input.name.toLocaleLowerCase("id-ID"), filters: input.filters })
    .onConflictDoUpdate({ target: [savedFilters.userId, savedFilters.nameKey], set: { name: input.name, filters: input.filters, updatedAt: new Date() } })
    .returning(columns);
  return row;
}

export async function deleteSavedFilter(actor: Actor, id: string) {
  const [row] = await db.delete(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, actor.id))).returning({ id: savedFilters.id });
  if (!row) throw new HttpError(404, "Saved filter not found");
  return row;
}
