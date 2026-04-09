---
name: Map archetype system
description: Procedural map generation uses geographic archetypes (inlet, bay, strait, island, peninsula, estuary, crater_harbor, continental_coast) blended with simplex noise. 12 core ports defined in portArchetypes.ts. Dev tab in Settings for previewing individual ports.
type: project
---

The terrain system was extended with a geographic archetype layer. Key files:
- `src/utils/portArchetypes.ts` — archetype shape functions, climate profiles, 12 core port definitions
- `src/utils/terrain.ts` — blends archetype shapes with noise within ARCHETYPE_RADIUS (250 units) of ports
- `src/utils/mapGenerator.ts` — distributes ports across world, registers archetypes with terrain, supports devModeConfig for solo port preview
- `src/components/SettingsModal.tsx` — Dev tab with port catalog and world size selector

**Why:** The original pure-noise terrain produced uniform archipelago blobs. Real Indian Ocean ports have distinct geographic signatures (inlets, straits, bays, etc.) that need to be recognizable.

**How to apply:** When adding new ports, define them in CORE_PORTS with an archetype + climate. The archetype shapes terrain around the port; noise adds organic detail on top. The "archipelago" archetype is a no-op that preserves the original noise-only behavior.
