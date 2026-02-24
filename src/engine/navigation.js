/**
 * LANGUAGE STATION — Navigation Engine
 *
 * Handles room transitions, exit resolution, and triggering GM pre-generation
 * for adjacent rooms before the player arrives.
 */

import { get } from 'svelte/store';
import { currentRoomId, rooms, flags, markVisited, gmQueue } from './state.js';
import { gmPrefetchRoom } from '../gm/index.js';

/**
 * Attempt to move the player through an exit.
 * Returns { success, reason } — reason is shown to player on failure.
 */
export function navigate(direction) {
  const roomMap = get(rooms);
  const roomId = get(currentRoomId);
  const room = roomMap[roomId];

  if (!room) {
    return { success: false, reason: `You are unmoored. Room "${roomId}" does not exist.` };
  }

  const exit = room.exits?.[direction];

  if (!exit) {
    return { success: false, reason: `There is nothing in that direction.` };
  }

  // Exit can be a string (room id) or an object with conditions
  const targetId = typeof exit === 'string' ? exit : exit.roomId;
  const condition = typeof exit === 'object' ? exit.requires : null;

  if (condition) {
    const f = get(flags);
    if (!f[condition]) {
      const locked = typeof exit === 'object' && exit.lockedMessage
        ? exit.lockedMessage
        : `Something prevents you from going that way.`;
      return { success: false, reason: locked };
    }
  }

  if (!roomMap[targetId]) {
    return { success: false, reason: `The way is there, but the space beyond hasn't formed yet.` };
  }

  // Move player
  currentRoomId.set(targetId);
  markVisited(targetId);

  // Trigger GM pre-generation for rooms adjacent to where we just arrived
  schedulePrefetch(targetId);

  return { success: true };
}

/**
 * Queue GM pre-generation for all unvisited exits from a given room.
 */
function schedulePrefetch(roomId) {
  const roomMap = get(rooms);
  const room = roomMap[roomId];
  if (!room?.exits) return;

  const queue = get(gmQueue);

  for (const [, exit] of Object.entries(room.exits)) {
    const targetId = typeof exit === 'string' ? exit : exit.roomId;
    // Only prefetch rooms that don't exist yet (GM needs to generate them)
    if (!roomMap[targetId] && !queue.has(targetId)) {
      gmQueue.update(q => new Set([...q, targetId]));
      gmPrefetchRoom(targetId, roomId);
    }
  }
}

/**
 * Get available exits for the current room, with lock state resolved.
 * Returns array of { direction, targetId, locked, lockedMessage }
 */
export function getAvailableExits() {
  const roomMap = get(rooms);
  const roomId = get(currentRoomId);
  const room = roomMap[roomId];
  const f = get(flags);

  if (!room?.exits) return [];

  return Object.entries(room.exits).map(([direction, exit]) => {
    const targetId = typeof exit === 'string' ? exit : exit.roomId;
    const condition = typeof exit === 'object' ? exit.requires : null;
    const locked = condition ? !f[condition] : false;
    const lockedMessage = typeof exit === 'object' ? exit.lockedMessage : null;

    return { direction, targetId, locked, lockedMessage };
  });
}
