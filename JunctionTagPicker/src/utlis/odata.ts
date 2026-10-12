const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Strips braces and lower-cases a GUID. Returns "" when the value is not a valid GUID. */
export function normalizeGuid(value: string | null | undefined): string {
    const g = (value ?? "").replace(/[{}]/g, "").trim().toLowerCase();
    return GUID_RE.test(g) ? g : "";
}

/** Logical names, entity set names and relationship names end up in URLs/FetchXML, so they are whitelisted. */
export function isSafeIdentifier(value: string): boolean {
    return IDENTIFIER_RE.test(value);
}

/** Doubles single quotes (OData string escaping) then URL-encodes the literal. */
export function toODataLiteral(value: string): string {
    return encodeURIComponent(value.replace(/'/g, "''"));
}

/**
 * Records whose any search attribute STARTS WITH the term (active only unless includeInactive).
 * startswith (vs contains) can use indexes, which matters on large tables.
 */
export function buildSearchFilter(term: string, searchAttributes: string[], includeInactive = false): string {
    const lit = toODataLiteral(term.trim());
    const match = `(${searchAttributes.map((a) => `startswith(${a},'${lit}')`).join(" or ")})`;
    return includeInactive ? match : `statecode eq 0 and ${match}`;
}

export function escapeXml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}