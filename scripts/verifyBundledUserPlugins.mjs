// Exercise real production badge and sidebar code with a small plugin catalog.
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const owner = "523157034141745153";
const catalog = {
    CustomOne: { name: "CustomOne", authors: [{ name: "Mc5mr", id: BigInt(owner) }] },
    CustomTwo: { name: "CustomTwo", authors: [{ name: "Mc5mr", id: BigInt(owner) }], required: true },
    CustomAPI: { name: "CustomAPI", authors: [{ name: "Mc5mr", id: BigInt(owner) }] },
    SharedContribution: { name: "SharedContribution", authors: [{ name: "Mc5mr", id: BigInt(owner) }] },
    StockOne: { name: "StockOne", authors: [{ name: "lwzzh", id: 123n }] }
};
const meta = Object.fromEntries([...Object.keys(catalog), "CustomReference"].map(name => [name, {
    userPlugin: name.startsWith("Custom"), folderName: name.startsWith("Custom") ? `src/userplugins/${name}` : `src/plugins/${name}`
}]));
const constants = await readFile("src/utils/constants.ts", "utf8");
const shared = new Map([
    ["~plugins", "import {Devs} from '@utils/constants'; export default {...globalThis.catalog,CustomReference:{name:'CustomReference',authors:[Devs.Mc5mr]}}; export const PluginMeta=globalThis.meta;"],
    ["@utils/types", "export default value=>value; export const OptionType={SELECT:1,BOOLEAN:2};"],
    ["@utils/constants", constants],
    ["./constants", constants],
    ["@utils/guards", "export const isTruthy=Boolean;"],
    ["@api/Settings", "export const definePluginSettings=()=>({store:{settingsLocation:'top'}}); export const useSettings=()=>({plugins:new Proxy({}, {get:()=>({})})});"],
    ["@api/Commands", "export const generateId=()=>'-1';"],
    ["@api/PluginManager", "export const hasAnyVisibleSettings=()=>false,isSettingHidden=()=>false;"],
    ["@components/BaseText", "export const BaseText='BaseText';"],
    ["@components/Button", "export const Button='Button';"],
    ["@components/Flex", "export const Flex='Flex';"],
    ["@components/Heading", "export const Heading='Heading';"],
    ["@components/Link", "export const Link='Link';"],
    ["@components/Paragraph", "export const Paragraph='Paragraph';"],
    ["@shared/debounce", "export const debounce=value=>value;"],
    ["@utils/css", "export const classNameFactory=prefix=>suffix=>prefix+suffix;"],
    ["@utils/lazy", "export const proxyLazy=factory=>factory();"],
    ["@utils/margins", "export const Margins={top16:'top16',bottom8:'bottom8'};"],
    ["@vencord/discord-types/enums", "export const ToastPosition={TOP:0};"],
    ["@components/Icons", "export const BackupRestoreIcon=()=>null,CloudIcon=()=>null,LogIcon=()=>null,MainSettingsIcon=()=>null,PaintbrushIcon=()=>null,PatchHelperIcon=()=>null,PluginsIcon=()=>null,UpdaterIcon=()=>null,CopyIcon=()=>null,LinkIcon=()=>null;"],
    ["@components/settings", "export const BackupAndRestoreTab=()=>null,ChangelogTab=()=>null,CloudTab=()=>null,PatchHelperTab=()=>null,PluginsTab=()=>null,ThemesTab=()=>null,UpdaterTab=()=>null,VencordTab=()=>null,UserPluginsTab=()=>null;"],
    ["@components/settings/tabs", "export const openContributorModal=user=>globalThis.opened.push(user);"],
    ["@shared/vencordUserAgent", "export const gitHashShort='test',gitRemote='Mc5mr/EquicordPrivate';"],
    ["@webpack", "export const waitFor=()=>{},findCssClassesLazy=()=>({}),findComponentByCodeLazy=()=> 'NativeComponent';"],
    ["@webpack/common", `export const React={},ContextMenuApi={},Menu={},Toasts={},showToast=()=>{},
        UserStore={getUser:id=>globalThis.users[id],getCurrentUser:()=>globalThis.editionUser},
        UserUtils={getUser:async id=>{globalThis.requested.push(id);return globalThis.users[id]=globalThis.editionUser;}},
        UserProfileStore={getUserProfile:()=>({})},useStateFromStores=(_stores,read)=>read(),
        useMemo=read=>read(),useEffect=effect=>globalThis.effects.push(effect),useState=initial=>[typeof initial==='function'?initial():initial,()=>{}],
        Modal='Modal',Clickable='Clickable',UserSummaryItem='UserSummaryItem',Tooltip='Tooltip',Text='Text',FluxDispatcher={dispatch(){}},
        ChannelStore={},GuildMemberStore={},IconUtils={},openModal=render=>globalThis.modals.push(render({onClose(){},transitionState:1}));`],
    ["@api/Badges", "export const BadgePosition={START:0}; export const _getBadges=()=>[];"],
    ["@components/ErrorBoundary", "export default {wrap:f=>f};"],
    ["@utils/discord", "export const copyWithToast=()=>{},fetchUserProfile=()=>{};"],
    ["@utils/Logger", "export class Logger{error(){} warn(){}};"],
    ["@utils/misc", await readFile("src/utils/misc.ts", "utf8")],
    ["@debug/loadLazyChunks", "export const loadLazyChunks=()=>{};"],
    ["./PluginCard", "export const PluginCard='PluginCard';"],
    ["./PluginModalButtons", "export const GithubButton='GithubButton',WebsiteButton='WebsiteButton',FavoriteButton='FavoriteButton';"],
    ["./components", "export const OptionComponentMap={};"],
    ["./ContributorModal", "export const openContributorModal=user=>globalThis.opened.push(user);"],
    ["./modals", "export const EquicordDonorModal=()=>null,EquicordTranslatorModal=()=>null,VencordDonorModal=()=>null;"]
]);

async function load(file) {
    const output = await build({ entryPoints: [file], bundle: true, write: false, format: "iife", globalName: "Subject", jsxFactory: "h", define: { IS_DEV: "false", IS_STANDALONE: "true", IS_UPDATER_DISABLED: "true" }, plugins: [{ name: "catalog-fixture", setup(b) {
        b.onResolve({ filter: /\.css$/ }, () => ({ path: "empty-style", namespace: "fixture" }));
        b.onResolve({ filter: /.*/ }, args => shared.has(args.path) ? { path: args.path, namespace: "fixture" } : undefined);
        b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: shared.get(args.path) ?? "export {};", loader: "ts" }));
    } }] });
    const editionUser = { id: owner, username: "lwzzh", getAvatarURL: () => "https://example.invalid/owner-avatar.png" };
    const context = { catalog, meta, opened: [], effects: [], modals: [], requested: [], editionUser,
        users: { [owner]: editionUser },
        h: (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children } : {}) } }),
        navigator: { platform: "Win32", userAgent: "test" }, console };
    vm.createContext(context);
    vm.runInContext(output.outputFiles[0].text, context);
    return { plugin: context.Subject.default, exports: context.Subject, context };
}

const badges = await load("src/plugins/_api/badges/index.tsx");
const contributor = badges.plugin.userProfileBadges.find(badge => badge.id === "user_plugin_contributor_badge");
assert.deepEqual(Array.from(badges.plugin.userProfileBadges.filter(badge => badge.shouldShow({ userId: owner })), badge => badge.id), ["user_plugin_contributor_badge"], "edition author gets one contributor badge");
assert.equal(badges.plugin.userProfileBadges.find(badge => badge.id === "vencord_contributor_badge").shouldShow({ userId: "343383572805058560" }), true, "upstream contributor badges remain visible");
assert.equal(contributor.shouldShow({ userId: owner }), true, "standalone production author badge is visible");
assert.equal(contributor.shouldShow({ userId: "123" }), false, "stock plugin authors do not get the custom badge");
assert.equal(contributor.shouldShow({ userId: "unknown" }), false);
contributor.onClick(null, { userId: owner });
assert.equal(badges.context.opened[0].id, owner, "badge opens the author's plugin manager");

const settings = (await load("src/plugins/_core/settings.tsx")).plugin;
const builder = { key: "$Root", buildLayout: () => [{ key: "user_section" }] };
const entries = () => settings.buildLayout(builder).find(section => section.key === "equicord_section").buildLayout();
const entry = entries().filter(entry => entry.key === "vencord_userplugins");
assert.equal(entry.length, 1, "bundled custom catalog gets one sidebar entry");
assert.equal(entry[0].useTitle(), "UserPlugins");
settings.customEntries.push({ key: "vencord_userplugins", title: "Existing native installer", Component: () => null, Icon: () => null });
assert.equal(entries().filter(entry => entry.key === "vencord_userplugins").length, 1, "developer installer cannot duplicate the entry");
settings.customEntries.length = 0;
for (const value of Object.values(meta)) value.userPlugin = false;
assert.equal(entries().some(entry => entry.key === "vencord_userplugins"), false, "no empty custom tab for stock-only builds");

function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== "object") return [];
    return [node, ...Object.values(node.props ?? {}).flatMap(nodes)];
}

const modal = await load("src/components/settings/tabs/plugins/ContributorModal.tsx");
function contributionNames(user) {
    modal.exports.openContributorModal(user);
    const element = modal.context.modals.pop();
    return nodes(element.type(element.props)).filter(node => node.type === "PluginCard").map(node => node.props.plugin.name);
}
assert.deepEqual(contributionNames(modal.context.editionUser), ["CustomOne", "SharedContribution", "CustomReference", "CustomTwo"], "all matching author IDs are listed regardless of object identity or catalog, with APIs hidden and required plugins last");
assert.deepEqual(contributionNames({ ...modal.context.editionUser, username: "Renamed" }), ["CustomOne", "SharedContribution", "CustomReference", "CustomTwo"], "changing a username does not lose contributions");
assert.deepEqual(contributionNames({ ...modal.context.editionUser, id: "123" }), ["StockOne"], "matching usernames cannot claim someone else's plugins");
assert.deepEqual(contributionNames({ ...modal.context.editionUser, id: "999" }), [], "unknown author stays empty even with the same username");

const settingsModal = await load("src/components/settings/tabs/plugins/PluginModal.tsx");
const modalProps = { plugin: catalog.CustomOne, onRestartNeeded() {}, onClose() {}, transitionState: 1 };
const tree = settingsModal.plugin(modalProps);
assert.ok(nodes(tree).some(node => node.type === "Text" && node.props.children?.includes("Authors")), "author heading uses native Equicord text");
assert.equal(JSON.stringify(tree).includes("اعتمادات المصدر"), false, "the extra source-credit label is removed");
const authorStrip = nodes(tree).find(node => node.type === "UserSummaryItem");
assert.equal(authorStrip.props.users.length, 1, "the original author strip shows one avatar");
assert.equal(authorStrip.props.users[0].id, owner, "cached source author is visible on the first render");
assert.equal(nodes(tree).some(node => node.type === "details" || node.type === "summary"), false, "the source author strip is always expanded");
assert.equal(nodes(tree).some(node => node.props?.className === "vc-plugin-modal-edition-author"), false, "no duplicate edition avatar row");
const authorView = authorStrip.props.renderUser(settingsModal.context.editionUser);
assert.equal(nodes(authorView).find(node => node.type === "img").props.src, settingsModal.context.editionUser.getAvatarURL());
authorView.props.onClick();
assert.equal(settingsModal.context.opened[0].id, owner, "original avatar still opens the complete contributor list");
delete settingsModal.context.users[owner];
settingsModal.context.effects.length = 0;
settingsModal.plugin(modalProps);
settingsModal.context.effects[0]();
await Promise.resolve();
assert.deepEqual(settingsModal.context.requested, [owner], "uncached source author is requested automatically");
assert.equal(nodes(settingsModal.plugin(modalProps)).find(node => node.type === "UserSummaryItem").props.users[0].id, owner, "loaded source author appears without expanding anything");
settingsModal.context.users["123"] = { ...settingsModal.context.editionUser, id: "123", username: "Other author" };
const stockTree = settingsModal.plugin({ ...modalProps, plugin: catalog.StockOne });
assert.equal(nodes(stockTree).find(node => node.type === "UserSummaryItem").props.users[0].id, "123", "other plugins retain their actual source authors");
console.log("PASS: single edition badge, complete ID-based contributions, one always-visible original author strip, and UserPlugins sidebar.");

