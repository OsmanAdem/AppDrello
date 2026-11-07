import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { API_URL } from '../api.service';
import { AuthService } from '../auth/auth.service';

/** A random id for this browser tab. The server uses it so a tab isn't told about its own saves. */
export const CLIENT_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

/**
 * Live updates: keeps a connection open to GET /api/boards/:id/events and calls
 * `onChange` whenever someone else saves a change to that board.
 *
 * Uses fetch() instead of EventSource, because EventSource can't send the login token header.
 * If the connection drops (server restarted, Wi-Fi gone), it reconnects after a short wait.
 */
@Injectable({ providedIn: 'root' })
export class LiveBoardService {
  private readonly isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private auth: AuthService,
    private zone: NgZone
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /** Starts watching a board. Call the returned function to stop. */
  watch(boardId: string, onChange: () => void): () => void {
    if (!this.isBrowser || boardId === 'default' || typeof fetch !== 'function') return () => undefined;

    const controller = new AbortController();
    let retryDelay = 2000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = async (): Promise<void> => {
      const token = this.auth.token;
      if (!token) return;
      try {
        const response = await fetch(`${API_URL}/boards/${encodeURIComponent(boardId)}/events`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Client-Id': CLIENT_ID, Accept: 'text/event-stream' },
          signal: controller.signal
        });
        // No access any more (logged out, removed from the board, board deleted): stop for good.
        if ([401, 403, 404].includes(response.status)) return;
        if (!response.ok || !response.body) throw new Error(`Live updates answered ${response.status}`);

        retryDelay = 2000;
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          // Messages are separated by an empty line.
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (message.split('\n').includes('event: changed')) this.zone.run(onChange);
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (controller.signal.aborted) return;
      // The connection ended: try again, waiting a little longer each time (max 30 s).
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    };

    // Outside Angular's zone, so the open connection doesn't keep the app "busy".
    this.zone.runOutsideAngular(() => { connect(); });

    return () => {
      controller.abort();
      clearTimeout(retryTimer);
    };
  }
}
