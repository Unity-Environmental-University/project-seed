/**
 * LANGUAGE STATION — Content Loader
 *
 * Loads all rooms from content/**\/*.yaml at build time using Vite's
 * import.meta.glob with { eager: true, query: '?raw' }.
 *
 * Rooms are plain JS objects after loading — the YAML is just the
 * authoring surface. The GM receives and returns the same shape.
 *
 * GM INTERFACE NOTE:
 * The GM can interact with rooms in two ways:
 *   1. PRE-GENERATION: return a full room object (same shape as YAML)
 *      which gets registered via registerRoom() before the player arrives.
 *   2. INJECTION: call injectDialogOptions(roomId, npcId, options[]) to
 *      add GM-generated dialog options into an already-loaded room's NPC.
 *      This is how Act 1 options "bleed in" without the player noticing.
 *
 * All rooms — authored or GM-generated — go through registerRoom().
 * The registry IS the GM's view of the world.
 */

import yaml from 'js-yaml';
import { registerRoom, rooms } from './state.js';

// Vite: eagerly import all yaml files under content/ as raw strings
const rawFiles = import.meta.glob('/content/**/*.yaml', { eager: true, query: '?raw', import: 'default' });

/**
 * Parse and register all authored rooms from content/.
 * Call once at app startup (onMount in App.svelte).
 *
 * Walkthrough files (content/walkthrough/) are loaded separately
 * for GM context — they are NOT registered as rooms.
 *
 * @returns {{ rooms: Room[], walkthrough: object[] }}
 */
export function loadAllContent() {
  const loadedRooms = [];
  const walkthroughDocs = [];

  for (const [path, raw] of Object.entries(rawFiles)) {
    if (!raw) {
      console.warn(`[Loader] Empty file skipped: ${path}`);
      continue;
    }

    let doc;
    try {
      doc = yaml.load(raw);
    } catch (e) {
      console.error(`[Loader] Failed to parse YAML at ${path}:`, e);
      continue;
    }

    if (path.includes('/walkthrough/')) {
      // Walkthrough docs: store for GM context, don't register as rooms
      walkthroughDocs.push({ path, ...doc });
    } else {
      // Room file: validate minimally and register
      if (!doc?.id) {
        console.error(`[Loader] Room at ${path} has no id — skipping`);
        continue;
      }
      const room = normalizeRoom(doc);
      registerRoom(room);
      loadedRooms.push(room);
    }
  }

  console.info(
    `[Loader] Loaded ${loadedRooms.length} room(s), ${walkthroughDocs.length} walkthrough doc(s)`
  );

  return { rooms: loadedRooms, walkthrough: walkthroughDocs };
}

/**
 * Inject GM-generated dialog options into an already-loaded room's NPC.
 * Options are appended before the last "walk away" option (if any),
 * so they appear naturally in the middle of the list.
 *
 * This is the primary way Act 1 gets "bleed" — the GM quietly adds
 * options that couldn't have been authored, mixed with ones that were.
 *
 * @param {string} roomId
 * @param {string} npcId
 * @param {DialogOption[]} options  - GM-generated options (source: 'gm')
 */
export function injectDialogOptions(roomId, npcId, options) {
  rooms.update(roomMap => {
    const room = roomMap[roomId];
    if (!room) {
      console.warn(`[Loader] injectDialogOptions: room "${roomId}" not found`);
      return roomMap;
    }
    const npc = room.npcs?.find(n => n.id === npcId);
    if (!npc?.dialogEntry || !room._dialog?.[npc.dialogEntry]) {
      console.warn(`[Loader] injectDialogOptions: npc "${npcId}" dialog not found in "${roomId}"`);
      return roomMap;
    }

    const entryNode = room._dialog[npc.dialogEntry];
    const existing = entryNode.options ?? [];
    // Splice before the last option (usually the "walk away" / null-next option)
    const spliceAt = existing.length > 1 ? existing.length - 1 : existing.length;
    const merged = [
      ...existing.slice(0, spliceAt),
      ...options,
      ...existing.slice(spliceAt),
    ];

    return {
      ...roomMap,
      [roomId]: {
        ...room,
        _dialog: {
          ...room._dialog,
          [npc.dialogEntry]: { ...entryNode, options: merged },
        },
      },
    };
  });
}

// ── Internal ──────────────────────────────────────────────────────────────

/**
 * Normalize a raw YAML room doc into a consistent runtime shape.
 * Fills in defaults so the engine never has to null-check everything.
 *
 * The `gm_hint` field is passed through as-is — it's the GM's scratchpad
 * for a room: tone, intended puzzle state, what should feel off, etc.
 * It is never shown to the player.
 */
function normalizeRoom(doc) {
  return {
    id: doc.id,
    name: doc.name ?? doc.id,
    act: doc.act ?? 1,
    description: (doc.description ?? '').trim(),
    exits: normalizeExits(doc.exits ?? {}),
    npcs: (doc.npcs ?? []).map(normalizeNpc),
    interactables: doc.interactables ?? [],
    gmGenerated: doc.gmGenerated ?? false,
    gmSource: doc.gmSource ?? null,       // 'stub' | 'live' | null
    gm_hint: doc.gm_hint ?? null,        // GM's private room notes (never player-facing)
    _dialog: doc.dialog ?? {},           // raw dialog node map, keyed by node id
  };
}

/**
 * Normalize exits — resolve string shorthand to full objects.
 */
function normalizeExits(exits) {
  return Object.fromEntries(
    Object.entries(exits).map(([dir, exit]) => [
      dir,
      typeof exit === 'string' ? { roomId: exit } : exit,
    ])
  );
}

/**
 * Normalize an NPC — resolve its entry dialog node from the room's dialog map.
 * The NPC's `dialog` property becomes the live entry DialogNode,
 * with sub-nodes resolved from the room's flat dialog map.
 */
function normalizeNpc(npc) {
  // NPCs in YAML have dialog: { entry: node_id }
  // We resolve this lazily — the engine looks up the full node on dialog start
  return {
    id: npc.id,
    name: npc.name ?? npc.id,
    description: npc.description ?? '',
    dialogEntry: npc.dialog?.entry ?? null,
  };
}

/**
 * Resolve a dialog node from a room's _dialog map, following next references.
 * Returns a fully resolved DialogNode tree (next nodes are inlined, not ids).
 *
 * @param {object} dialogMap  - room._dialog
 * @param {string} nodeId
 * @param {Set}    [_visited] - cycle guard
 * @returns {DialogNode|null}
 */
export function resolveDialogNode(dialogMap, nodeId, _visited = new Set()) {
  if (!nodeId || !dialogMap[nodeId]) return null;
  if (_visited.has(nodeId)) {
    console.warn(`[Loader] Dialog cycle detected at node "${nodeId}"`);
    return null;
  }
  _visited.add(nodeId);

  const raw = dialogMap[nodeId];
  return {
    ...raw,
    options: (raw.options ?? []).map(opt => ({
      ...opt,
      next: opt.next
        ? resolveDialogNode(dialogMap, opt.next, new Set(_visited))
        : null,
    })),
  };
}
