<script>
  import { onMount } from 'svelte';
  import { currentRoomId, rooms, registerRoom, markVisited } from './engine/state.js';
  import { navigate, getAvailableExits } from './engine/navigation.js';
  import { activeDialog } from './engine/state.js';
  import { startDialog, chooseOption, closeDialog } from './engine/dialog.js';

  // ── Stub: load the arrival bay room directly for now ──────────────────────
  // TODO: replace with a proper YAML loader that reads from /content
  const arrivalBay = {
    id: 'arrival_bay',
    name: 'Arrival Bay',
    description: `The docking collar sighs open and cold light floods in.
The station smells like recycled air and something older — ozone,
maybe, or the faint mineral trace of deep space. Your cohort
shuffles through ahead of you.

Dr. Yuen is already talking.`,
    exits: {
      forward: 'corridor_a',
      left: 'orientation_room',
    },
    npcs: [
      {
        id: 'dr_yuen',
        name: 'Dr. Yuen',
        description: 'Your faculty lead. She has been here before — or says she has.',
        dialog: {
          id: 'yuen_arrival_entry',
          speaker: 'dr_yuen',
          source: 'authored',
          text: `"Cohort seven — eyes up. I know you're tired. The disorientation is normal; the transit field does something to your inner ear. Take a breath."`,
          options: [
            {
              text: 'What is this place exactly?',
              source: 'authored',
              next: {
                id: 'yuen_what_is_this',
                speaker: 'dr_yuen',
                source: 'authored',
                text: `"Research station. Officially. There's an anomaly in the local semantic field — language behaves differently out here. Our job is to observe and document." She pauses. "Stay with the group."`,
                options: [{ text: 'Nod and move on.', source: 'authored', next: null }],
              },
            },
            {
              text: 'How long are we here?',
              source: 'authored',
              next: {
                id: 'yuen_how_long',
                speaker: 'dr_yuen',
                source: 'authored',
                text: `"Three weeks. Maybe four. It depends on what we find." She says it like she's reading from a script she doesn't quite believe.`,
                options: [{ text: 'Nod and move on.', source: 'authored', next: null }],
              },
            },
            {
              text: 'Say nothing and look around.',
              source: 'authored',
              next: null,
            },
          ],
        },
      },
    ],
    interactables: [
      {
        id: 'docking_notice',
        name: 'Notice Board',
        description: 'WELCOME, COHORT 7.\nPlease proceed to Orientation before exploring common areas.\nDo not enter the Relay Room without a staff escort.',
      },
    ],
    gmGenerated: false,
  };

  onMount(() => {
    registerRoom(arrivalBay);
    markVisited('arrival_bay');
  });

  // ── Derived display state ─────────────────────────────────────────────────
  $: room = $rooms[$currentRoomId];
  $: exits = room ? getAvailableExits() : [];

  function talkTo(npc) {
    startDialog(npc.dialog);
  }

  function examine(item) {
    alert(item.description); // placeholder — replace with proper UI component
  }

  function tryNavigate(direction) {
    const result = navigate(direction);
    if (!result.success) {
      // TODO: surface as in-game message, not alert
      alert(result.reason);
    }
  }
</script>

<main class="station">
  {#if room}
    <!-- Room -->
    <section class="room">
      <h1 class="room-name">{room.name}</h1>
      {#if room.gmGenerated}
        <!-- DEV INDICATOR: remove or hide in production UI -->
        <span class="gm-badge">GM</span>
      {/if}
      <p class="room-description">{room.description}</p>
    </section>

    <!-- Exits -->
    {#if exits.length}
      <nav class="exits">
        <h2>Exits</h2>
        {#each exits as exit}
          <button
            class="exit-btn"
            class:locked={exit.locked}
            disabled={exit.locked}
            on:click={() => tryNavigate(exit.direction)}
          >
            {exit.direction}
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
    <div class="dialog-overlay">
      <div class="dialog-box">
        <p class="dialog-speaker">{$activeDialog.speaker}</p>
        <p class="dialog-text">{$activeDialog.text}</p>
        <div class="dialog-options">
          {#each $activeDialog.options as option}
            <button class="option-btn" on:click={() => chooseOption(option)}>
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
    padding: 2rem 1.5rem;
    min-height: 100vh;
  }

  .room-name {
    font-size: 1.1rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #7a7a9a;
    margin-bottom: 0.25rem;
  }

  .room-description {
    line-height: 1.8;
    white-space: pre-line;
    margin-bottom: 2rem;
  }

  /* DEV ONLY: GM badge — shows which rooms were GM-generated */
  .gm-badge {
    display: inline-block;
    background: #ff6b35;
    color: #000;
    font-size: 0.6rem;
    font-family: monospace;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    margin-bottom: 0.5rem;
    letter-spacing: 0.1em;
  }

  h2 {
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #555570;
    margin: 1.5rem 0 0.75rem;
  }

  button {
    display: block;
    background: none;
    border: 1px solid #2a2a40;
    color: #c8c8d4;
    padding: 0.5rem 1rem;
    margin-bottom: 0.4rem;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.95rem;
    text-align: left;
    width: 100%;
    transition: border-color 0.15s, color 0.15s;
  }

  button:hover:not(:disabled) {
    border-color: #6060a0;
    color: #fff;
  }

  button.locked {
    color: #444;
    border-color: #1a1a28;
    cursor: not-allowed;
  }

  /* Dialog overlay */
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: flex-end;
    padding: 2rem;
  }

  .dialog-box {
    background: #0f0f1e;
    border: 1px solid #2a2a50;
    padding: 1.5rem;
    max-width: 680px;
    width: 100%;
    margin: 0 auto;
  }

  .dialog-speaker {
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #6060a0;
    margin: 0 0 0.5rem;
  }

  .dialog-text {
    line-height: 1.8;
    margin-bottom: 1.25rem;
    white-space: pre-line;
  }

  .loading {
    color: #444;
    font-style: italic;
  }
</style>
