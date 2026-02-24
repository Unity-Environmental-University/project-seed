/**
 * LANGUAGE STATION — Core Game State
 *
 * Single source of truth for all game state.
 * Rooms, flags, inventory, dialog history, player position.
 *
 * Intentionally flat and serializable — the GM stub and real GM
 * both receive a compressed snapshot of this, never the reactive store directly.
 */

import { writable, derived, get } from 'svelte/store';

// ── Player position ────────────────────────────────────────────────────────
export const currentRoomId = writable('arrival_bay');

// ── Flags: what has the player done/seen/triggered ────────────────────────
// e.g. { 'met_archivist': true, 'opened_airlock_panel': true }
export const flags = writable({});

// ── Inventory (minimal, Myst-style) ───────────────────────────────────────
// Items are IDs, not objects — look them up in room/content data
export const inventory = writable([]);

// ── Dialog: currently active dialog node (null = no dialog open) ──────────
export const activeDialog = writable(null);

// ── Room registry: all rooms loaded into memory ───────────────────────────
// Rooms are loaded from YAML content + GM pre-generation
export const rooms = writable({});

// ── Act tracking ──────────────────────────────────────────────────────────
export const currentAct = writable(1); // 1 | 2 | 3 | 'postmortem'

// ── GM queue: rooms the GM has been asked to pre-generate ─────────────────
export const gmQueue = writable(new Set());

// ── Compressed state snapshot for GM consumption ──────────────────────────
// Call this before any GM invocation.
export function compressStateForGM() {
  const roomId = get(currentRoomId);
  const f = get(flags);
  const inv = get(inventory);
  const act = get(currentAct);
  const roomMap = get(rooms);
  const room = roomMap[roomId];

  return {
    currentRoomId: roomId,
    currentRoomName: room?.name ?? roomId,
    act,
    flags: f,
    inventory: inv,
    // Give GM a lightweight map: room id → { name, visited, exits }
    knownRooms: Object.fromEntries(
      Object.entries(roomMap).map(([id, r]) => [
        id,
        {
          name: r.name,
          visited: !!f[`visited_${id}`],
          exits: Object.keys(r.exits ?? {}),
          gmGenerated: r.gmGenerated ?? false,
        },
      ])
    ),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function setFlag(key, value = true) {
  flags.update(f => ({ ...f, [key]: value }));
}

export function hasFlag(key) {
  return !!get(flags)[key];
}

export function addToInventory(itemId) {
  inventory.update(inv => inv.includes(itemId) ? inv : [...inv, itemId]);
}

export function removeFromInventory(itemId) {
  inventory.update(inv => inv.filter(id => id !== itemId));
}

export function registerRoom(room) {
  rooms.update(r => ({ ...r, [room.id]: room }));
}

export function markVisited(roomId) {
  setFlag(`visited_${roomId}`);
}
