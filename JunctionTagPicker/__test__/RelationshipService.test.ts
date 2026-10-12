

import { describe, expect, it, jest } from "@jest/globals";
import { RelationshipService } from "../src/services/RelationshipService";
import { buildSearchFilter, normalizeGuid, toODataLiteral } from "../src/utlis/odata";
import { DataverseError, PickerConfig } from "../src/types";

const cfg: PickerConfig = {
    relationshipName: "new_account_contact", subtitleAttributes: ["jobtitle", "emailaddress1"],
    searchAttributes: [], includeInactiveRecords: false, minSearchCharacters: 2, debounceMilliseconds: 300, maxSuggestions: 2,
};
const A = "11111111-1111-1111-1111-111111111111";
const C1 = "22222222-2222-2222-2222-222222222222";
const C2 = "33333333-3333-3333-3333-333333333333";
const C3 = "44444444-4444-4444-4444-444444444444";

const resp = (status: number, json?: unknown) =>
    ({ ok: status >= 200 && status < 300, status, statusText: "x", json: async () => json }) as Response;

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const REL = {
    IntersectEntityName: "new_account_contact", Entity1LogicalName: "account", Entity2LogicalName: "contact",
    Entity1IntersectAttribute: "accountid", Entity2IntersectAttribute: "contactid",
    Entity1NavigationPropertyName: "new_account_contact", Entity2NavigationPropertyName: "new_account_contact",
};
const META: Record<string, unknown> = {
    account: { EntitySetName: "accounts", PrimaryIdAttribute: "accountid", PrimaryNameAttribute: "name" },
    contact: { EntitySetName: "contacts", PrimaryIdAttribute: "contactid", PrimaryNameAttribute: "fullname" },
};

/** Fake Web API: serves metadata, and returns `write` for POST/DELETE. */
function fakeFetch(write: Response = resp(204)): jest.MockedFunction<FetchFn> {
    return jest.fn(async (url: string, init?: RequestInit): Promise<Response> => {
        if (init?.method === "GET") {
            if (url.includes("RelationshipDefinitions")) return resp(200, REL);
            const m = /LogicalName='(\w+)'/.exec(url);
            return resp(200, META[m ? m[1] : ""]);
        }
        return write;
    }) as jest.MockedFunction<FetchFn>;
}
const svc = (f: jest.MockedFunction<FetchFn>, parent = "account", webApi: unknown = {}) =>
    new RelationshipService(webApi as never, cfg, parent, "https://org.crm.dynamics.com/", f as FetchFn);
const writes = (f: jest.MockedFunction<FetchFn>) =>
    f.mock.calls.filter((c) => {
        const init = c[1] as RequestInit | undefined;
        return init?.method !== "GET";
    });

describe("odata utils", () => {
    it("escapes quotes and encodes", () => expect(toODataLiteral("O'Neil & Co")).toBe("O''Neil%20%26%20Co"));
    it("filters active by default", () =>
        expect(buildSearchFilter("rob", ["name"])).toBe("statecode eq 0 and (startswith(name,'rob'))"));
    it("can include inactive", () =>
        expect(buildSearchFilter("rob", ["name"], true)).toBe("(startswith(name,'rob'))"));
    it("normalizes guids", () => {
        expect(normalizeGuid(`{${A.toUpperCase()}}`)).toBe(A);
        expect(normalizeGuid("nope")).toBe("");
    });
});

describe("RelationshipService", () => {
    it("associate resolves metadata then POSTs a $ref", async () => {
        const f = fakeFetch();
        await svc(f).associate(A, C1);
        const [url, init] = writes(f)[0];
        const body = init?.body;
        expect(url).toBe(`https://org.crm.dynamics.com/api/data/v9.2/accounts(${A})/new_account_contact/$ref`);
        expect(body).toBeDefined();
        expect(JSON.parse(String(body))['@odata.id']).toContain(`contacts(${C1})`);
    });
    it("works from the other side of the relationship", async () => {
        const f = fakeFetch();
        const s = svc(f, "contact");
        await s.associate(C1, A);
        expect(writes(f)[0][0]).toContain(`/contacts(${C1})/`);
        expect(await s.getRelatedEntity()).toBe("account");
    });
    it("rejects a table that is not part of the relationship", async () => {
        await expect(svc(fakeFetch(), "lead").associate(A, C1)).rejects.toMatchObject({ kind: "config" });
    });
    it("reports an unknown relationship as a config error", async () => {
        const f = jest.fn<FetchFn>().mockResolvedValue(resp(404, {}));
        await expect(svc(f).getLinked(A)).rejects.toMatchObject({ kind: "config" });
    });
    it("associate treats duplicate-key as success", async () => {
        const f = fakeFetch(resp(400, { error: { code: "0x80040237", message: "dup" } }));
        await expect(svc(f).associate(A, C1)).resolves.toBeUndefined();
    });
    it("disassociate maps 403 to a permission error", async () => {
        const f = fakeFetch(resp(403, { error: { message: "no" } }));
        await expect(svc(f).disassociate(A, C1)).rejects.toMatchObject({ kind: "permission", status: 403 });
    });
    it("disassociate treats 404 as success", async () => {
        await expect(svc(fakeFetch(resp(404, {}))).disassociate(A, C1)).resolves.toBeUndefined();
    });
    it("network failure becomes a network error", async () => {
        const f = jest.fn<FetchFn>().mockRejectedValue(new TypeError("offline"));
        const p = svc(f).associate(A, C1);
        await expect(p).rejects.toBeInstanceOf(DataverseError);
        await expect(p).rejects.toMatchObject({ kind: "network" });
    });
    it("search excludes linked ids, honours maxSuggestions and defaults to the primary name column", async () => {
        const webApi: {
            retrieveMultipleRecords: jest.MockedFunction<
                (entityName: string, options?: string) => Promise<{ entities: Array<{ contactid: string; fullname: string; jobtitle?: string; emailaddress1?: string }> }>
            >;
        } = {
            retrieveMultipleRecords: jest.fn<
                (entityName: string, options?: string) => Promise<{ entities: Array<{ contactid: string; fullname: string; jobtitle?: string; emailaddress1?: string }> }>
            >().mockResolvedValue({
                entities: [
                    { contactid: C1, fullname: "Rob A", jobtitle: "CFO", emailaddress1: "a@x.com" },
                    { contactid: C2, fullname: "Rob B", emailaddress1: "b@x.com" },
                    { contactid: C3, fullname: "Rob C" },
                ],
            }),
        };
        const r = await svc(fakeFetch(), "account", webApi).search("rob", [C1]);
        expect(r.map((x) => x.id)).toEqual([C2, C3]);
        expect(r[0].subtitle).toBe("b@x.com");
        const opts = webApi.retrieveMultipleRecords.mock.calls[0][1] as string;
        expect(opts).toContain("$top=3");
        expect(opts).toContain("startswith(fullname,'rob')");
    });
    it("getLinked joins through the intersect table", async () => {
        const webApi: {
            retrieveMultipleRecords: jest.MockedFunction<
                (entityName: string, options?: string) => Promise<{ entities: Array<{ contactid: string; fullname: string }> }>
            >;
        } = {
            retrieveMultipleRecords: jest.fn<
                (entityName: string, options?: string) => Promise<{ entities: Array<{ contactid: string; fullname: string }> }>
            >().mockResolvedValue({ entities: [{ contactid: C1, fullname: "Rob A" }] }),
        };
        const r = await svc(fakeFetch(), "account", webApi).getLinked(A);
        const xml = decodeURIComponent((webApi.retrieveMultipleRecords.mock.calls[0][1] as string).replace("?fetchXml=", ""));
        expect(xml).toContain('link-entity name="new_account_contact" from="contactid" to="contactid"');
        expect(xml).toContain(`attribute="accountid" operator="eq" value="${A}"`);
        expect(r[0].name).toBe("Rob A");
    });
});

