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
};
