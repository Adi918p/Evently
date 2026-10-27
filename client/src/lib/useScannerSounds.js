import { useCallback, useEffect, useRef, useState } from "react";
import successUrl from "../assets/sounds/success.mp3";
import errorUrl from "../assets/sounds/error.mp3";

/** Decode once ahead of scanning; playback never holds up the result dialog. */
export function useScannerSounds() {
  const playerRef = useRef(null);
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.sequence += 1; // Also discard a sound still waiting for its download.
    player.source?.stop();
    player.source = null;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let player;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      player = { context: new AudioContext({ latencyHint: "interactive" }), source: null, sequence: 0, disposed: false };
      playerRef.current = player;
      player.ready = Promise.all([successUrl, errorUrl].map(async url => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Sound could not load");
        return player.context.decodeAudioData(await response.arrayBuffer());
      })).then(([success, failure]) => ({ success, failure }));
      player.ready.catch(() => {
        if (!player.disposed) setError("Scan sounds could not load. Reload to try again.");
      });
    } catch {
      setError("Scan sounds are unavailable in this browser.");
    }
    return () => {
      controller.abort();
      if (player) {
        player.disposed = true;
        stop();
        player.context.close().catch(() => {});
      }
      playerRef.current = null;
    };
  }, [stop]);

  // Call from Start camera/manual submission/OK while a user gesture is active.
  const unlock = useCallback(() => {
    const player = playerRef.current;
    if (player && player.context.state !== "running") {
      player.context.resume().catch(() => {
        if (!player.disposed) setError("Enable audio in your browser to hear scan sounds.");
      });
    }
  }, []);

  const play = useCallback(ok => {
    const player = playerRef.current;
    if (!player) return;
    stop();
    const sequence = player.sequence;
    player.ready.then(buffers => {
      if (player.disposed || sequence !== player.sequence) return;
      const source = player.context.createBufferSource();
      source.buffer = ok ? buffers.success : buffers.failure;
      source.connect(player.context.destination);
      source.onended = () => {
        source.disconnect();
        if (player.source === source) player.source = null;
      };
      player.source = source;
      source.start();
    }).catch(() => {
      if (!player.disposed) setError("Scan sounds could not play. Reload to try again.");
    });
  }, [stop]);

  return { play, stop, unlock, error };
}
