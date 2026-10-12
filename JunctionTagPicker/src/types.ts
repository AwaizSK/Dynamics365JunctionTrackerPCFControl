/** User-facing configuration (manifest properties), already validated. */
export interface PickerConfig {
    /** Schema name of the N:N relationship, e.g. "new_account_contact". */
    relationshipName: string;
    /** Extra columns shown under the name in suggestions. */
    subtitleAttributes: string[];
    /** Columns matched with "starts with". Empty = the related table's primary name column. */
    searchAttributes: string[];
    includeInactiveRecords: boolean;
    minSearchCharacters: number;
    debounceMilliseconds: number;
    maxSuggestions: number;
}

/** Everything about the relationship that is discovered from Dataverse metadata at runtime. */
export interface ResolvedRelationship {
    intersectEntity: string;
    /** Navigation property on the PARENT table that points to the related records. */
    navigationProperty: string;
    parentEntitySet: string;
    parentIntersectAttribute: string;
    relatedEntity: string;
    relatedEntitySet: string;
    relatedIdAttribute: string;
    relatedNameAttribute: string;
    relatedIntersectAttribute: string;
}

/** A related record in a UI-agnostic shape. */
export interface RelatedRecord {
    id: string;
    name: string;
    subtitle: string;
}

/** Tag shown in the picker. `key`/`name` make it structurally compatible with Fluent's ITag. */
export interface TagItem {
    key: string;
    name: string;
    id: string;
    subtitle: string;
    pending?: boolean;
}

export interface IRelationshipService {
    getLinked(parentId: string): Promise<RelatedRecord[]>;
    search(term: string, excludeIds: string[]): Promise<RelatedRecord[]>;
    associate(parentId: string, relatedId: string): Promise<void>;
    disassociate(parentId: string, relatedId: string): Promise<void>;
    /** Logical name of the related table, once resolved (used for navigation). */
    getRelatedEntity(): Promise<string>;
}

export type DataverseErrorKind = "network" | "permission" | "notFound" | "duplicate" | "config" | "server";

export class DataverseError extends Error {
    constructor(
        message: string,
        public readonly kind: DataverseErrorKind,
        public readonly status?: number,
        public readonly code?: string,
    ) {
        super(message);
        this.name = "DataverseError";
        Object.setPrototypeOf(this, DataverseError.prototype);
    }
}