/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { Button } from "@components/Button";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { SelectedChannelStore, useEffect, useMemo, useRef, UserStore, useState } from "@webpack/common";

import { settings } from "./settings";
import { addSavedText, getPasteCount, getSavedTexts, incrementPasteCount, MAX_ENTRIES, removeSavedText, SavedText, updateSavedText } from "./storage";

export function truncatePreview(text: string, limit: number) { const count = Math.max(0, Math.floor(limit)); return text.length <= count ? text : text.slice(0, count).trimEnd() + "…"; }

export function TextPicker({ channelId, initialText = "", onClose }: { channelId: string; initialText?: string; onClose(): void; }) {
    const [owner] = useState(() => UserStore.getCurrentUser()?.id ?? "");
    const [items, setItems] = useState<SavedText[]>([]);
    const [query, setQuery] = useState("");
    const [editing, setEditing] = useState<string | null>(initialText ? "new" : null);
    const [name, setName] = useState("");
    const [text, setText] = useState(initialText);
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [status, setStatus] = useState("");
    const alive = useRef(true);
    const config = settings.use(["previewCharLimit", "showPasteCount", "closeOnInsert"]);
    useEffect(() => {
        alive.current = true;
        getSavedTexts(owner).then(rows => { if (alive.current) { setItems(rows); setLoaded(true); } }).catch(error => { if (alive.current) setStatus(String(error.message ?? error)); });
        return () => { alive.current = false; };
    }, [owner]);
    const rows = useMemo(() => items.filter(item => `${item.name}\n${item.text}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [items, query]);
    async function run(action: () => Promise<unknown>, finish?: () => void) {
        if (busy || !loaded || owner !== UserStore.getCurrentUser()?.id) return;
        setBusy(true); setStatus("");
        try {
            await action();
            const updated = await getSavedTexts(owner);
            if (alive.current) { setItems(updated); finish?.(); }
        } catch (error) { if (alive.current) setStatus(String((error as Error).message ?? error)); }
        finally { if (alive.current) setBusy(false); }
    }
    function edit(item?: SavedText) { setEditing(item?.id ?? "new"); setName(item?.name ?? ""); setText(item?.text ?? ""); }
    function insert(item: SavedText) {
        if (busy || owner !== UserStore.getCurrentUser()?.id) return;
        if (channelId !== SelectedChannelStore.getChannelId()) { setStatus("تغيّرت المحادثة. افتح النصوص من المحادثة الحالية."); return; }
        insertTextIntoChatInputBox(item.text);
        void run(() => incrementPasteCount(owner, item.id), () => { if (config.closeOnInsert) onClose(); });
    }
    return <div className="vc-saved-texts-panel" dir="rtl">
        <div className="vc-saved-texts-controls"><input autoFocus aria-label="البحث في النصوص" placeholder="ابحث في النصوص المحفوظة…" value={query} onChange={event => setQuery(event.currentTarget.value)} /><Button disabled={!loaded || busy || items.length >= MAX_ENTRIES} onClick={() => edit()}>إضافة نص</Button><small>{items.length} / {MAX_ENTRIES}</small></div>
        {editing !== null && <section className="vc-saved-texts-editor"><input aria-label="اسم النص" placeholder="اسم النص" maxLength={100} value={name} onChange={event => setName(event.currentTarget.value)} disabled={busy} /><textarea aria-label="النص" placeholder="اكتب النص هنا" rows={6} maxLength={20000} value={text} onChange={event => setText(event.currentTarget.value)} disabled={busy} /><div><Button disabled={busy || !loaded || !text.trim()} onClick={() => void run(() => editing === "new" ? addSavedText(owner, name, text) : updateSavedText(owner, editing!, name, text), () => setEditing(null))}>حفظ</Button><Button variant="secondary" disabled={busy} onClick={() => setEditing(null)}>إلغاء</Button></div></section>}
        {status && <p role="alert" className="vc-saved-texts-error">{status}</p>}
        <div className="vc-saved-texts-cards">{rows.map(item => <article key={item.id} className="vc-saved-texts-card"><button type="button" className="vc-saved-texts-insert" disabled={busy} onClick={() => insert(item)}><strong>{item.name}</strong><span>{truncatePreview(item.text, config.previewCharLimit)}</span>{config.showPasteCount && <small>استخدامات: {getPasteCount(item)}</small>}</button><footer><Button size="small" variant="secondary" disabled={busy} onClick={() => edit(item)}>تعديل</Button><Button size="small" variant="dangerSecondary" disabled={busy} onClick={() => void run(() => removeSavedText(owner, item.id))}>حذف</Button></footer></article>)}</div>
        {!rows.length && <p className="vc-saved-texts-empty">{loaded ? "لا توجد نصوص مطابقة. أضف نصًا أو احفظ رسالة بالكليك يمين." : "جارٍ تحميل النصوص…"}</p>}
    </div>;
}
