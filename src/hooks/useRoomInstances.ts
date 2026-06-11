/**
 * YOINK.GG — useRoomInstances
 *
 * Manages the lifecycle of room instances across all three rooms.
 * This is a CLIENT-SIDE simulation of what would be a server-side
 * matchmaking service in production. When real Solana is deployed,
 * this hook reads from an on-chain instance registry.
 *
 * Key behaviours:
 *   1. AUTO-SPAWN: When any instance hits 80% capacity, a new one
 *      spawns automatically for the same room.
 *   2. SMART JOIN: New players always join the most active non-full
 *      instance (social proof) — never an empty room.
 *   3. DEAD PRUNING: Instances with 0 players for 60s are removed.
 *      Prevents ghost loops and memory leaks.
 *   4. BAG SYNC: Instance bagAmount mirrors the game state so the
 *      RoomSelectScreen shows live bag values per instance.
 *
 * Stress test decisions:
 *   - Race condition on spawn: checked via functional setState update
 *     (always works off latest state, not stale closure).
 *   - Instance #1 is always created on mount — room select never
 *     shows an empty list.
 *   - Player count drifts randomly (simulation) — replaced by real
 *     tx counts on devnet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROOMS,
  ROOM_ORDER,
  SPAWN_THRESHOLD,
  DEAD_INSTANCE_TTL_MS,
  createInstance,
  getInstanceStatus,
  selectInstanceForPlayer,
  type RoomId,
  type RoomInstance,
} from "@/lib/rooms";

export type { RoomInstance };

interface InstancesState {
  instances: RoomInstance[];
}

function initInstances(): RoomInstance[] {
  // Start with one instance per room
  return ROOM_ORDER.map((roomId) =>
    createInstance(roomId, [], ROOMS[roomId].startingBag),
  );
}

export function useRoomInstances() {
  const [{ instances }, setInstances] = useState<InstancesState>(() => ({
    instances: initInstances(),
  }));

  const spawnCooldown = useRef<Set<string>>(new Set());

  // ── Drift player counts + auto-spawn + prune ───────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      setInstances((prev) => {
        let next = prev.instances.map((inst): RoomInstance => {
          const room     = ROOMS[inst.roomId];
          const [lo, hi] = [2, room.maxPlayers];
          // Simulate player count drift
          const delta    = Math.random() > 0.5 ? 1 : -1;
          const newCount = Math.min(
            Math.max(Math.floor(lo * 0.4), inst.playerCount + delta),
            hi,
          );
          const newBag   = +(inst.bagAmount * (1 + (Math.random() - 0.48) * 0.03)).toFixed(3);
          return {
            ...inst,
            playerCount: newCount,
            bagAmount:   Math.max(ROOMS[inst.roomId].startingBag * 0.3, newBag),
            lastActive:  newCount > 0 ? now : inst.lastActive,
            status:      getInstanceStatus(newCount, room.maxPlayers),
          };
        });

        // ── Auto-spawn: check each room ──────────────────────────────────────
        for (const roomId of ROOM_ORDER) {
          const room         = ROOMS[roomId];
          const roomInst     = next.filter((i) => i.roomId === roomId);
          const hasAvailable = roomInst.some(
            (i) => i.playerCount / room.maxPlayers < SPAWN_THRESHOLD,
          );
          const allFull      = roomInst.every(
            (i) => i.playerCount / room.maxPlayers >= SPAWN_THRESHOLD,
          );

          // Spawn if all full AND not in cooldown (prevent double-spawn)
          if (allFull && !spawnCooldown.current.has(roomId)) {
            spawnCooldown.current.add(roomId);
            const newInst = createInstance(roomId, next, room.startingBag);
            // Give new instance a small seed player count for realism
            newInst.playerCount = Math.floor(room.maxPlayers * 0.05);
            newInst.status      = "open";
            next = [...next, newInst];
            // Cooldown clears after 5s to prevent rapid spawn loops
            setTimeout(() => spawnCooldown.current.delete(roomId), 5_000);
          } else if (hasAvailable) {
            // Clear cooldown if an available slot opened up
            spawnCooldown.current.delete(roomId);
          }
        }

        // ── Prune dead instances (0 players for TTL) ─────────────────────────
        // Always keep at least 1 instance per room
        const pruned = next.filter((inst) => {
          const roomInst = next.filter((i) => i.roomId === inst.roomId);
          const isDead   = inst.playerCount === 0
            && now - inst.lastActive > DEAD_INSTANCE_TTL_MS;
          const isOnlyOne = roomInst.length === 1;
          return !isDead || isOnlyOne;
        });

        return { instances: pruned };
      });
    }, 5_000);  // 5s — room counts don't need rapid updates

    return () => clearInterval(interval);
  }, []);

  // ── Public: select an instance for a joining player ───────────────────────
  const getInstanceForPlayer = useCallback(
    (roomId: RoomId): string => {
      const { instance, shouldSpawn } = selectInstanceForPlayer(
        instances,
        roomId,
        ROOMS[roomId].maxPlayers,
      );

      if (shouldSpawn || !instance) {
        // Spawn immediately in the local state
        let newKey = `${roomId}-1`;
        setInstances((prev) => {
          const newInst = createInstance(
            roomId,
            prev.instances,
            ROOMS[roomId].startingBag,
          );
          newKey = newInst.key;
          return { instances: [...prev.instances, newInst] };
        });
        return newKey;
      }

      return instance.key;
    },
    [instances],
  );

  // ── Public: update bag/round for a specific instance ──────────────────────
  const syncInstance = useCallback(
    (key: string, updates: Partial<Pick<RoomInstance, "bagAmount" | "roundNumber" | "playerCount">>) => {
      setInstances((prev) => ({
        instances: prev.instances.map((inst) =>
          inst.key === key
            ? { ...inst, ...updates, lastActive: Date.now(), status: getInstanceStatus(updates.playerCount ?? inst.playerCount, ROOMS[inst.roomId].maxPlayers) }
            : inst,
        ),
      }));
    },
    [],
  );

  // ── Computed helpers ──────────────────────────────────────────────────────
  const getInstancesForRoom = useCallback(
    (roomId: RoomId) => instances.filter((i) => i.roomId === roomId),
    [instances],
  );

  const totalPlayers = instances.reduce((s, i) => s + i.playerCount, 0);

  return {
    instances,
    getInstancesForRoom,
    getInstanceForPlayer,
    syncInstance,
    totalPlayers,
  };
}
