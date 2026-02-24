<!--
  RoomMessage.svelte
  Inline narrative message — replaces alert() for navigation failures,
  interactable text, and any other in-world text that isn't dialog.

  Fades out after `duration` ms, or stays until dismissed if duration=0.
-->
<script>
  import { onMount } from 'svelte';

  export let text = '';
  export let duration = 3500; // ms, 0 = manual dismiss only
  export let onDismiss = () => {};

  let visible = true;

  onMount(() => {
    if (duration > 0) {
      const t = setTimeout(() => {
        visible = false;
        onDismiss();
      }, duration);
      return () => clearTimeout(t);
    }
  });

  function dismiss() {
    visible = false;
    onDismiss();
  }
</script>

{#if visible}
  <div class="room-message" role="status" aria-live="polite">
    <p class="message-text">{text}</p>
    <button class="dismiss" on:click={dismiss} aria-label="Dismiss">×</button>
  </div>
{/if}

<style>
  .room-message {
    position: relative;
    border-left: 2px solid #3a3a60;
    padding: 0.75rem 2.5rem 0.75rem 1rem;
    margin: 1rem 0;
    color: #9090b0;
    font-style: italic;
    font-size: 0.95rem;
    line-height: 1.6;
    white-space: pre-line;
    animation: fadein 0.25s ease;
  }

  .dismiss {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: none;
    border: none;
    color: #444460;
    font-size: 1rem;
    cursor: pointer;
    padding: 0;
    width: auto;
    line-height: 1;
  }

  .dismiss:hover {
    color: #8080a0;
    border: none;
  }

  @keyframes fadein {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
