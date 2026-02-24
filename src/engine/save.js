/**
 * LANGUAGE STATION — Client Save API
 *
 * Thin client layer over the save server.
 * The server is canonical — this module is just the fetch wrapper
 * and the boot sequence that applies a loaded save to engine state.
 *
 * Usage:
 *   await save.load(slotId)          — boot: load save, apply overlays
 *   await save.patch(slotId, diff)   — partial update (player state, rooms, log)
 *   await save.appendLog(slotId, entries[])  — shorthand for log-only patch
 *
 * All write operations are fire-and-forget by default (no await needed
 * for player navigation/dialog — we don't block the game on a save).
 * Critical operations (act changes, GM writes) should await.
 *
 * ── KNOWN RISK: STATE DRIFT ───────────────────────────────────────────────
 * Patches are fire-and-forget. Rapid navigation or concurrent GM writes can
 * cause patches to arrive at the server out of order, triggering a 409
 * seq_mismatch. When that happens the patch is dropped and a console.error
 * is emitted — game continues but that action is not persisted.
 *
 * The server enforces seq to make this LOUD rather than silent.
 * A 409 in the console means state has drifted. If this becomes frequent:
 *   → implement a write queue here (serialize patches, retry on 409)
 *   → or await patches at action boundaries instead of fire-and-forget
 *
 * For now: trust the log, fail loud, fix when it's actually a problem.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { get } from 'svelte/store';
import {
  currentRoomId, currentAct, flags, inventory,
  rooms as roomStore,
  registerRoom, setFlag, addToInventory,
} from './state.js';
import { injectDialogOptions, resolveDialogNode } from './loader.js';

const SERVER = import.meta.env.VITE_SAVE_SERVER_URL ?? 'http://localhost:3001';

// ── Core fetch helpers ────────────────────────────────────────────────────

async function apiFetch(method, path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 409) {
    const detail = await res.json().catch(() => ({}));
    // STATE DRIFT DETECTED — see module comment above
    console.error(
      `[Save] STATE DRIFT: seq mismatch on ${path}.\n` +
      `  Client seq: ${detail.clientSeq}, Server seq: ${detail.serverSeq}\n` +
      `  This patch was dropped. Reload the save to resync.\n` +
      `  If this happens often, implement a write queue in save.js.`
    );
    return { ok: false, drifted: true, ...detail };
  }

  if (!res.ok) throw new Error(`[Save] ${method} ${path} → ${res.status}`);
  return res.json();
}

// ── Public API ────────────────────────────────────────────────────────────

export const save = {
  /**
   * Load a save slot and apply it to engine state.
   * Called once at boot after YAML rooms are loaded.
   *
   * Order:
   *   1. Load save JSON from server (creates fresh save if missing)
   *   2. Restore player state (position, flags, inventory, act)
   *   3. Apply room overlays (GM additions on top of authored YAML)
   *   4. Return the full save for any further boot logic
   */
  async load(slotId) {
    const data = await apiFetch('GET', `/saves/${slotId}`);
    applyPlayerState(data.player);
    applyRoomOverlays(data.rooms ?? {});
    return data;
  },

  /**
   * Partial update — send only what changed.
   * Player state and room overlays are merged server-side.
   * Log entries are appended server-side.
   *
   * @param {string} slotId
   * @param {{ player?, rooms?, appendLog? }} diff
   */
  async patch(slotId, diff) {
    return apiFetch('PATCH', `/saves/${slotId}`, diff);
  },

  /**
   * Append log entries only — no other state change.
   * Fire-and-forget for player actions; await for GM actions.
   */
  async appendLog(slotId, entries) {
    return apiFetch('PATCH', `/saves/${slotId}`, { appendLog: entries });
  },

  /**
   * Snapshot current engine state as a player diff for the server.
   * Call this on any player action that changes state.
   */
  playerDiff() {
    return {
      currentRoomId: get(currentRoomId),
      act: get(currentAct),
      flags: get(flags),
      inventory: get(inventory),
    };
  },

  /**
   * Full save replace — used rarely (new game, act transitions).
   */
  async replace(slotId, fullSave) {
    return apiFetch('PUT', `/saves/${slotId}`, fullSave);
  },

  async listSlots() {
    return apiFetch('GET', '/saves');
  },

  async deleteSlot(slotId) {
    return apiFetch('DELETE', `/saves/${slotId}`);
  },

  /**
   * Fetch log for a slot, optionally filtered by tags.
   * Used by GM context builder and postmortem.
   *
   * @param {string} slotId
   * @param {string[]} [tags]  — AND match
   */
  async getLog(slotId, tags) {
    const query = tags?.length ? `?tags=${tags.join(',')}` : '';
    return apiFetch('GET', `/saves/${slotId}/log${query}`);
  },
};

// ── Boot helpers ──────────────────────────────────────────────────────────

/**
 * Restore player state from save to engine stores.
 */
function applyPlayerState(player) {
  if (!player) return;

  if (player.currentRoomId) currentRoomId.set(player.currentRoomId);
  if (player.act) currentAct.set(player.act);
  if (player.flags) {
    for (const [k, v] of Object.entries(player.flags)) setFlag(k, v);
  }
  if (player.inventory) {
    for (const itemId of player.inventory) addToInventory(itemId);
  }
}

/**
 * Apply sparse room overlays from the save on top of already-loaded YAML rooms.
 *
 * Overlay shape per room:
 * {
 *   descriptionOverride: string | null,
 *   addedNpcs: NPC[],
 *   addedInteractables: Interactable[],
 *   injectedDialog: { [npcId]: DialogOption[] },
 *   gmRoom: Room | null,   // full GM-generated room (replaces YAML entirely)
 * }
 */
function applyRoomOverlays(rooms) {
  for (const [roomId, overlay] of Object.entries(rooms)) {
    if (!overlay) continue;

    // Full GM-generated room — register it (may be new, not in YAML)
    if (overlay.gmRoom) {
      registerRoom(overlay.gmRoom);
      continue; // gmRoom replaces — don't apply partial overlays on top
    }

    // Partial overlay on an authored room
    roomStore.update(roomMap => {
        const room = roomMap[roomId];
        if (!room) {
          console.warn(`[Save] applyRoomOverlays: room "${roomId}" not in registry, skipping`);
          return roomMap;
        }

        let updated = { ...room };

        if (overlay.descriptionOverride) {
          updated.description = overlay.descriptionOverride;
        }
        if (overlay.addedNpcs?.length) {
          updated.npcs = [...(room.npcs ?? []), ...overlay.addedNpcs];
        }
        if (overlay.addedInteractables?.length) {
          updated.interactables = [...(room.interactables ?? []), ...overlay.addedInteractables];
        }

        return { ...roomMap, [roomId]: updated };
      });

    // injectedDialog applied after store update
    if (overlay.injectedDialog) {
      for (const [npcId, options] of Object.entries(overlay.injectedDialog)) {
        injectDialogOptions(roomId, npcId, options);
      }
    }
  }
}
