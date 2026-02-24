/**
 * LANGUAGE STATION — Event Log
 *
 * Append-only tagged log. Every significant event — player action,
 * GM action, navigation, dialog choice — goes through here.
 *
 * Entries are accumulated in memory and flushed to the server
 * via save.js on every meaningful action. The server is the
 * canonical store; this module is the authoring interface.
 *
 * TAG CONVENTIONS (open vocabulary — add as needed):
 *   room:{id}           — event concerns this room
 *   npc:{id}            — event concerns this NPC/speaker
 *   source:{authored|gm|station} — origin of content involved
 *   act:{1|2|3}         — which act
 *   gm_action           — GM did something (generated, injected, etc.)
 *   player_choice       — player chose a dialog option
 *   station_spoke       — the Station itself was a speaker
 *   flag_set            — a game flag was set
 *   postmortem_significant — GM flagged as narratively meaningful
 *   seam_visible        — moment authored/GM boundary became legible
 *
 * ENTRY TYPES (closed set — add sparingly):
 *   room_entered        — player moved into a room
 *   dialog_started      — player initiated dialog with an NPC
 *   dialog_chosen       — player chose a dialog option
 *   dialog_ended        — dialog closed
 *   interactable_used   — player examined/used an object
 *   flag_set            — a flag was set (by player action or GM)
 *   item_taken          — item added to inventory
 *   gm_room_generated   — GM pre-generated a room
 *   gm_options_injected — GM injected dialog options into a room
 *   gm_description_set  — GM overrode a room description
 *   gm_npc_added        — GM added an NPC to a room
 *   act_changed         — act transition
 */

import { get } from 'svelte/store';
import { currentAct } from './state.js';

/**
 * Build a log entry. Does NOT flush — call via save.js append methods.
 *
 * @param {string} type
 * @param {string[]} tags
 * @param {object} data
 * @returns {LogEntry}
 */
export function makeEntry(type, tags, data = {}) {
  return {
    t: Date.now(),
    type,
    act: get(currentAct),
    tags: dedupeTags([`act:${get(currentAct)}`, ...tags]),
    data,
  };
}

// ── Convenience builders — one per event type ─────────────────────────────
// These produce entries; callers pass them to save.appendLog()

export function entryRoomEntered(roomId, gmGenerated = false) {
  return makeEntry('room_entered', [
    `room:${roomId}`,
    ...(gmGenerated ? ['gm_action'] : []),
  ], { roomId, gmGenerated });
}

export function entryDialogStarted(roomId, npcId) {
  return makeEntry('dialog_started', [
    `room:${roomId}`, `npc:${npcId}`,
  ], { roomId, npcId });
}

export function entryDialogChosen(roomId, npcId, nodeId, optionText, source) {
  return makeEntry('dialog_chosen', [
    `room:${roomId}`, `npc:${npcId}`, `source:${source}`, 'player_choice',
    ...(source === 'station' ? ['station_spoke'] : []),
  ], { roomId, npcId, nodeId, optionText, source });
}

export function entryDialogEnded(roomId, npcId) {
  return makeEntry('dialog_ended', [
    `room:${roomId}`, `npc:${npcId}`,
  ], { roomId, npcId });
}

export function entryInteractableUsed(roomId, itemId, itemName) {
  return makeEntry('interactable_used', [
    `room:${roomId}`,
  ], { roomId, itemId, itemName });
}

export function entryFlagSet(key, value, roomId = null) {
  return makeEntry('flag_set', [
    'flag_set',
    ...(roomId ? [`room:${roomId}`] : []),
  ], { key, value, roomId });
}

export function entryItemTaken(itemId, roomId) {
  return makeEntry('item_taken', [
    `room:${roomId}`,
  ], { itemId, roomId });
}

export function entryGMRoomGenerated(roomId, fromRoomId, gmSource) {
  return makeEntry('gm_room_generated', [
    `room:${roomId}`, 'gm_action',
  ], { roomId, fromRoomId, gmSource });
}

export function entryGMOptionsInjected(roomId, npcId, count, gmSource) {
  return makeEntry('gm_options_injected', [
    `room:${roomId}`, `npc:${npcId}`, 'gm_action',
  ], { roomId, npcId, count, gmSource });
}

export function entryGMDescriptionSet(roomId, gmSource) {
  return makeEntry('gm_description_set', [
    `room:${roomId}`, 'gm_action',
  ], { roomId, gmSource });
}

export function entryGMNpcAdded(roomId, npcId, gmSource) {
  return makeEntry('gm_npc_added', [
    `room:${roomId}`, `npc:${npcId}`, 'gm_action',
  ], { roomId, npcId, gmSource });
}

export function entryActChanged(from, to) {
  return makeEntry('act_changed', [], { from, to });
}

// ── Utilities ─────────────────────────────────────────────────────────────

function dedupeTags(tags) {
  return [...new Set(tags)];
}

/**
 * Filter a log array by tags (AND match — entry must have ALL required tags).
 * Used by GM context builder and postmortem.
 *
 * @param {LogEntry[]} log
 * @param {string[]} tags
 * @returns {LogEntry[]}
 */
export function filterLog(log, tags) {
  return log.filter(entry => tags.every(tag => entry.tags?.includes(tag)));
}

/**
 * Get the most recent N entries matching tags.
 */
export function recentLog(log, tags, n = 20) {
  return filterLog(log, tags).slice(-n);
}
