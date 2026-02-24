/**
 * LANGUAGE STATION — GM Interface
 *
 * This module is the boundary between the game engine and the AI GM.
 * In production, these functions call the real GM API.
 * In development, they call the STUB below — which is VERY LOUD about being fake.
 *
 * HOW TO SWITCH:
 *   Set GM_MODE in your .env:
 *     VITE_GM_MODE=stub     → uses GMStub (default in dev)
 *     VITE_GM_MODE=live     → uses real GM API
 *
 * DO NOT ship with VITE_GM_MODE=stub. The stub will also yell at you if you try.
 */

import { GMStub } from './stub.js';
// import { GMLive } from './live.js';  // ← wire in when ready

const GM_MODE = import.meta.env.VITE_GM_MODE ?? 'stub';

function getGM() {
  if (GM_MODE === 'live') {
    // return new GMLive();
    throw new Error('[GM] Live GM not yet implemented. Set VITE_GM_MODE=stub.');
  }
  return new GMStub();
}

const gm = getGM();

/**
 * Ask the GM to pre-generate a room before the player arrives.
 * Called by navigation.js when the player enters an adjacent room.
 *
 * @param {string} roomId         - the room to generate
 * @param {string} fromRoomId     - where the player currently is
 * @returns {Promise<Room|null>}
 */
export async function gmPrefetchRoom(roomId, fromRoomId) {
  return gm.prefetchRoom(roomId, fromRoomId);
}

/**
 * Ask the GM to generate dialog options for an NPC in the current context.
 * These options will be mixed with authored options — the player sees no difference.
 *
 * @param {string} npcId
 * @param {object} stateSnapshot  - from compressStateForGM()
 * @param {Array}  dialogHistory  - current conversation so far
 * @returns {Promise<DialogOption[]>}
 */
export async function gmGenerateOptions(npcId, stateSnapshot, dialogHistory) {
  return gm.generateOptions(npcId, stateSnapshot, dialogHistory);
}

/**
 * Ask the GM to generate a Station response (Act 2+).
 * The Station is a special speaker — ambiguously AI, ghost, or the space itself.
 *
 * @param {object} stateSnapshot
 * @param {string} playerMessage  - what the player just said/chose
 * @returns {Promise<DialogNode>}
 */
export async function gmStationResponse(stateSnapshot, playerMessage) {
  return gm.stationResponse(stateSnapshot, playerMessage);
}
