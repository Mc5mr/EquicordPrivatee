/*
 * Copyright (c) 2026 Xaenny (https://github.com/Xaenny)
 * Modified Equicord port by Mc5mr — see LICENSE and THIRD_PARTY_NOTICES.md.
 */

/* Modified for Equicord by Mc5mr; original source and licenses retained. */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    previewCharLimit: { type: OptionType.SLIDER, description: "عدد الأحرف الظاهرة في معاينة البطاقة", markers: [50, 100, 200, 400, 750, 1000], default: 200, stickToMarkers: false },
    showPasteCount: { type: OptionType.BOOLEAN, description: "إظهار عدد استخدامات كل نص", default: true },
    closeOnInsert: { type: OptionType.BOOLEAN, description: "إغلاق اللوحة بعد إدخال النص في مربع الرسالة", default: true }
});
