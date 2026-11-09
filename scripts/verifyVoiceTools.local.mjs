import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const me = "523157034141745153";
const friend = "111111111111111111";
const visitor = "222222222222222222";
const channel = (id, guild = "g") => ({ id, guild_id: guild, type: 2, name: id });

async function load(name, extension = "tsx", entry = "index", settingsWritable = true) {
    let selectedChannel = "a";
    let currentChannel = "a";
    const channelListeners = new Set();
    const timers = new Map();
    const timerDelays = new Map();
    const dialogs = [];
    let nextTimer = 0;
    const channels = new Map([channel("a"), channel("b"), channel("c")].map(value => [value.id, value]));
    const states = new Map([[me, { userId: me, channelId: "a" }], [friend, { userId: friend, channelId: "a", mute: false, deaf: false }]]);
    const joins = [];
    const changes = [];
    const downloads = [];
    const notices = [];
    const gatewayMessages = [];
    const localMessages = [];
    const localEvents = [];
    const modals = [];
    const menuPatches = new Set();
    const styleCalls = [];
    const serverElements = new Set();
    const engine = { connections: new Set(), connect(userId) {
        const applied = {};
        const connection = {
            userId, context: "default", destroyed: false, voiceBitrate: 64000, applied,
            destroy() { this.destroyed = true; engine.connections.delete(this); },
            conn: { setTransportOptions(options) { Object.assign(applied, options); } },
            getCodecOptions: () => ({ audioEncoder: { type: 120, name: "opus", channels: 1, freq: 48000, pacsize: 960, params: { fec: true } }, encryption: "keep", videoEncoder: { codec: "h264" } }),
            getConnectionTransportOptions: () => ({ encodingVoiceBitRate: 64000, encryption: "keep" }),
            setVoiceBitRate(value) { this.voiceBitrate = value; this.conn.setTransportOptions({ encodingVoiceBitRate: value }); }
        };
        this.connections.add(connection); return connection;
    } };
    let clockOffset = 0;
    class SessionDate extends Date { static now() { return Date.now() + clockOffset; } }
    let gatewayConnected = true;
    let socket = { isSessionEstablished: () => gatewayConnected, send: (op, data, ...rest) => { gatewayMessages.push({ op, data, rest }); } };
    let activeStream = { guildId: "g", channelId: "a", ownerId: me };
    let storedPictures = [];
    let permitted = true;
    const h = (type, props, ...children) => {
        const properties = { ...(props ?? {}) };
        if (children.length) properties.children = children.flat();
        const node = { type, props: properties };
        Object.defineProperty(node, "children", { get: () => properties.children == null ? [] : Array.isArray(properties.children) ? properties.children : [properties.children] });
        return node;
    };
    const stubs = {
        ReactDOM: { createPortal: node => node },
        addServerListElement: (_position, component) => serverElements.add(component), removeServerListElement: (_position, component) => serverElements.delete(component),
        React: { useState: initial => [initial, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useLayoutEffect: () => {}, useSyncExternalStore: (_subscribe, snapshot) => snapshot(), createElement: h, cloneElement: (node, props) => h(node.type, { ...node.props, ...props }), isValidElement: value => !!value?.props, Children: { toArray: value => value == null ? [] : Array.isArray(value) ? value : [value] } },
        Menu: new Proxy({}, { get: (_target, key) => key }),
        UserStore: { getCurrentUser: () => ({ id: me }), getUser: id => ({ id, username: id, avatar: null, getAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/test.png` }), emitChange: () => {} },
        UserProfileStore: { getUserProfile: () => ({ bio: "Visible biography", pronouns: "", banner: "test" }) },
        ContextMenuApi: { openContextMenu: (_event, render) => { modals.push(render()); }, closeContextMenu: () => {} },
        enableStyle: id => styleCalls.push({ enabled: true, id }), disableStyle: id => styleCalls.push({ enabled: false, id }),
        addGlobalContextMenuPatch: patch => menuPatches.add(patch), removeGlobalContextMenuPatch: patch => menuPatches.delete(patch),
        RelationshipStore: { isFriend: id => id === friend, getFriendIDs: () => [friend] },
        ChannelStore: { getChannel: id => channels.get(id), getChannelIds: () => [...channels.keys()] },
        SelectedChannelStore: { getVoiceChannelId: () => states.get(me)?.channelId, getChannelId: () => selectedChannel, getCurrentlySelectedChannelId: () => currentChannel, addChangeListener: listener => channelListeners.add(listener), removeChangeListener: listener => channelListeners.delete(listener) },
        PermissionStore: { can: () => permitted },
        PermissionsBits: { CONNECT: 1n, VIEW_CHANNEL: 2n, MOVE_MEMBERS: 4n, MUTE_MEMBERS: 8n, DEAFEN_MEMBERS: 16n, ADMINISTRATOR: 32n, MANAGE_GUILD: 64n, MANAGE_CHANNELS: 128n, MANAGE_THREADS: 256n, MANAGE_EVENTS: 512n, MANAGE_ROLES: 1024n, MANAGE_MESSAGES: 2048n, MODERATE_MEMBERS: 4096n, KICK_MEMBERS: 8192n, BAN_MEMBERS: 16384n },
        GuildChannelStore: { getChannels: () => ({ VOCAL: [...channels.values()].map(value => ({ channel: value })) }) },
        GuildStore: { getGuild: id => ({ id, name: id, ownerId: me, premiumTier: 0, features: new Set() }), getGuilds: () => ({}) },
        GuildMemberStore: { getMember: () => ({ roles: ["admin"] }) },
        GuildRoleStore: { getRole: () => ({ permissions: 0n }) }, SelectedGuildStore: { getGuildId: () => "g" }, Tooltip: "Tooltip",
        IconUtils: { getUserAvatarURL: user => user.getAvatarURL?.() ?? `avatar:${user.id}`, getDefaultAvatarURL: id => `default:${id}`, getUserBannerURL: ({ id, banner }) => `https://cdn.discordapp.com/banners/${id}/${banner}.png` },
        UsernameUtils: { getName: user => user.globalName || user.username, getGlobalName: user => user.globalName || user.username, getFormattedName: user => user.username, getUserTag: user => user.username },
        DisplayProfileUtils: { getDisplayProfile: userId => ({ userId, bio: "Real bio", getBannerURL: () => "real-banner" }) },
        VoiceStateStore: {
            getVoiceState: (guildId, id) => { const state = states.get(id); return channels.get(state?.channelId)?.guild_id === guildId ? state : undefined; },
            getVoiceStateForUser: id => states.get(id),
            getVoiceStatesForChannel: id => Object.fromEntries([...states].filter(([, value]) => value.channelId === id))
        },
        ApplicationStreamingStore: { getCurrentUserActiveStream: () => activeStream },
        MediaEngineStore: { getMediaEngine: () => engine, isMute: () => false, isDeaf: () => false, isVideoEnabled: () => false },
        DataStore: { get: async () => storedPictures, set: async () => {} },
        findByPropsLazy: prop => prop === "getSocket" ? { getSocket: () => socket } : ({ selectVoiceChannel: async id => {
            joins.push(id);
            states.set(me, { userId: me, channelId: id });
        } }),
        RestAPI: {
            post: async request => { changes.push(request); },
            del: async request => { changes.push({ ...request, method: "DELETE" }); },
            patch: async request => {
                changes.push(request);
                const id = request.url.split("/").pop();
                const current = states.get(id);
                if (current) states.set(id, { ...current, ...(request.body.channel_id !== undefined ? { channelId: request.body.channel_id } : {}), ...(request.body.mute !== undefined ? { mute: request.body.mute } : {}), ...(request.body.deaf !== undefined ? { deaf: request.body.deaf } : {}) });
            },
            get: async () => ({ body: [] })
        },
        Constants: { Endpoints: { GUILD: id => `/guilds/${id}`, GUILD_ROLES: id => `/guilds/${id}/roles`, GUILD_ROLE: (id, role) => `/guilds/${id}/roles/${role}`, GUILD_CHANNELS: id => `/guilds/${id}/channels`, GUILD_EMOJIS: id => `/guilds/${id}/emojis`, CHANNEL: id => `/channels/${id}`, GUILD_MEMBER: (guildId, userId) => `/guilds/${guildId}/members/${userId}`, MESSAGES: id => `/channels/${id}/messages`, MESSAGE: (id, message) => `/channels/${id}/messages/${message}`, STREAM_PREVIEW: key => `/streams/${key}/preview` } },
        sleep: async () => {},
        MessageActions: { startEditMessage: (channelId, messageId, content) => localEvents.push({ type: "MESSAGE_START_EDIT", channelId, messageId, content }), endEditMessage: channelId => localEvents.push({ type: "MESSAGE_END_EDIT", channelId }) },
        fetchUserProfile: async () => undefined,
        showToast: value => notices.push(value),
        Toasts: { Type: { FAILURE: "failure", SUCCESS: "success" } },
        saveFile: file => downloads.push(file),
        definePluginSettings: definition => {
            const store = Object.fromEntries(Object.entries(definition).map(([key, value]) => [key, value.default ?? value.options?.find(option => option.default)?.value]));
            const settings = settingsWritable ? store : new Proxy(store, { set() { throw Error("An object could not be cloned."); } });
            return { store: settings, use: () => settings };
        },
        NavigationRouter: { transitionTo: path => notices.push(path) },
        Alerts: { show: alert => notices.push(alert) },
        useStateFromStores: (_stores, get) => get(), Avatar: "Avatar", Checkbox: "Checkbox", TextArea: "TextArea", TextInput: "TextInput", Select: "Select", SearchableSelect: "SearchableSelect",
        HeaderBarButton: "HeaderBarButton", UserAreaButton: "UserAreaButton", Button: "Button", Heart: "Heart", Modal: "Modal", ConfirmModal: "ConfirmModal", openModal: render => { modals.push(render({ transitionState: 0, onClose: () => {} })); }, closeModal: () => {},
        FluxDispatcher: { wait: callback => callback(), dispatch: event => localEvents.push(event) },
        sendBotMessage: (channelId, message) => { localMessages.push({ channelId, message }); return message; }
    };
    const modules = new Map([
        ["@utils/types", "export default x=>x; export const OptionType={STRING:1,SELECT:2,SLIDER:3,BOOLEAN:4,CUSTOM:5,NUMBER:6};"],
        ["@utils/constants", "export const Devs={Mc5mr:{name:'Mc5mr',id:523157034141745153n}};"],
        ["@api/ServerList", "export const {addServerListElement,removeServerListElement}=globalThis.__stubs; export const ServerListRenderPosition={Above:0};"],
        ["@api/ContextMenu", "export const {addGlobalContextMenuPatch,removeGlobalContextMenuPatch}=globalThis.__stubs;"],
        ["@api/Styles", "export const {enableStyle,disableStyle}=globalThis.__stubs;"],
        ["@api/Commands", "export const sendBotMessage=globalThis.__stubs.sendBotMessage;"],
        ["@api/HeaderBar", "export const HeaderBarButton=globalThis.__stubs.HeaderBarButton;"],
        ["@api/ChatButtons", "export const ChatBarButton='ChatBarButton';"],
        ["@api/UserArea", "export const UserAreaButton=globalThis.__stubs.UserAreaButton;"],
        ["@api/index", "export const DataStore=globalThis.__stubs.DataStore;"],
        ["@api/Settings", "export const definePluginSettings=globalThis.__stubs.definePluginSettings;"],
        ["@api/Badges", "export const BadgePosition={START:0};"],
        ["@plugins/_api/badges", "export default {getBadges: (...args) => globalThis.__stubs.ownBadges?.(...args) ?? []};"],
        ["@components/Button", "export const Button=globalThis.__stubs.Button;"],
        ["@components/FormSwitch", "export const FormSwitch='FormSwitch';"],
        ["@components/Heart", "export const Heart=globalThis.__stubs.Heart;"],
        ["@components/Icons", "export const UserIcon='UserIcon',TextIcon='TextIcon',TrashIcon='TrashIcon',PencilIcon='PencilIcon';"],
        ["@utils/css", "export const classNameFactory=prefix=>(...names)=>names.filter(name=>typeof name==='string').map(name=>prefix+name).join(' ');"],
        ["@utils/discord", "export const fetchUserProfile=(...args)=>globalThis.__stubs.fetchUserProfile(...args); export const openPrivateChannel=async()=>undefined;"],
        ["@utils/misc", 'export const sleep=globalThis.__stubs.sleep; export const classes=(...values)=>values.filter(Boolean).join(" ");'],
        ["@utils/clipboard", "export const copyToClipboard=()=>{};"],
        ["@utils/web", "export const saveFile=globalThis.__stubs.saveFile; export const chooseFile=async()=>null;"],
        ["@utils/modal", "export const openModal=()=>{}; export const ModalRoot='ModalRoot',ModalContent='ModalContent',ModalHeader='ModalHeader';"],
        ["@webpack", "export const findByPropsLazy=globalThis.__stubs.findByPropsLazy;"],
        ["@webpack/common", `const s=globalThis.__stubs; export const {${Object.keys(stubs).filter(key => !["findByPropsLazy", "sleep", "saveFile", "definePluginSettings", "Button", "Heart", "HeaderBarButton", "DataStore"].includes(key)).join(",")}}=s;`]
    ]);
    const bundle = await build({ entryPoints: [`${root}src/userplugins/${name}.discordDesktop/${entry}.${extension}`], bundle: true, write: false, format: "iife", globalName: "Subject", platform: "browser", jsxFactory: "h", jsxFragment: "Fragment", plugins: [{ name: "mock-discord", setup(builder) {
        builder.onLoad({ filter: /SilentMessageCore\.discordDesktop[\\/]index\.ts$/ }, async args => ({ contents: (await readFile(args.path, "utf8")).replace("export default definePlugin(", "const corePlugin = definePlugin(") + "\nexport default corePlugin; globalThis.__stubs.silentCore = corePlugin;", loader: "ts" }));
        builder.onResolve({ filter: /\.css(?:\?managed)?$/ }, () => ({ path: "style", namespace: "style" }));
        builder.onLoad({ filter: /.*/, namespace: "style" }, () => ({ contents: "export default '';", loader: "js" }));
        builder.onResolve({ filter: /^@/ }, args => modules.has(args.path) ? { path: args.path, namespace: "mock" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: modules.get(args.path), loader: "js" }));
    } }] });
    const context = { __stubs: stubs, h, Fragment: "Fragment", File, URL, Date: SessionDate, console, document: { body: {}, querySelectorAll: () => dialogs, createElement: () => ({ className: "", remove() {} }) }, MutationObserver: class { observe() {} disconnect() {} }, Vencord: { Plugins: { plugins: {} } }, setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, callback); timerDelays.set(id, delay); return id; }, clearTimeout: id => timers.delete(id) };
    vm.createContext(context);
    vm.runInContext(bundle.outputFiles[0].text, context);
    const plugin = context.Subject.default;
    const drain = async () => {
        const callbacks = [...timers.values()];
        timers.clear();
        for (const callback of callbacks) callback();
        for (let i = 0; i < 30; i++) await Promise.resolve();
    };
    return { dialogs, timerDelays, plugin, exports: context.Subject, stubs, serverElements, engine, states, channels, joins, changes, downloads, notices, timers, drain, gatewayMessages, localMessages, localEvents, modals, menuPatches, styleCalls, channelListeners, setSelectedChannel: id => { selectedChannel = currentChannel = id; channelListeners.forEach(listener => listener()); }, setCurrentChannel: id => { currentChannel = id; channelListeners.forEach(listener => listener()); }, advanceClock: ms => { clockOffset += ms; }, getSocket: () => socket, setGatewayConnected: value => { gatewayConnected = value; }, replaceSocket: () => { socket = { isSessionEstablished: () => gatewayConnected, send: (op, data, ...rest) => { gatewayMessages.push({ op, data, rest }); } }; }, setStream: stream => { activeStream = stream; }, setPictures: value => { storedPictures = value; }, deny: () => { permitted = false; } };
}

function item(nodes, id) {
    for (const node of nodes.flat()) {
        if (!node || typeof node !== "object") continue;
        if (node.props?.id === id) return node;
        const found = item(node.children ?? [], id);
        if (found) return found;
    }
}

function findButton(node, label) {
    if (!node || typeof node !== "object") return;
    if (node.type === "Button" && node.children.includes(label)) return node;
    for (const child of node.children ?? []) { const result = findButton(child, label); if (result) return result; }
}const quickRules = await load("VoiceLists");
quickRules.plugin.start();
const quickMenu = [];
quickRules.plugin.contextMenus["user-context"](quickMenu, { user: { id: friend } });
item(quickMenu, "mc5mr-rule-mute").props.action();
const firstRuleCheck = [...quickRules.timers.keys()][0];
assert.equal(quickRules.timerDelays.get(firstRuleCheck), 0, "voice tools react without an artificial debounce");
for (let i = 0; i < 50; i++) quickRules.plugin.flux.VOICE_STATE_UPDATES();
assert.deepEqual([...quickRules.timers.keys()], [firstRuleCheck], "voice event bursts cannot postpone a pending rule check");
await quickRules.drain();
assert.equal(quickRules.changes.length, 1, "coalesced updates produce a single required member change");
quickRules.plugin.stop();
assert.equal(quickRules.timers.size, 0);

const responsive = await load("VoiceLists");
responsive.plugin.start();
responsive.states.set(visitor, { userId: visitor, channelId: "b", mute: false, deaf: false });
const memberMenu = (subject, id) => { const menu = []; subject.plugin.contextMenus["user-context"](menu, { user: { id }, guildId: "g" }); return menu; };
let releaseMember;
const stalledMember = new Promise(resolve => { releaseMember = resolve; });
const nativeMemberPatch = responsive.stubs.RestAPI.patch;
const memberRequests = [];
responsive.stubs.RestAPI.patch = async request => {
    memberRequests.push(request);
    if (request.url.endsWith(friend) && memberRequests.length === 1) await stalledMember;
    return nativeMemberPatch(request);
};
item(memberMenu(responsive, friend), "mc5mr-rule-mute").props.action();
item(memberMenu(responsive, friend), "mc5mr-rule-deaf").props.action();
item(memberMenu(responsive, visitor), "mc5mr-rule-pull").props.action();
await responsive.drain();
assert.equal(responsive.states.get(visitor).channelId, "a", "one slow member request cannot delay another person's Pull");
assert.equal(memberRequests.filter(request => request.url.endsWith(friend)).length, 1, "changes for the same member stay serialized");
releaseMember(); await responsive.drain();
assert.equal(responsive.states.get(friend).mute, true);
assert.equal(responsive.states.get(friend).deaf, true);
responsive.plugin.stop(); assert.equal(responsive.timers.size, 0);

const awaitingAck = await load("VoiceLists"); awaitingAck.plugin.start();
awaitingAck.stubs.RestAPI.patch = async request => { awaitingAck.changes.push(request); };
item(memberMenu(awaitingAck, friend), "mc5mr-rule-mute").props.action();
await awaitingAck.drain(); await awaitingAck.drain();
assert.equal(awaitingAck.changes.length, 1, "a successful request cannot continuously resend while its gateway acknowledgement is pending");
awaitingAck.plugin.stop();

const limitedRules = await load("VoiceLists"); limitedRules.plugin.start();
const limitedPatch = limitedRules.stubs.RestAPI.patch;
let voiceLimitAttempts = 0;
limitedRules.stubs.RestAPI.patch = async request => {
    if (++voiceLimitAttempts === 1) throw { status: 429, body: { retry_after: 2.5 } };
    return limitedPatch(request);
};
item(memberMenu(limitedRules, friend), "mc5mr-rule-mute").props.action(); await limitedRules.drain();
const retryTimer = [...limitedRules.timers.keys()][0];
assert.equal(limitedRules.timerDelays.get(retryTimer), 2500, "Discord's retry_after controls the retry delay");
assert.match(item(memberMenu(limitedRules, friend), "mc5mr-rule-mute").props.label, /إيقاف/, "rate limits preserve the rule");
limitedRules.plugin.flux.VOICE_STATE_UPDATES(); await limitedRules.drain(); await limitedRules.drain();
assert.equal(voiceLimitAttempts, 2); assert.equal(limitedRules.states.get(friend).mute, true);
limitedRules.plugin.stop(); assert.equal(limitedRules.timers.size, 0);

const fastWalk = await load("VoiceLists"); fastWalk.plugin.start();
fastWalk.states.set(visitor, { userId: visitor, channelId: "a" });
item(memberMenu(fastWalk, friend), "mc5mr-walk").props.action();
for (let i = 0; i < 12; i++) await Promise.resolve();
assert.equal(fastWalk.changes.length, 1, "Walk starts its first move immediately");
assert.equal([...fastWalk.timerDelays.values()][0], 1500, "Walk keeps bounded pacing without the old eight-second pause");
item(memberMenu(fastWalk, visitor), "mc5mr-walk").props.action();
for (let i = 0; i < 12; i++) await Promise.resolve();
assert.equal(fastWalk.changes.length, 2, "a walk does not block starting another person's action");
item(memberMenu(fastWalk, friend), "mc5mr-stop-user").props.action();
await fastWalk.drain();
assert.equal(fastWalk.changes.filter(request => request.url.endsWith(friend)).length, 1, "stopping a walk cancels its remaining moves");
fastWalk.plugin.stop(); assert.equal(fastWalk.timers.size, 0);
await fastWalk.drain(); assert.equal(fastWalk.changes.length, 3);

const stoppedWalk = await load("VoiceLists"); stoppedWalk.plugin.start();
let releaseStoppedWalk;
stoppedWalk.stubs.RestAPI.patch = () => new Promise(resolve => { releaseStoppedWalk = resolve; });
item(memberMenu(stoppedWalk, friend), "mc5mr-walk").props.action();
stoppedWalk.plugin.stop(); releaseStoppedWalk(); await stoppedWalk.drain();
assert.equal(stoppedWalk.timers.size, 0, "a request completing after stop cannot create a new Walk timer");

const cameraCheck = await load("FakeCamera");
cameraCheck.states.set(me, { userId: me, channelId: "a", selfVideo: true });
cameraCheck.stubs.VoiceStateStore.getVoiceStateForUser = () => ({ userId: me, channelId: "b", selfVideo: false });
findButton(cameraCheck.plugin.settingsAboutComponent(), "فحص حالة Discord").props.onClick();
assert.match(cameraCheck.notices.at(-1), /يعرض علامة الكاميرا/, "camera diagnostics inspect the selected desktop voice channel instead of another device");
cameraCheck.states.delete(me);
findButton(cameraCheck.plugin.settingsAboutComponent(), "فحص حالة Discord").props.onClick();
assert.match(cameraCheck.notices.at(-1), /ادخل روم/);

const playback = await load("StreamPlaybackFix", "ts");
const decoderOptions = {
    videoEncoder: { name: "H264", params: { "hardware-h264": "1" } },
    audioEncoder: { name: "opus", channels: 2 }, audioDecoders: [{ name: "opus" }],
    videoDecoders: [{ name: "H264", params: { "hardware-h264": "1", "profile-level-id": "42e034" } }, { name: "AV1X", params: { "hardware-av1-decode": "1" } }, { name: "H265", params: { "software-h265": "0" } }]
};
const incomingCodecs = playback.plugin.prepareDecoders(decoderOptions, "stream");
assert.equal(incomingCodecs.videoDecoders[0].params["hardware-h264"], "0");
assert.equal(incomingCodecs.videoDecoders[0].params["profile-level-id"], "42e034");
assert.equal(incomingCodecs.videoDecoders[1].params["hardware-av1-decode"], "0");
assert.equal(incomingCodecs.videoDecoders.length, 2, "the failing H265 decoder is removed from the native receive options");
assert.ok(incomingCodecs.videoDecoders.every(decoder => decoder.params["fallback-on-consecutive-errors"] === "1"));
assert.equal(incomingCodecs.videoEncoder, decoderOptions.videoEncoder, "outgoing video encoding is untouched");
assert.equal(incomingCodecs.audioEncoder, decoderOptions.audioEncoder, "stereo microphone encoding is untouched");
assert.equal(incomingCodecs.audioDecoders, decoderOptions.audioDecoders);
assert.equal(decoderOptions.videoDecoders[0].params["hardware-h264"], "1", "native codec objects are not mutated");
assert.equal(playback.plugin.prepareDecoders(decoderOptions, "default"), decoderOptions, "ordinary voice and camera connections are untouched");
assert.equal(playback.plugin.prepareDecoders(decoderOptions, "stream", false), decoderOptions, "outgoing screen share options are untouched");
const capabilities = [{ name: "H265", encode: true, decode: true }, { name: "H264", encode: true, decode: true }, { name: "VP8", encode: true, decode: true }];
const receivedCapabilities = playback.plugin.prepareCapabilities(capabilities, "stream");
assert.equal(receivedCapabilities.length, 2, "incoming negotiation removes H265 entirely instead of leaving its encode flag advertised");
assert.equal(receivedCapabilities[0], capabilities[1]); assert.equal(receivedCapabilities[1], capabilities[2]);
assert.equal(playback.plugin.prepareCapabilities(capabilities, "stream", false), capabilities, "outgoing H265 encoding capability is preserved");
assert.equal(capabilities[0].decode, true, "native capability objects are not mutated");
assert.equal(playback.plugin.prepareCapabilities(capabilities, "default"), capabilities);
const negotiationPatch = playback.plugin.patches[0].replacement;
const negotiationPattern = new RegExp(negotiationPatch.match.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));
const nativeNegotiationFixture = 'this.videoSupported?L(o,r,d).map((e,t)=>({name:e.name})) : []';
assert.equal(nativeNegotiationFixture.replace(negotiationPattern, negotiationPatch.replace), 'this.videoSupported?$self.prepareCapabilities(L(o,r,d),this.context,this.streamUserId!==this.userId).map((e,t)=>({name:e.name})) : []');
const decoderPatch = playback.plugin.patches[1].replacement;
const decoderPattern = new RegExp(decoderPatch.match.source.replaceAll("\\i", "[A-Za-z_$][\\w$]*"));
const nativeCodecFixture = 'return{videoEncoder:l,videoDecoders:s,audioEncoder:r,audioDecoders:a}';
assert.match(nativeCodecFixture, decoderPattern);
assert.equal(nativeCodecFixture.replace(decoderPattern, decoderPatch.replace), 'return $self.prepareDecoders({videoEncoder:l,videoDecoders:s,audioEncoder:r,audioDecoders:a},this.context,this.streamUserId!==this.userId)');
assert.equal(playback.plugin.hidden, true); assert.equal(playback.plugin.required, true, "stream repair remains active without a plugin-list toggle");
console.log("PASS: independent voice request queues, acknowledgement pacing, rate-limit preservation, immediate cancellable walks and isolated stream decoder fallback.");

