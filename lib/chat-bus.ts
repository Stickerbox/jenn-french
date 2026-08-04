import { EventEmitter } from "events";
import type { StoredMessage } from "@/lib/messages";

// Held on globalThis for the same reason lib/prisma.ts is: dev's module
// reloading would otherwise hand each reload a fresh emitter, and streams
// opened before the reload would never hear another message.
const globalForBus = globalThis as unknown as {
  chatEmitter: EventEmitter | undefined;
};

// An in-process emitter is correct ONLY because pm2 runs this app as a single
// process in fork mode. Under cluster mode a message would reach only the
// viewers connected to the same worker, silently — see docs/DEPLOYMENT.md
// before changing how the app is started.
const emitter = globalForBus.chatEmitter ?? new EventEmitter();
// A lesson can have several viewers and Node warns past ten listeners; the
// warning would be noise, not a leak.
emitter.setMaxListeners(50);

if (process.env.NODE_ENV !== "production") {
  globalForBus.chatEmitter = emitter;
}

// A distinct event name from the message channel: a revoke has no payload
// worth conflating with a message, and mixing them would make every listener
// filter by shape instead of the emitter filtering by name.
const revokeEvent = (groupId: string) => `revoke:${groupId}`;

// A distinct event name per channel, so a listener filters by subscription
// rather than by inspecting the shape of what it received.
const boardEvent = (groupId: string) => `board:${groupId}`;

export type BoardFrame =
  | { kind: "open"; currentPage: number }
  // `ops` are committed and append on the viewer; `pending` is the stroke under
  // her cursor and REPLACES the viewer's copy each time, which is what makes a
  // long line grow rather than duplicate.
  | { kind: "ops"; ops: unknown[]; pending: unknown; currentPage: number }
  | { kind: "saved" }
  | { kind: "closed" };

export const chatBus = {
  publish(groupId: string, message: StoredMessage) {
    emitter.emit(groupId, message);
  },

  // Returns its own unsubscribe rather than exposing the emitter, so a stream
  // that closes cannot forget which listener was its own.
  subscribe(groupId: string, listener: (message: StoredMessage) => void) {
    emitter.on(groupId, listener);
    return () => {
      emitter.off(groupId, listener);
    };
  },

  // A token check at connect is not revocation — a stream opened before
  // "Reset sign-in" was clicked would otherwise relay forever on the old
  // token. This is what lets resetStudentSignIn force every open
  // connection for that group to reconnect and re-authenticate.
  publishRevoke(groupId: string) {
    emitter.emit(revokeEvent(groupId));
  },

  subscribeRevoke(groupId: string, listener: () => void) {
    emitter.on(revokeEvent(groupId), listener);
    return () => {
      emitter.off(revokeEvent(groupId), listener);
    };
  },

  publishBoard(groupId: string, frame: BoardFrame) {
    emitter.emit(boardEvent(groupId), frame);
  },

  subscribeBoard(groupId: string, listener: (frame: BoardFrame) => void) {
    emitter.on(boardEvent(groupId), listener);
    return () => {
      emitter.off(boardEvent(groupId), listener);
    };
  },
};
