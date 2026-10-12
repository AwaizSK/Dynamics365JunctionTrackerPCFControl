import {
    DataverseError, IRelationshipService, PickerConfig, RelatedRecord, ResolvedRelationship,
} from "../src/types";
import { buildSearchFilter, escapeXml, isSafeIdentifier, normalizeGuid } from "../src/utlis/odata";

const API_VERSION = "v9.2";
const DUPLICATE_KEY_CODE = "0x80040237";
const MAX_SEARCH_PAGE = 100;

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
type WebApiEntity = Record<string, unknown>;

interface IWebApi {
    retrieveMultipleRecords(entityName: string, options?: string): Promise<{ entities: WebApiEntity[] }>;
}

interface ManyToManyMeta {
    IntersectEntityName: string;
    Entity1LogicalName: string;
    Entity2LogicalName: string;
    Entity1IntersectAttribute: string;
    Entity2IntersectAttribute: string;
    Entity1NavigationPropertyName: string;
    Entity2NavigationPropertyName: string;
}
interface EntityMeta {
    EntitySetName: string;
    PrimaryIdAttribute: string;
    PrimaryNameAttribute: string;
}

/**
 * All Dataverse access for the control. Table-agnostic: everything about the relationship
 * (intersect table, navigation property, entity sets, key/name columns) is read from metadata once.
 *  - Data reads use context.webAPI (platform-managed auth/telemetry).
 *  - Metadata reads and Associate/Disassociate use the documented Web API endpoints via fetch,
 *    because context.webAPI exposes no association or metadata API.
 */
export class RelationshipService implements IRelationshipService {
    private readonly apiBase: string;
    private readonly fetchFn: FetchFn;
    private resolved?: Promise<ResolvedRelationship>;

    constructor(
        private readonly webApi: ComponentFramework.WebApi,
        private readonly cfg: PickerConfig,
        private readonly parentEntity: string,
        clientUrl: string,
        fetchFn?: FetchFn,
    ) {
        this.apiBase = `${clientUrl.replace(/\/+$/, "")}/api/data/${API_VERSION}`;
        this.fetchFn = fetchFn ?? ((input, init) => window.fetch(input, init));
    }

    // ------------------------------------------------------------- metadata

    private resolve(): Promise<ResolvedRelationship> {
        if (!this.resolved) {
            this.resolved = this.loadRelationship().catch((e) => {
                this.resolved = undefined; // allow retry after a transient failure
                throw e;
            });
        }
        return this.resolved;
    }

    public async getRelatedEntity(): Promise<string> {
        return (await this.resolve()).relatedEntity;
    }

    private async loadRelationship(): Promise<ResolvedRelationship> {
        const name = this.cfg.relationshipName;
        let rel: ManyToManyMeta;
        try {
            rel = (await this.send(
                "GET",
                `${this.apiBase}/RelationshipDefinitions(SchemaName='${name}')` +
                    `/Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata` +
                    `?$select=IntersectEntityName,Entity1LogicalName,Entity2LogicalName,` +
                    `Entity1IntersectAttribute,Entity2IntersectAttribute,` +
                    `Entity1NavigationPropertyName,Entity2NavigationPropertyName`,
            )) as ManyToManyMeta;
        } catch (e) {
            if (e instanceof DataverseError && e.kind === "notFound") {
                throw new DataverseError(`"${name}" is not an existing N:N relationship.`, "config", 404);
            }
            throw e;
        }

        // For a self-referential relationship both sides match; side 1 is treated as the parent.
        const parentIsSide1 = rel.Entity1LogicalName === this.parentEntity;
        if (!parentIsSide1 && rel.Entity2LogicalName !== this.parentEntity) {
            throw new DataverseError(
                `Relationship "${name}" does not involve table "${this.parentEntity}".`, "config",
            );
        }
        const relatedEntity = parentIsSide1 ? rel.Entity2LogicalName : rel.Entity1LogicalName;

        const [parentMeta, relatedMeta] = await Promise.all([
            this.getEntityMeta(this.parentEntity),
            this.getEntityMeta(relatedEntity),
        ]);

        const resolved: ResolvedRelationship = {
            intersectEntity: rel.IntersectEntityName,
            navigationProperty: parentIsSide1 ? rel.Entity1NavigationPropertyName : rel.Entity2NavigationPropertyName,
            parentEntitySet: parentMeta.EntitySetName,
            parentIntersectAttribute: parentIsSide1 ? rel.Entity1IntersectAttribute : rel.Entity2IntersectAttribute,
            relatedEntity,
            relatedEntitySet: relatedMeta.EntitySetName,
            relatedIdAttribute: relatedMeta.PrimaryIdAttribute,
            relatedNameAttribute: relatedMeta.PrimaryNameAttribute,
            relatedIntersectAttribute: parentIsSide1 ? rel.Entity2IntersectAttribute : rel.Entity1IntersectAttribute,
        };

        // Values end up in URLs/FetchXML: whitelist them even though they come from the server.
        if (Object.values(resolved).some((v) => !isSafeIdentifier(v))) {
            throw new DataverseError("Unexpected relationship metadata.", "config");
        }
        return resolved;
    }

    private async getEntityMeta(logicalName: string): Promise<EntityMeta> {
        return (await this.send(
            "GET",
            `${this.apiBase}/EntityDefinitions(LogicalName='${logicalName}')` +
                `?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`,
        )) as EntityMeta;
    }

    // ---------------------------------------------------------------- reads

    public async getLinked(parentId: string): Promise<RelatedRecord[]> {
        const r = await this.resolve();
        const attrs = this.selectAttributes(r).map((a) => `<attribute name="${a}"/>`).join("");
        // Single round-trip: related records joined through the N:N intersect table.
        const fetchXml =
            `<fetch><entity name="${r.relatedEntity}">${attrs}` +
            `<order attribute="${r.relatedNameAttribute}"/>` +
            `<link-entity name="${r.intersectEntity}" from="${r.relatedIntersectAttribute}" to="${r.relatedIdAttribute}" intersect="true">` +
            `<filter><condition attribute="${r.parentIntersectAttribute}" operator="eq" value="${escapeXml(parentId)}"/></filter>` +
            `</link-entity></entity></fetch>`;

        const result = await this.webApi.retrieveMultipleRecords(
            r.relatedEntity,
            `?fetchXml=${encodeURIComponent(fetchXml)}`,
        );
        return result.entities.map((e) => this.toRecord(r, e));
    }

    public async search(term: string, excludeIds: string[]): Promise<RelatedRecord[]> {
        const r = await this.resolve();
        const c = this.cfg;
        const exclude = new Set(excludeIds.map(normalizeGuid));
        const searchAttrs = c.searchAttributes.length ? c.searchAttributes : [r.relatedNameAttribute];
        // Over-fetch by the number of excluded rows so exclusion never leaves the list short.
        const top = Math.min(c.maxSuggestions + exclude.size, MAX_SEARCH_PAGE);
        const options =
            `?$select=${this.selectAttributes(r).join(",")}` +
            `&$filter=${buildSearchFilter(term, searchAttrs, c.includeInactiveRecords)}` +
            `&$orderby=${r.relatedNameAttribute} asc&$top=${top}`;

        const result = await this.webApi.retrieveMultipleRecords(r.relatedEntity, options);
        return result.entities
            .map((e) => this.toRecord(r, e))
            .filter((rec) => !exclude.has(rec.id))
            .slice(0, c.maxSuggestions);
    }

    // --------------------------------------------------------------- writes

    public async associate(parentId: string, relatedId: string): Promise<void> {
        const r = await this.resolve();
        try {
            await this.send(
                "POST",
                `${this.apiBase}/${r.parentEntitySet}(${parentId})/${r.navigationProperty}/$ref`,
                { "@odata.id": `${this.apiBase}/${r.relatedEntitySet}(${relatedId})` },
            );
        } catch (e) {
            // Idempotent: someone else already linked this record -> desired state reached.
            if (e instanceof DataverseError && e.kind === "duplicate") return;
            throw e;
        }
    }

    public async disassociate(parentId: string, relatedId: string): Promise<void> {
        const r = await this.resolve();
        const target = encodeURIComponent(`${this.apiBase}/${r.relatedEntitySet}(${relatedId})`);
        try {
            await this.send(
                "DELETE",
                `${this.apiBase}/${r.parentEntitySet}(${parentId})/${r.navigationProperty}/$ref?$id=${target}`,
            );
        } catch (e) {
            // Idempotent: already unlinked elsewhere.
            if (e instanceof DataverseError && e.kind === "notFound") return;
            throw e;
        }
    }

    // -------------------------------------------------------------- helpers

    private selectAttributes(r: ResolvedRelationship): string[] {
        return Array.from(new Set([r.relatedIdAttribute, r.relatedNameAttribute, ...this.cfg.subtitleAttributes]));
    }

    private toRecord(r: ResolvedRelationship, e: ComponentFramework.WebApi.Entity): RelatedRecord {
        const subtitle = this.cfg.subtitleAttributes
            .map((a) => e[a] as string | null | undefined)
            .filter((v): v is string => !!v)
            .join(" · ");
        return {
            id: normalizeGuid(e[r.relatedIdAttribute] as string),
            name: (e[r.relatedNameAttribute] as string) || "(no name)",
            subtitle,
        };
    }

    private async send(method: "GET" | "POST" | "DELETE", url: string, body?: unknown): Promise<unknown> {
        let res: Response;
        try {
            res = await this.fetchFn(url, {
                method,
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json; charset=utf-8",
                    "OData-MaxVersion": "4.0",
                    "OData-Version": "4.0",
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch {
            throw new DataverseError("Network error", "network", 0);
        }

        if (res.ok) {
            if (method !== "GET" || res.status === 204) return undefined;
            return res.json();
        }

        let code: string | undefined;
        let message = res.statusText || "Request failed";
        try {
            const json = (await res.json()) as { error?: { code?: string; message?: string } };
            code = json.error?.code;
            message = json.error?.message ?? message;
        } catch {
            /* non-JSON error body */
        }

        if (code === DUPLICATE_KEY_CODE) throw new DataverseError(message, "duplicate", res.status, code);
        if (res.status === 401 || res.status === 403) throw new DataverseError(message, "permission", res.status, code);
        if (res.status === 404) throw new DataverseError(message, "notFound", res.status, code);
        throw new DataverseError(message, "server", res.status, code);
    }
}