import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BoardActivity, Card, Column, Board } from './card/card.model';

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private isBrowser: boolean;

  private readonly boardsKey = 'drello-boards';
  private readonly legacyColumnsKey = 'drello-columns';

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  getBoards(): Board[] {
    if (!this.isBrowser) {
      return [];
    }

    try {
      const stored = localStorage.getItem(this.boardsKey);

      // No stored boards means the gallery starts empty.
      if (stored === null) {
        return [];
      }

      const parsed: unknown = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed as Board[] : [];
    } catch (error) {
      console.error('Could not load boards:', error);
      return [];
    }
  }

  createBoard(name: string): Board {
    const cleanName = name.trim();

    if (!cleanName) {
      throw new Error('Board name cannot be empty.');
    }

    const board = this.buildBoard(cleanName);

    if (!this.isBrowser) {
      return board;
    }

    const boards = this.readStoredBoards();
    boards.push(board);

    this.writeBoards(boards);
    this.saveColumns(board.id, this.getStandardColumns(board.id));
    this.recordActivity(board.id, 'Board created', `Created the “${cleanName}” board.`);

    return board;
  }

  renameBoard(boardId: string, newName: string): boolean {
    if (!this.isBrowser) {
      return false;
    }

    const cleanName = newName.trim();

    if (!cleanName) {
      return false;
    }

    const boards = this.readStoredBoards();
    const index = boards.findIndex(board => board.id === boardId);

    if (index === -1) {
      return false;
    }

    boards[index] = {
      ...boards[index],
      name: cleanName,
      updatedAt: new Date()
    };

    this.writeBoards(boards);

    return true;
  }

  deleteBoard(boardId: string): void {
    if (!this.isBrowser) {
      return;
    }

    const boards = this.readStoredBoards().filter(
      board => board.id !== boardId
    );

    this.writeBoards(boards);
    localStorage.removeItem(`drello-columns-${boardId}`);
    localStorage.removeItem(`drello-activity-${boardId}`);

    // Remove legacy data when deleting the legacy default board.
    if (boardId === 'default') {
      localStorage.removeItem(this.legacyColumnsKey);
    }
  }

  deleteAllBoards(): void {
    if (!this.isBrowser) {
      return;
    }

    // Remove each board's columns and any legacy column data.
    const keysToRemove: string[] = [];

    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);

      if (
        key &&
        (
          key.startsWith('drello-columns-') ||
          key.startsWith('drello-activity-') ||
          key === this.legacyColumnsKey
        )
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Keep an explicit empty list so no board is recreated automatically.
    this.writeBoards([]);
  }

  loadColumns(boardId: string): Column[] {
    if (!this.isBrowser) {
      return [];
    }

    const data = localStorage.getItem(`drello-columns-${boardId}`);

    if (!data) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(data);

      if (!Array.isArray(parsed)) {
        return [];
      }

      let nextIssueNumber = 1;
      const usedIssueKeys = new Set<string>();
      const columns: Column[] = parsed.map((column: any, index: number) => {
        const columnId = column.id || `col-${index}`;
        return {
          ...column,
          id: columnId,
          boardId,
          title: column.title === 'Doing'
            ? 'In Progress'
            : column.title,
          cards: Array.isArray(column.cards) ? column.cards.map((card: any) => {
            let issueKey = typeof card.issueKey === 'string' ? card.issueKey : '';
            if (!issueKey || usedIssueKeys.has(issueKey)) {
              while (usedIssueKeys.has(`DRL-${String(nextIssueNumber).padStart(3, '0')}`)) {
                nextIssueNumber++;
              }
              issueKey = `DRL-${String(nextIssueNumber++).padStart(3, '0')}`;
            }
            usedIssueKeys.add(issueKey);
            const match = issueKey.match(/^DRL-(\d+)$/);
            if (match) nextIssueNumber = Math.max(nextIssueNumber, Number(match[1]) + 1);
            return { ...card, issueKey, columnId };
          }) : []
        };
      });
      this.saveColumns(boardId, columns);
      return columns;
    } catch (error) {
      console.error('Error loading columns:', error);
      return [];
    }
  }

  nextIssueKey(boardId: string): string {
    const highest = this.loadColumns(boardId)
      .flatMap(column => column.cards)
      .reduce((max, card) => {
        const match = card.issueKey?.match(/^DRL-(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0);
    return `DRL-${String(highest + 1).padStart(3, '0')}`;
  }

  saveColumns(boardId: string, columns: Column[]): void {
    if (!this.isBrowser) {
      return;
    }

    localStorage.setItem(
      `drello-columns-${boardId}`,
      JSON.stringify(columns)
    );
  }

  getActivity(boardId: string): BoardActivity[] {
    if (!this.isBrowser) return [];

    try {
      const stored = localStorage.getItem(`drello-activity-${boardId}`);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed)
        ? (parsed as BoardActivity[]).sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        : [];
    } catch (error) {
      console.error('Could not load board activity:', error);
      return [];
    }
  }

  recordActivity(
    boardId: string,
    action: string,
    description: string,
    card?: Card
  ): void {
    if (!this.isBrowser) return;

    const event: BoardActivity = {
      id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      boardId,
      action,
      description,
      cardId: card?.id,
      issueKey: card?.issueKey,
      cardTitle: card?.title,
      createdAt: new Date().toISOString()
    };

    try {
      const activity = this.getActivity(boardId);
      localStorage.setItem(
        `drello-activity-${boardId}`,
        JSON.stringify([event, ...activity].slice(0, 200))
      );
    } catch (error) {
      console.error('Could not save board activity:', error);
    }
  }

  /**
   * Migrates legacy columns only when explicitly called.
   * It does not create a board or assign a default board name.
   *
   * The caller must supply the ID of an existing board.
   */
  migrateLegacyData(
    boardId: string
  ): { success: boolean; boardId?: string } {
    if (!this.isBrowser) {
      return { success: false };
    }

    const boards = this.readStoredBoards();
    const boardExists = boards.some(board => board.id === boardId);

    if (!boardExists) {
      return { success: false };
    }

    const legacyData = localStorage.getItem(this.legacyColumnsKey);

    if (!legacyData) {
      return { success: false };
    }

    try {
      const parsed: unknown = JSON.parse(legacyData);

      if (!Array.isArray(parsed)) {
        return { success: false };
      }

      this.saveColumns(boardId, parsed as Column[]);
      localStorage.removeItem(this.legacyColumnsKey);

      return { success: true, boardId };
    } catch (error) {
      console.error('Migration failed:', error);
      return { success: false };
    }
  }

  private readStoredBoards(): Board[] {
    if (!this.isBrowser) {
      return [];
    }

    try {
      const stored = localStorage.getItem(this.boardsKey);

      if (stored === null) {
        return [];
      }

      const parsed: unknown = JSON.parse(stored);

      return Array.isArray(parsed) ? parsed as Board[] : [];
    } catch (error) {
      console.error('Could not read stored boards:', error);
      return [];
    }
  }

  private writeBoards(boards: Board[]): void {
    if (!this.isBrowser) {
      return;
    }

    localStorage.setItem(this.boardsKey, JSON.stringify(boards));
  }

  private buildBoard(name: string): Board {
    return {
      id: `board-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private getStandardColumns(boardId: string): Column[] {
    return [
      {
        id: `col-1-${boardId}`,
        boardId,
        title: 'To Do',
        cards: []
      },
      {
        id: `col-2-${boardId}`,
        boardId,
        title: 'In Progress',
        cards: []
      },
      {
        id: `col-3-${boardId}`,
        boardId,
        title: 'Done',
        cards: []
      }
    ];
  }
}

