/**
 * LANGUAGE STATION — Save Server
 *
 * Minimal Express server. Owns the save files — client holds no
 * canonical state. All game state lives in saves/{slotId}.json.
 *
 * Routes:
 *   GET    /saves                    list all slots (id, updatedAt, act, currentRoom)
 *   GET    /saves/:slotId            load a full save
 *   PUT    /saves/:slotId            replace full save (client sends complete state)
 *   PATCH  /saves/:slotId            partial update (player state, room overlay, log append)
 *   DELETE /saves/:slotId            delete a slot
 *   GET    /saves/:slotId/log        full log for a slot
 *   GET    /saves/:slotId/log?tags=  log filtered by tags (comma-separated, AND match)
 *
 * The GM will use PATCH to write room overlays and append log entries
 * without clobbering the rest of the save.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVES_DIR = path.join(__dirname, 'saves');
const PORT = process.env.PORT ?? 3001;

if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Helpers ───────────────────────────────────────────────────────────────

function savePath(slotId) {
  // Sanitize — slot IDs are simple strings only
  const safe = slotId.replace(/[^a-z0-9_-]/gi, '_');
  return path.join(SAVES_DIR, `${safe}.json`);
}

function readSave(slotId) {
  const p = savePath(slotId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeSave(slotId, data) {
  fs.writeFileSync(savePath(slotId), JSON.stringify(data, null, 2), 'utf8');
}

function makeEmptySave(slotId) {
  return {
    version: 1,
    slotId,
    seq: 0,      // increments on every write — used for drift detection
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    player: {
      currentRoomId: 'arrival_bay',
      act: 1,
      flags: {},
      inventory: [],
    },
    rooms: {},   // sparse: only rooms the GM has touched
    log: [],
  };
}

// ── Routes ────────────────────────────────────────────────────────────────

// List all slots
app.get('/saves', (_req, res) => {
  const files = fs.readdirSync(SAVES_DIR).filter(f => f.endsWith('.json'));
  const slots = files.map(f => {
    try {
      const save = JSON.parse(fs.readFileSync(path.join(SAVES_DIR, f), 'utf8'));
      return {
        slotId: save.slotId,
        updatedAt: save.updatedAt,
        act: save.player?.act,
        currentRoomId: save.player?.currentRoomId,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
  res.json(slots);
});

// Load full save (or create if missing)
app.get('/saves/:slotId', (req, res) => {
  const save = readSave(req.params.slotId);
  if (!save) {
    // Auto-create on first load
    const fresh = makeEmptySave(req.params.slotId);
    writeSave(req.params.slotId, fresh);
    return res.json(fresh);
  }
  res.json(save);
});

// Replace full save
app.put('/saves/:slotId', (req, res) => {
  const save = { ...req.body, updatedAt: new Date().toISOString() };
  writeSave(req.params.slotId, save);
  res.json({ ok: true });
});

// Partial update — merge player state, room overlays, append log entries
// Body shape (all fields optional):
// {
//   player: { currentRoomId?, act?, flags?, inventory? },
//   rooms: { [roomId]: RoomOverride },   // merged, not replaced
//   appendLog: LogEntry[]                // appended, not replaced
// }
app.patch('/saves/:slotId', (req, res) => {
  let save = readSave(req.params.slotId);
  if (!save) save = makeEmptySave(req.params.slotId);

  // ── Seq drift detection ───────────────────────────────────────────────────
  // Client must send the seq it last loaded. If it doesn't match, the client
  // is operating on stale state — patches would silently corrupt the save.
  //
  // THIS IS A HARD FAIL, NOT A MERGE.
  // The client should reload and re-derive its action from fresh state.
  //
  // Known risk: fire-and-forget patches from rapid navigation can arrive
  // out of order and trigger false 409s. When that becomes a real problem,
  // implement a write queue on the client. For now: fail loud, fix later.
  // ─────────────────────────────────────────────────────────────────────────
  const clientSeq = req.body.seq;
  if (clientSeq !== undefined && clientSeq !== save.seq) {
    console.warn(
      `[Save] seq mismatch on ${req.params.slotId}: ` +
      `client has ${clientSeq}, server has ${save.seq}. Rejecting.`
    );
    return res.status(409).json({
      error: 'seq_mismatch',
      clientSeq,
      serverSeq: save.seq,
      message: 'Client state is stale. Reload save before patching.',
    });
  }

  const { player, rooms, appendLog } = req.body;

  if (player) {
    save.player = { ...save.player, ...player };
    // Deep merge flags
    if (player.flags) {
      save.player.flags = { ...save.player.flags, ...player.flags };
    }
    // Deep merge inventory (union)
    if (player.inventory) {
      const combined = new Set([...(save.player.inventory ?? []), ...player.inventory]);
      save.player.inventory = [...combined];
    }
  }

  if (rooms) {
    for (const [roomId, overlay] of Object.entries(rooms)) {
      const existing = save.rooms[roomId] ?? {};
      save.rooms[roomId] = mergeRoomOverlay(existing, overlay);
    }
  }

  if (appendLog?.length) {
    save.log = [...save.log, ...appendLog];
  }

  save.seq = (save.seq ?? 0) + 1;
  save.updatedAt = new Date().toISOString();
  writeSave(req.params.slotId, save);
  res.json({ ok: true, seq: save.seq });
});

// Delete a slot
app.delete('/saves/:slotId', (req, res) => {
  const p = savePath(req.params.slotId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ ok: true });
});

// Log — full or tag-filtered
// ?tags=room:corridor_a,gm_action  (AND match — entry must have ALL listed tags)
app.get('/saves/:slotId/log', (req, res) => {
  const save = readSave(req.params.slotId);
  if (!save) return res.status(404).json({ error: 'save not found' });

  const { tags } = req.query;
  if (!tags) return res.json(save.log);

  const required = tags.split(',').map(t => t.trim()).filter(Boolean);
  const filtered = save.log.filter(entry =>
    required.every(tag => entry.tags?.includes(tag))
  );
  res.json(filtered);
});

// ── Room overlay merge ─────────────────────────────────────────────────────

/**
 * Merge a new room overlay into the existing one.
 * Arrays (addedNpcs, addedInteractables, injectedDialog options) are
 * appended, not replaced — so GM additions accumulate across invocations.
 */
function mergeRoomOverlay(existing, incoming) {
  const merged = { ...existing, ...incoming };

  // Append-only arrays
  if (incoming.addedNpcs) {
    merged.addedNpcs = [
      ...(existing.addedNpcs ?? []),
      ...incoming.addedNpcs.filter(n => !existing.addedNpcs?.find(e => e.id === n.id)),
    ];
  }
  if (incoming.addedInteractables) {
    merged.addedInteractables = [
      ...(existing.addedInteractables ?? []),
      ...incoming.addedInteractables.filter(n => !existing.addedInteractables?.find(e => e.id === n.id)),
    ];
  }

  // injectedDialog: { [npcId]: DialogOption[] } — append per npc
  if (incoming.injectedDialog) {
    merged.injectedDialog = { ...(existing.injectedDialog ?? {}) };
    for (const [npcId, options] of Object.entries(incoming.injectedDialog)) {
      const existingOpts = merged.injectedDialog[npcId] ?? [];
      merged.injectedDialog[npcId] = [...existingOpts, ...options];
    }
  }

  return merged;
}

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Save Server] listening on http://localhost:${PORT}`);
});
