import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';
import { BoardInvitation } from '../card/card.model';
import { AuthService } from '../auth/auth.service';
import { BoardService } from '../board.service';
import { LiveBoardService } from './live-board.service';

/**
 * The logged-in user's invitations, kept in one place so the navbar badge and the
 * Boards page always show the same thing. New invitations arrive live from the server.
 */
@Injectable({ providedIn: 'root' })
export class InvitationService {
  /** Invitations waiting for Accept or Decline. */
  invitations: BoardInvitation[] = [];
  /** Fires when the server says something changed (invited, or removed from a board). */
  readonly changes = new Subject<void>();

  private readonly isBrowser: boolean;
  private followingToken: string | null = null;
  private stopWatching?: () => void;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private auth: AuthService,
    private boards: BoardService,
    private live: LiveBoardService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  get count(): number {
    return this.invitations.length;
  }

  /**
   * Follows the invitations of whoever is logged in now. Safe to call often (the navbar calls
   * it after every page change): it only does something when the login has changed.
   */
  followLoggedInUser(): void {
    if (!this.isBrowser) return;
    const token = this.auth.isLoggedIn ? this.auth.token : null;
    if (token === this.followingToken) return;

    this.stopWatching?.();
    this.stopWatching = undefined;
    this.invitations = [];
    this.followingToken = token;
    if (!token) return;

    this.refresh();
    this.stopWatching = this.live.watchInvitations(() => {
      this.refresh();
      this.changes.next();
    });
  }

  async refresh(): Promise<void> {
    this.invitations = await this.boards.getInvitations();
  }

  async accept(invitation: BoardInvitation): Promise<void> {
    await this.boards.acceptInvitation(invitation.boardId);
    this.forget(invitation.boardId);
  }

  async decline(invitation: BoardInvitation): Promise<void> {
    try {
      await this.boards.declineInvitation(invitation.boardId);
    } finally {
      // Gone either way (if it failed, the owner had already cancelled it).
      this.forget(invitation.boardId);
    }
  }

  private forget(boardId: string): void {
    this.invitations = this.invitations.filter(item => item.boardId !== boardId);
  }
}
