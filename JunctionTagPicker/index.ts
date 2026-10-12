import * as React from "react";
import { MessageBar, MessageBarType } from "@fluentui/react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { RelatedRecordPicker } from "./components/RelatedRecordPicker";
import { parseConfig } from "./src/config";
import { RelationshipService } from "./src/services/RelationshipService";
import { createStrings, Strings } from "./src/strings/Strings";
import { normalizeGuid } from "./src/utlis/odata";

// Numeric values of the platform's PrivilegeType / PrivilegeDepth enums (ambient enums have no runtime object).
const PRIV_APPEND = 7;
const PRIV_APPEND_TO = 8;
const DEPTH_BASIC = 0;

/** Runtime form context. Present in model-driven apps but missing from the published typings. */
interface FormContext {
    entityId?: string;
    entityTypeName?: string;
    getClientUrl?: () => string;
}

function getFormContext(context: ComponentFramework.Context<IInputs>): FormContext {
    const c = context as unknown as { mode?: { contextInfo?: FormContext }; page?: FormContext };
    return { ...c.page, ...c.mode?.contextInfo, getClientUrl: c.page?.getClientUrl?.bind(c.page) };
}

export class RelationshipTagPicker implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private strings!: Strings;
    private service?: RelationshipService;
    private serviceKey = "";

    public init(context: ComponentFramework.Context<IInputs>): void {
        this.strings = createStrings(context.resources);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const { config, error } = parseConfig(context.parameters);
        if (!config) {
            return React.createElement(MessageBar, { messageBarType: MessageBarType.severeWarning }, error);
        }

        const form = getFormContext(context);
        const parentEntity = form.entityTypeName ?? "";
        const clientUrl = form.getClientUrl?.() ?? window.location.origin;

        // One service per (org, parent table, configuration); it caches the resolved relationship metadata.
        const key = `${clientUrl}|${parentEntity}|${JSON.stringify(config)}`;
        if (!this.service || key !== this.serviceKey) {
            this.service = new RelationshipService(context.webAPI, config, parentEntity, clientUrl);
            this.serviceKey = key;
        }
        const service = this.service;

        const readOnly =
            context.mode.isControlDisabled ||
            context.parameters.boundField.security?.editable === false ||
            !this.canAssociate(context, parentEntity);

        return React.createElement(RelatedRecordPicker, {
            service,
            parentId: normalizeGuid(form.entityId),
            readOnly,
            strings: this.strings,
            minSearchCharacters: config.minSearchCharacters,
            debounceMilliseconds: config.debounceMilliseconds,
            onOpenRecord: (id: string) => {
                void service
                    .getRelatedEntity()
                    .then((entityName) => context.navigation.openForm({ entityName, entityId: id }));
            },
        });
    }

    public getOutputs(): IOutputs {
        return {}; // read/write happens through the relationship, never through the bound column
    }

    public destroy(): void {
        this.service = undefined;
    }

    /**
     * N:N association requires Append + AppendTo on the tables involved. Only the parent table is known
     * synchronously, so this is a UX hint; Dataverse stays the authority and any 403 (for example on the
     * related table) is handled by the optimistic rollback.
     */
    private canAssociate(context: ComponentFramework.Context<IInputs>, parent: string): boolean {
        if (!parent) return true;
        try {
            const has = (priv: number): boolean =>
                context.utils.hasEntityPrivilege(parent, priv as never, DEPTH_BASIC as never);
            return has(PRIV_APPEND) && has(PRIV_APPEND_TO);
        } catch {
            return true;
        }
    }
}