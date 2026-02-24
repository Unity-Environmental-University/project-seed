# Language Station — Content Schema

Human authors write rooms in YAML. The GM also writes rooms in YAML (or has them generated and serialized to YAML for versioning). Format is identical — the `gmGenerated` flag is the only structural difference, and it is never surfaced to the player.

---

## Room

```yaml
id: string                    # unique, snake_case
name: string                  # display name
act: 1 | 2 | 3                # which act this room belongs to
gmGenerated: boolean          # true = AI GM wrote this; false = human authored

description: |                # shown when player enters; markdown ok
  Multi-line room text.

exits:
  direction: roomId           # simple form — always passable
  direction:
    roomId: string
    requires: flag_name       # locked until this flag is set
    lockedMessage: string     # shown when locked

npcs:
  - id: string
    name: string
    description: string       # shown on examine
    dialog:
      entry: dialog_node_id   # which dialog node to start with

interactables:
  - id: string
    name: string
    description: string
    text: string              # optional: text shown on read/examine
    requires: flag_name       # optional: only available if flag set
    setFlag: flag_name        # optional: sets this flag on interaction
    giveItem: item_id         # optional: adds to inventory

dialog:
  node_id:
    id: string
    speaker: string           # npc id | 'station' | 'narrator' | 'player'
    source: authored | gm | station   # NEVER shown to player
    text: |
      What the speaker says.
    options:
      - text: string          # player-facing choice text
        source: authored | gm | station
        next: node_id | null  # null = end dialog
        setFlag: flag_name    # optional side effect
        giveItem: item_id     # optional side effect
```

---

## Source Tags

| Value | Meaning | Shown to player? |
|-------|---------|-----------------|
| `authored` | Human-written, static | No |
| `gm` | AI GM generated | No |
| `station` | The Station speaking (Act 2+) | No |

The player **never** sees source tags. The distinction is internal — for the GM's context, for debugging, and for the postmortem in Act 3.

---

## Conventions

- Room IDs: `snake_case`, descriptive (`relay_room`, `corridor_a`)
- Dialog node IDs: `{npc_id}_{topic}` (`yuen_arrival_entry`, `yuen_semantic_field`)
- Flag names: `snake_case` verbs (`met_archivist`, `opened_airlock_panel`, `visited_relay_room`)
- Item IDs: `snake_case` nouns (`keycard_b`, `torn_page`)

---

## File layout

```
content/
├── act1/          # Human-authored rooms + dialog
├── act2/          # Mostly GM-generated at runtime, seeds here
├── act3/          # Short — gesture at the cycle completing
├── walkthrough/   # GM's reference material (not player-facing)
│   ├── overview.md
│   ├── act1_notes.md
│   └── puzzles.md
└── SCHEMA.md      # This file
```
