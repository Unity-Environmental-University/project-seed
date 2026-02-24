/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║                                                                      ║
 * ║   🚨  GM STUB  🚨   THIS IS NOT THE REAL GM   🚨  GM STUB  🚨       ║
 * ║                                                                      ║
 * ║   This file returns FAKE data so the engine can run without          ║
 * ║   a live AI backend. It is intentionally obnoxious.                  ║
 * ║                                                                      ║
 * ║   If you are seeing stub content in a real game session:             ║
 * ║     1. Check VITE_GM_MODE in your .env                               ║
 * ║     2. Make sure live.js is implemented and wired into gm/index.js   ║
 * ║     3. Do not ship this. Seriously.                                  ║
 * ║                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * STUB BEHAVIORS:
 *   - All generated text is clearly labeled [STUB GM]
 *   - Logs loudly to the console on every call
 *   - Simulates async delay (150-400ms) to surface timing issues early
 *   - Returns structurally valid data so the engine can run end-to-end
 *   - Warns if VITE_GM_MODE=live is set (should never reach stub then)
 */

const STUB_DELAY_MS = [150, 400];

function stubDelay() {
  const ms = STUB_DELAY_MS[0] + Math.random() * (STUB_DELAY_MS[1] - STUB_DELAY_MS[0]);
  return new Promise(r => setTimeout(r, ms));
}

function stubLog(method, args) {
  console.groupCollapsed(
    `%c[GM STUB] %c${method}`,
    'color: #ff6b35; font-weight: bold; font-size: 13px;',
    'color: #ffd166; font-weight: bold; font-size: 13px;'
  );
  console.log('Arguments:', args);
  console.log('%cThis is FAKE GM output. See src/gm/stub.js', 'color: #ef476f;');
  console.groupEnd();
}

function stubWarn() {
  if (import.meta.env.VITE_GM_MODE === 'live') {
    console.error(
      '[GM STUB] VITE_GM_MODE=live but GMStub is running. ' +
      'Check gm/index.js — live.js is not wired in yet.'
    );
  }
}

export class GMStub {
  constructor() {
    stubWarn();
    console.warn(
      '%c[GM STUB] GMStub initialized. All GM responses are FAKE.',
      'color: #ff6b35; font-weight: bold; font-size: 14px; background: #1a1a2e; padding: 4px 8px; border-radius: 4px;'
    );
  }

  /**
   * Returns a fake pre-generated room.
   * Structurally valid — engine can navigate into it.
   */
  async prefetchRoom(roomId, fromRoomId) {
    stubLog('prefetchRoom', { roomId, fromRoomId });
    await stubDelay();

    return {
      id: roomId,
      name: `[STUB] ${roomId.replace(/_/g, ' ')}`,
      description: `[STUB GM GENERATED] You stand in ${roomId.replace(/_/g, ' ')}. ` +
        `This room was invented by the stub. It smells of placeholder text and unrealized potential. ` +
        `The walls hum with the absence of a real language model.`,
      gmGenerated: true,
      gmSource: 'stub',                          // ← NEVER on real GM rooms
      exits: {
        back: fromRoomId,
      },
      npcs: [],
      interactables: [
        {
          id: 'stub_sign',
          name: '[STUB] Placard',
          description: '[STUB GM] A placard reads: "This room was not authored by a human ' +
            'or a real AI. It was produced by GMStub. Please implement live.js."',
        }
      ],
    };
  }

  /**
   * Returns fake dialog options, clearly labeled.
   */
  async generateOptions(npcId, stateSnapshot, dialogHistory) {
    stubLog('generateOptions', { npcId, stateSnapshot, dialogHistory });
    await stubDelay();

    return [
      {
        text: '[STUB] Ask about the station (fake option)',
        source: 'gm',           // ← correct source tag — engine uses this, not player
        _stubNote: 'STUB: real GM would generate contextual options here',
        next: {
          id: `stub_response_${Date.now()}`,
          speaker: npcId,
          text: `[STUB GM] ${npcId} says something that the real GM would make coherent and atmospheric. ` +
            `Instead, you get this: the stub has no knowledge of the game world.`,
          source: 'gm',
          options: [],
        },
      },
      {
        text: '[STUB] Walk away (fake option)',
        source: 'gm',
        _stubNote: 'STUB: this ends dialog',
        next: null,
      },
    ];
  }

  /**
   * Returns a fake Station response.
   * The Station is a special speaker — this should feel especially wrong when stubbed.
   */
  async stationResponse(stateSnapshot, playerMessage) {
    stubLog('stationResponse', { stateSnapshot, playerMessage });
    await stubDelay();

    return {
      id: `stub_station_${Date.now()}`,
      speaker: 'station',
      text: '[STUB GM — STATION] The station would respond with something liminal and deeply felt. ' +
        `Instead, the stub acknowledges your message ("${playerMessage}") ` +
        'and returns this placeholder. Implement live.js.',
      source: 'station',
      _stubNote: 'STUB: real station responses emerge from persistent GM context',
      options: [
        {
          text: '[STUB] Respond to the station (fake)',
          source: 'station',
          next: null,
        },
      ],
    };
  }
}
