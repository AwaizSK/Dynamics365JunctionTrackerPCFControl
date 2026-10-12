import { IInputs } from "./generated/ManifestTypes";
import { PickerConfig } from "./types";
import { isSafeIdentifier } from "./utlis/odata";

const list = (v: string | null | undefined): string[] =>
    (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const int = (v: number | null | undefined, d: number, min: number, max: number): number =>
    typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;

export function parseConfig(p: IInputs): { config?: PickerConfig; error?: string } {
    const relationshipName = (p.relationshipName.raw ?? "").trim();
    if (!relationshipName) return { error: "Set the N:N relationship schema name in the control properties." };

    const config: PickerConfig = {
        relationshipName,
        subtitleAttributes: list(p.subtitleAttributes.raw),
        searchAttributes: list(p.searchAttributes.raw),
        includeInactiveRecords: p.includeInactiveRecords.raw === true,
        minSearchCharacters: int(p.minSearchCharacters.raw, 2, 1, 10),
        debounceMilliseconds: int(p.debounceMilliseconds.raw, 300, 0, 2000),
        maxSuggestions: int(p.maxSuggestions.raw, 10, 1, 25),
    };

    const bad = [config.relationshipName, ...config.subtitleAttributes, ...config.searchAttributes].find(
        (i) => !isSafeIdentifier(i),
    );
    return bad ? { error: `Invalid configuration value: "${bad}"` } : { config };
}