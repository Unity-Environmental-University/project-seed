<script>
  import { onMount } from 'svelte';
  import { currentRoomId, rooms, activeDialog, markVisited } from './engine/state.js';
  import { navigate, getAvailableExits } from './engine/navigation.js';
  import { startDialog, chooseOption, closeDialog } from './engine/dialog.js';
  import { loadAllContent, resolveDialogNode } from './engine/loader.js';
  import { save } from './engine/save.js';
  import {
    entryRoomEntered, entryDialogStarted,
    entryDialogChosen, entryDialogEnded,
    entryInteractableUsed,
  } from './engine/log.js';
  import RoomMessage from './ui/RoomMessage.svelte';

  // Active save slot — will come from a slot picker eventually
  const SLOT = 'slot_1';

  // ── Inline message (replaces alert()) ────────────────────────────────────
  let message = null; // { text, duration }

  function showMessage(text, duration = 3500) {
    message = { text, duration };
  }

  function clearMessage() {
    message = null;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  // Order: load YAML rooms → load save (restores state + overlays)
  onMount(async () => {
    loadAllContent();
    try {
      await save.load(SLOT);
    } catch (e) {
      // Server not running — degrade gracefully, log loudly
      console.warn('[Save] Server unavailable — running without persistence:', e.message);
      markVisited('arrival_bay');
    }
  });

  // ── Derived display state ─────────────────────────────────────────────────
  $: room = $rooms[$currentRoomId];
  $: exits = room ? getAvailableExits() : [];

  // ── Actions ───────────────────────────────────────────────────────────────

  function talkTo(npc) {
    if (!npc.dialogEntry || !room._dialog?.[npc.dialogEntry]) {
      showMessage(`${npc.name} doesn't seem to want to talk right now.`);
      return;
    }
    const node = resolveDialogNode(room._dialog, npc.dialogEntry);
    if (!node) return;
    startDialog(node);
    // Fire-and-forget: log dialog start
    save.appendLog(SLOT, [entryDialogStarted($currentRoomId, npc.id)]);
  }

  function examine(item) {
    showMessage(item.description ?? item.text ?? 'Nothing more to see here.', 0);
    // Fire-and-forget: log interactable use + patch flags if item sets one
    const logEntry = entryInteractableUsed($currentRoomId, item.id, item.name);
    const diff = { appendLog: [logEntry] };
    if (item.setFlag) {
      diff.player = { flags: { [item.setFlag]: true } };
    }
    save.patch(SLOT, diff);
  }

  function tryNavigate(direction) {
    clearMessage();
    const result = navigate(direction);
    if (!result.success) {
      showMessage(result.reason);
      return;
    }
    // Fire-and-forget: patch player position + log room entry
    save.patch(SLOT, {
      player: save.playerDiff(),
      appendLog: [entryRoomEntered($currentRoomId, room?.gmGenerated ?? false)],
    });
  }

  // Wrap chooseOption to log the choice before delegating to dialog engine
  function handleDialogChoice(option) {
    const activeNode = $activeDialog;
    // npcId lives on the speaker of the current node
    const npcId = activeNode?.speaker ?? 'unknown';
    save.appendLog(SLOT, [
      entryDialogChosen($currentRoomId, npcId, activeNode?.id ?? null, option.text, option.source ?? 'authored'),
    ]);
    chooseOption(option);
    // If dialog closed after this choice, log that too
    if (!$activeDialog) {
      save.appendLog(SLOT, [entryDialogEnded($currentRoomId, npcId)]);
    }
  }
</script>

<main class="station">
  {#if room}
    <!-- Room header -->
    <header class="room-header">
      <h1 class="room-name">{room.name}</h1>
      {#if room.gmGenerated}
        <!-- DEV ONLY: visible indicator that this room was GM-generated, not authored -->
        <span class="gm-badge" title="GM-generated room (dev indicator)">GM</span>
      {/if}
    </header>

    <!-- Room description -->
    <p class="room-description">{room.description}</p>

    <!-- Inline message -->
    {#if message}
      <RoomMessage
        text={message.text}
        duration={message.duration}
        onDismiss={clearMessage}
      />
    {/if}

    <!-- Exits -->
    {#if exits.length}
      <nav class="exits">
        <h2>Exits</h2>
        {#each exits as exit}
          <button
            class="exit-btn"
            class:locked={exit.locked}
            disabled={exit.locked}
            title={exit.locked ? exit.lockedMessage : undefined}
            on:click={() => tryNavigate(exit.direction)}
          >
            {exit.direction}
            {#if exit.locked}<span class="lock-glyph">·</span>{/if}
          </button>
        {/each}
      </nav>
    {/if}

    <!-- NPCs -->
    {#if room.npcs?.length}
      <section class="npcs">
        <h2>People</h2>
        {#each room.npcs as npc}
          <button class="npc-btn" on:click={() => talkTo(npc)}>
            {npc.name}
          </button>
        {/each}
      </section>
    {/if}

    <!-- Interactables -->
    {#if room.interactables?.length}
      <section class="interactables">
        <h2>Objects</h2>
        {#each room.interactables as item}
          <button class="item-btn" on:click={() => examine(item)}>
            {item.name}
          </button>
        {/each}
      </section>
    {/if}

  {:else}
    <p class="loading">Initializing…</p>
  {/if}

  <!-- Dialog overlay -->
  {#if $activeDialog}
    <div class="dialog-overlay" role="dialog" aria-modal="true">
      <div class="dialog-box">
        <p class="dialog-speaker">{$activeDialog.speaker}</p>
        <p class="dialog-text">{$activeDialog.text}</p>
        <div class="dialog-options">
          {#each ($activeDialog.options ?? []) as option}
            <button class="option-btn" on:click={() => handleDialogChoice(option)}>
              {option.text}
            </button>
          {/each}
          {#if !$activeDialog.options?.length}
            <button class="option-btn" on:click={closeDialog}>[Continue]</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }

  :global(body) {
    background: #0a0a12;
    color: #c8c8d4;
    font-family: 'Georgia', serif;
    margin: 0;
    padding: 0;
  }

  .station {
    max-width: 680px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 6rem;
    min-height: 100vh;
  }

  /* ── Room ──────────────────────────────────────────────────────────────── */

  .room-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .room-name {
    font-size: 1.05rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #6a6a8a;
    margin: 0;
  }

  .room-description {
    line-height: 1.85;
    white-space: pre-line;
    margin: 0.5rem 0 1.5rem;
    color: #b8b8cc;
  }

  /* DEV ONLY: orange badge on GM-generated rooms */
  .gm-badge {
    display: inline-block;
    background: #ff6b35;
    color: #000;
    font-size: 0.6rem;
    font-family: monospace;
    font-weight: bold;
    padding: 2px 5px;
    border-radius: 3px;
    letter-spacing: 0.1em;
    flex-shrink: 0;
  }

  /* ── Sections ──────────────────────────────────────────────────────────── */

  h2 {
    font-size: 0.7rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #44445a;
    margin: 1.75rem 0 0.6rem;
    font-family: monospace;
  }

  /* ── Buttons (exits, npcs, objects) ───────────────────────────────────── */

  button {
    display: block;
    background: none;
    border: 1px solid #22223a;
    color: #b0b0c8;
    padding: 0.5rem 1rem;
    margin-bottom: 0.35rem;
    cursor: pointer;
    font-family: 'Georgia', serif;
    font-size: 0.93rem;
    text-align: left;
    width: 100%;
    transition: border-color 0.15s, color 0.15s;
    border-radius: 2px;
  }

  button:hover:not(:disabled) {
    border-color: #5050a0;
    color: #e0e0f0;
  }

  button:disabled,
  button.locked {
    color: #333348;
    border-color: #18182a;
    cursor: not-allowed;
  }

  .lock-glyph {
    opacity: 0.3;
    margin-left: 0.5rem;
  }

  /* ── Dialog overlay ────────────────────────────────────────────────────── */

  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(5, 5, 14, 0.82);
    display: flex;
    align-items: flex-end;
    padding: 1.5rem;
  }

  .dialog-box {
    background: #0c0c1c;
    border: 1px solid #2a2a50;
    padding: 1.5rem;
    max-width: 680px;
    width: 100%;
    margin: 0 auto;
  }

  .dialog-speaker {
    font-size: 0.7rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #4a4a80;
    margin: 0 0 0.6rem;
    font-family: monospace;
  }

  .dialog-text {
    line-height: 1.85;
    margin-bottom: 1.25rem;
    white-space: pre-line;
    color: #c0c0d8;
  }

  .option-btn {
    color: #9090b8;
    border-color: #1e1e36;
  }

  .option-btn:hover:not(:disabled) {
    color: #e0e0f8;
    border-color: #4a4a90;
  }

  /* ── Misc ──────────────────────────────────────────────────────────────── */

  .loading {
    color: #333348;
    font-style: italic;
    margin-top: 3rem;
  }
</style>
