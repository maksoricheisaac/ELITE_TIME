import {
  getAuthenticatedUser,
  getUserPermissions,
  type AuthContext,
} from "@/lib/security/rbac";
import { navigationRegistry, type NavigationItem } from "@/lib/navigation-registry";
import { redirect } from "next/navigation";

const registryItems: NavigationItem[] = navigationRegistry.flatMap((g) => g.items);

function resolveItemById(id: string): NavigationItem | undefined {
  return registryItems.find((item) => item.id === id);
}

function resolveItemsByPath(pathname: string): NavigationItem[] {
  return registryItems.filter(
    (item) => item.to === pathname || pathname.startsWith(item.to + "/"),
  );
}

/**
 * Vérifie si un utilisateur peut accéder à un item de navigation.
 *
 * Règles :
 *   • requiredPermissions défini → l'utilisateur doit en avoir AU MOINS UNE
 *   • requiredPermissions absent → accessible à tout utilisateur authentifié
 *   • excludeWhenHasAny défini → masqué si l'utilisateur possède l'une d'elles
 *     (ex : "Mes pointages" masqué quand l'utilisateur a l'accès équipe)
 */
function canAccess(item: NavigationItem, permissionSet: Set<string>): boolean {
  // Exclure si l'utilisateur possède l'une des permissions de remplacement
  if (item.excludeWhenHasAny?.some((p) => permissionSet.has(p))) return false;

  const required = item.requiredPermissions ?? [];
  if (required.length === 0) return true;
  return required.some((p) => permissionSet.has(p));
}

// ── helpers internes ──────────────────────────────────────────────────────────

async function resolvePermissions(auth: AuthContext): Promise<Set<string>> {
  const raw = await getUserPermissions(auth.user.id);
  return new Set<string>(raw);
}

/**
 * Exige l'authentification et, si un item est fourni, la permission correspondante.
 * Retourne toujours un AuthContext. Redirige vers /403 ou /login selon le cas.
 * Ne retourne JAMAIS undefined — TypeScript + runtime garantis.
 */
async function resolveAccess(item?: NavigationItem): Promise<AuthContext> {
  let auth: AuthContext;

  try {
    auth = await getAuthenticatedUser();
  } catch {
    redirect("/login");
    // Ligne morte — redirect() lance toujours une exception NEXT_REDIRECT
    // mais TypeScript ne le sait pas, donc on force le type.
    throw new Error("unreachable");
  }

  if (!item) return auth;

  let permissionSet: Set<string>;
  try {
    permissionSet = await resolvePermissions(auth);
  } catch {
    redirect("/403");
    throw new Error("unreachable");
  }

  if (!canAccess(item, permissionSet)) {
    redirect("/403");
    throw new Error("unreachable");
  }

  return auth;
}

// ── API publique ──────────────────────────────────────────────────────────────

/**
 * Guard pour une page identifiée par son id dans le registry.
 * Retourne l'AuthContext si autorisé, redirige sinon.
 */
export async function requireNavigationAccessById(id: string): Promise<AuthContext> {
  const item = resolveItemById(id);
  return resolveAccess(item);
}

/**
 * Guard pour une page identifiée par son chemin.
 * Si aucun item ne correspond au chemin → accessible à tout authentifié.
 */
export async function requireNavigationAccessByPath(pathname: string): Promise<AuthContext> {
  const candidates = resolveItemsByPath(pathname);
  if (candidates.length === 0) return resolveAccess(undefined);

  let auth: AuthContext;
  try {
    auth = await getAuthenticatedUser();
  } catch {
    redirect("/login");
    throw new Error("unreachable");
  }

  let permissionSet: Set<string>;
  try {
    permissionSet = await resolvePermissions(auth);
  } catch {
    redirect("/403");
    throw new Error("unreachable");
  }

  const allowed = candidates.some((c) => canAccess(c, permissionSet));
  if (!allowed) {
    redirect("/403");
    throw new Error("unreachable");
  }

  return auth;
}
