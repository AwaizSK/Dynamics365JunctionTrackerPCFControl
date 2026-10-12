import * as React from "react";
import {
    getTheme,
    IBasePickerSuggestionsProps,
    ITag,
    IPickerItemProps,
    MessageBar,
    MessageBarType,
    mergeStyleSets,
    Spinner,
    SpinnerSize,
    TagPicker,
} from "@fluentui/react";
import { IRelationshipService, TagItem } from "../src/types";
import { Strings } from "../src/strings/Strings";
import { toTag, useLinkedRecords } from "../src/hooks/useLinkRecords";

const theme = getTheme();
const styles = mergeStyleSets({
    root: { width: "100%", display: "flex", flexDirection: "column", gap: 6 },
    list: { display: "flex", flexWrap: "wrap" },
    pill: {
        display: "inline-flex",
        alignItems: "center",
        maxWidth: "100%",
        minHeight: 28,
        margin: "2px 4px 2px 0",
        padding: "0 4px 0 10px",
        borderRadius: 14,
        background: theme.palette.neutralLighter,
        border: `1px solid ${theme.palette.neutralQuaternaryAlt}`,
        selectors: { ":hover": { background: theme.palette.neutralLight } },
    },
    pillReadOnly: { padding: "0 10px" },
    pillSelected: { background: theme.palette.themeLighter, borderColor: theme.palette.themePrimary },
    pillPending: { opacity: 0.6 },
    label: {
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        font: "inherit",
        color: theme.palette.themePrimary,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        selectors: {
            ":hover": { textDecoration: "underline" },
            ":focus-visible": { outline: `2px solid ${theme.palette.themePrimary}`, outlineOffset: 2 },
        },
    },
    remove: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        marginLeft: 4,
        padding: 0,
        border: "none",
        borderRadius: 10,
        background: "transparent",
        cursor: "pointer",
        color: theme.palette.neutralPrimary,
        selectors: {
            ":hover": { background: theme.palette.neutralQuaternaryAlt },
            ":focus-visible": { outline: `2px solid ${theme.palette.themePrimary}` },
        },
    },
    suggestion: { padding: "6px 12px", display: "flex", flexDirection: "column" },
    suggestionName: { fontWeight: 600 },
    suggestionSub: { color: theme.palette.neutralSecondary, fontSize: 12 },
    empty: { color: theme.palette.neutralSecondary },
});

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(" ");

interface PillProps {
    item: TagItem;
    strings: Strings;
    selected?: boolean;
    index?: number;
    onOpen: (id: string) => void;
    onRemove?: () => void;
}

const Pill: React.FC<PillProps> = ({ item, strings, selected, index, onOpen, onRemove }) => (
    <span
        className={cx(styles.pill, !onRemove && styles.pillReadOnly, selected && styles.pillSelected, item.pending && styles.pillPending)}
        data-selection-index={index}
        title={item.subtitle ? `${item.name} — ${item.subtitle}` : item.name}
    >
        <button type="button" className={styles.label} aria-label={strings.openAria(item.name)} onClick={() => onOpen(item.id)}>
            {item.name}
        </button>
        {onRemove && (
            <button type="button" className={styles.remove} aria-label={strings.removeAria(item.name)} onClick={onRemove}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
            </button>
        )}
    </span>
);

export interface RelatedRecordPickerProps {
    service: IRelationshipService;
    parentId: string;
    readOnly: boolean;
    strings: Strings;
    minSearchCharacters: number;
    debounceMilliseconds: number;
    onOpenRecord: (id: string) => void;
}

export const RelatedRecordPicker: React.FC<RelatedRecordPickerProps> = (props) => {
    const { service, parentId, readOnly, strings, minSearchCharacters, debounceMilliseconds, onOpenRecord } = props;
    const { items, loading, notices, add, remove, dismiss, notify } = useLinkedRecords(service, parentId, strings);
    const searchSeq = React.useRef(0);

    // BasePicker waits `resolveDelay` ms after the last keystroke before calling this (the debounce).
    const resolveSuggestions = React.useCallback(
        async (filter: string, selected?: ITag[]): Promise<ITag[]> => {
            const term = filter.trim();
            if (term.length < minSearchCharacters) return [];
            const seq = ++searchSeq.current;
            const exclude = (selected ?? items).map((t) => (t as TagItem).id ?? t.key);
            try {
                const found = await service.search(term, exclude);
                return seq === searchSeq.current ? found.map(toTag) : []; // drop stale responses
            } catch (e) {
                if (seq === searchSeq.current) notify(strings.searchFailed(e));
                return [];
            }
        },
        [service, items, minSearchCharacters, notify, strings],
    );

    const handleChange = React.useCallback(
        (next?: ITag[]) => {
            const nextTags = (next ?? []) as TagItem[];
            const nextIds = new Set(nextTags.map((t) => t.id));
            items.filter((i) => !nextIds.has(i.id)).forEach((i) => remove(i.id));
            nextTags.filter((t) => !items.some((i) => i.id === t.id)).forEach((t) => add(t));
        },
        [items, add, remove],
    );

    const suggestionProps: IBasePickerSuggestionsProps = React.useMemo(
        () => ({
            noResultsFoundText: strings.noResults(minSearchCharacters),
            loadingText: strings.searching,
        }),
        [strings, minSearchCharacters],
    );

    if (!parentId) {
        return <MessageBar messageBarType={MessageBarType.info}>{strings.saveFirst}</MessageBar>;
    }

    const body = loading ? (
        <Spinner size={SpinnerSize.small} label={strings.loading} labelPosition="right" />
    ) : readOnly ? (
        items.length === 0 ? (
            <span className={styles.empty}>{strings.empty}</span>
        ) : (
            <div className={styles.list} role="list">
                {items.map((i) => (
                    <Pill key={i.id} item={i} strings={strings} onOpen={onOpenRecord} />
                ))}
            </div>
        )
    ) : (
        <TagPicker
            selectedItems={items}
            onChange={handleChange}
            onResolveSuggestions={resolveSuggestions}
            resolveDelay={debounceMilliseconds}
            getTextFromItem={(t: ITag) => t.name}
            pickerSuggestionsProps={suggestionProps}
            inputProps={{ placeholder: strings.placeholder, "aria-label": strings.searchAria }}
            onRenderItem={(p: IPickerItemProps<ITag>) => (
                <Pill
                    key={p.key ?? (p.item as TagItem).id}
                    item={p.item as TagItem}
                    strings={strings}
                    selected={p.selected}
                    index={p.index}
                    onOpen={onOpenRecord}
                    onRemove={p.onRemoveItem}
                />
            )}
            onRenderSuggestionsItem={(t: ITag) => {
                const tag = t as TagItem;
                return (
                    <div className={styles.suggestion}>
                        <span className={styles.suggestionName}>{tag.name}</span>
                        {tag.subtitle && <span className={styles.suggestionSub}>{tag.subtitle}</span>}
                    </div>
                );
            }}
        />
    );

    return (
        <div className={styles.root}>
            {notices.map((n) => (
                <MessageBar
                    key={n.id}
                    messageBarType={MessageBarType.error}
                    isMultiline={false}
                    onDismiss={() => dismiss(n.id)}
                    dismissButtonAriaLabel={strings.dismissAria}
                    role="alert"
                >
                    {n.text}
                </MessageBar>
            ))}
            {body}
        </div>
    );
};