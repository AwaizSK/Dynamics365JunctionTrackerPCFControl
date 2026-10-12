import * as React from "react";
import { IRelationshipService, RelatedRecord, TagItem } from "../src/types";
import { Strings } from "../src/strings/Strings";

export interface Notice {
    id: number;
    text: string;
}

const NOTICE_TTL_MS = 10000;

export const toTag = (r: RelatedRecord): TagItem => ({
    key: r.id,
    id: r.id,
    name: r.name,
    subtitle: r.subtitle,
});

function insertAt<T>(list: T[], item: T, index: number): T[] {
    const i = Math.min(Math.max(index, 0), list.length);
    return [...list.slice(0, i), item, ...list.slice(i)];
}

/**
 * Owns the list of linked records.
 *  - Optimistic: UI changes first, Dataverse call follows, UI rolls back on failure.
 *  - Operations on the same record are serialised so rapid add/remove clicks can never race.
 */
export function useLinkedRecords(service: IRelationshipService, parentId: string, strings: Strings) {
    const [items, setItems] = React.useState<TagItem[]>([]);
    const [loading, setLoading] = React.useState<boolean>(false);
    const [notices, setNotices] = React.useState<Notice[]>([]);

    const itemsRef = React.useRef<TagItem[]>([]);
    const queueRef = React.useRef(new Map<string, Promise<void>>());
    const noticeSeq = React.useRef(0);
    const mounted = React.useRef(true);

    React.useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Single writer for list state: keeps ref and state in lock-step, so callbacks never read stale data.
    const commit = React.useCallback((update: (prev: TagItem[]) => TagItem[]) => {
        itemsRef.current = update(itemsRef.current);
        if (mounted.current) setItems(itemsRef.current);
    }, []);

    const dismiss = React.useCallback((id: number) => {
        setNotices((n) => n.filter((x) => x.id !== id));
    }, []);

    const notify = React.useCallback(
        (text: string) => {
            const id = ++noticeSeq.current;
            setNotices((n) => [...n, { id, text }]);
            window.setTimeout(() => {
                if (mounted.current) dismiss(id);
            }, NOTICE_TTL_MS);
        },
        [dismiss],
    );

    const enqueue = React.useCallback((id: string, task: () => Promise<void>) => {
        const prev = queueRef.current.get(id) ?? Promise.resolve();
        const next = prev.then(task); // tasks handle their own errors and never reject
        queueRef.current.set(id, next);
        void next.then(() => {
            if (queueRef.current.get(id) === next) queueRef.current.delete(id);
        });
    }, []);

    // Initial load / parent change
    React.useEffect(() => {
        let cancelled = false;
        queueRef.current.clear();
        if (!parentId) {
            commit(() => []);
            return undefined;
        }
        setLoading(true);
        service
            .getLinked(parentId)
            .then((records) => {
                if (!cancelled) commit(() => records.map(toTag));
            })
            .catch((e: unknown) => {
                if (!cancelled) notify(strings.loadFailed(e));
            })
            .then(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [service, parentId, commit, notify, strings]);

    const add = React.useCallback(
        (tag: TagItem) => {
            if (!parentId || itemsRef.current.some((i) => i.id === tag.id)) return;
            commit((p) => [...p, { ...tag, pending: true }]); // optimistic
            enqueue(tag.id, async () => {
                try {
                    await service.associate(parentId, tag.id);
                    commit((p) => p.map((i) => (i.id === tag.id ? { ...i, pending: false } : i)));
                } catch (e) {
                    commit((p) => p.filter((i) => i.id !== tag.id)); // rollback
                    notify(strings.addFailed(tag.name, e));
                }
            });
        },
        [parentId, service, strings, commit, enqueue, notify],
    );

    const remove = React.useCallback(
        (id: string) => {
            const index = itemsRef.current.findIndex((i) => i.id === id);
            if (!parentId || index < 0) return;
            const removed = itemsRef.current[index];
            commit((p) => p.filter((i) => i.id !== id)); // optimistic
            enqueue(id, async () => {
                try {
                    await service.disassociate(parentId, id);
                } catch (e) {
                    // rollback at the original position
                    commit((p) =>
                        p.some((i) => i.id === id) ? p : insertAt(p, { ...removed, pending: false }, index),
                    );
                    notify(strings.removeFailed(removed.name, e));
                }
            });
        },
        [parentId, service, strings, commit, enqueue, notify],
    );

    return { items, loading, notices, add, remove, dismiss, notify };
}