import { DataverseError } from "../types";

export interface Strings {
    placeholder: string;
    searching: string;
    loading: string;
    saveFirst: string;
    empty: string;
    searchAria: string;
    dismissAria: string;
    noResults(minChars: number): string;
    loadFailed(e: unknown): string;
    searchFailed(e: unknown): string;
    addFailed(name: string, e: unknown): string;
    removeFailed(name: string, e: unknown): string;
    removeAria(name: string): string;
    openAria(name: string): string;
}

type ResourceProvider = {
    getString(key: string): string;
};

export function createStrings(res: ResourceProvider): Strings {
    const fmt = (s: string, ...a: Array<string | number>) =>
        s.replace(/\{(\d+)\}/g, (_, i: string) => String(a[+i] ?? ""));
    const t = (key: string, fallback: string): string => {
        const v = res.getString(key);
        return v && v !== key ? v : fallback;
    };
    const reason = (e: unknown): string => {
        if (e instanceof DataverseError) {
            if (e.kind === "permission") return t("RTP_ErrPermission", "You don't have permission to change these links.");
            if (e.kind === "config") return e.message;
            if (e.kind === "network") return t("RTP_ErrNetwork", "Check your connection and try again.");
        }
        return t("RTP_ErrGeneric", "Try again, or contact your administrator.");
    };

    return {
        placeholder: t("RTP_Placeholder", "Type a name to add…"),
        searching: t("RTP_Searching", "Searching…"),
        loading: t("RTP_Loading", "Loading linked records…"),
        saveFirst: t("RTP_SaveFirst", "Save this record before linking related records."),
        empty: t("RTP_Empty", "No linked records."),
        searchAria: t("RTP_SearchAria", "Search to add a linked record"),
        dismissAria: t("RTP_DismissAria", "Dismiss message"),
        noResults: (n) => fmt(t("RTP_NoResults", "No matching active records. Type at least {0} characters."), n),
        loadFailed: (e) => fmt(t("RTP_LoadFailed", "Linked records could not be loaded. {0}"), reason(e)),
        searchFailed: (e) => fmt(t("RTP_SearchFailed", "Search failed. {0}"), reason(e)),
        addFailed: (n, e) => fmt(t("RTP_AddFailed", "{0} was not linked. {1}"), n, reason(e)),
        removeFailed: (n, e) => fmt(t("RTP_RemoveFailed", "{0} was not unlinked. {1}"), n, reason(e)),
        removeAria: (n) => fmt(t("RTP_RemoveAria", "Remove {0}"), n),
        openAria: (n) => fmt(t("RTP_OpenAria", "Open {0}"), n),
    };
}