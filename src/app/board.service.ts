import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  AutomationRule,
  BoardActivity,
  BoardTemplate,
  Card,
  Column,
  Board,
  CustomFieldDefinition,
  Sprint
} from './card/card.model';

/** Templates that always exist. Users can add their own with "Save as template". */
const BUILT_IN_TEMPLATES: BoardTemplate[] = [
  {
    id: 'blank',
    name: 'Basic',
    description: 'A simple To Do, In Progress, Done board.',
    columns: ['To Do', 'In Progress', 'Done'],
    fields: [],
    builtIn: true
  },
  {
    id: 'scrum',
    name: 'Scrum',
    description: 'Sprint work with a review step and story points.',
    columns: ['To Do', 'In Progress', 'Review', 'Done'],
    fields: [{ id: 'field-story-points', name: 'Story points', type: 'number' }],
    builtIn: true
  },
  {
    id: 'bugs',
    name: 'Bug tracking',
    description: 'Follow bugs from report to fix.',
    columns: ['Reported', 'Triaged', 'Fixing', 'Testing', 'Done'],
    fields: [
      { id: 'field-severity', name: 'Severity', type: 'select', options: ['Critical', 'Major', 'Minor'] },
      { id: 'field-environment', name: 'Environment', type: 'select', options: ['Production', 'Staging', 'Local'] },
      { id: 'field-reproducible', name: 'Reproducible', type: 'checkbox' }
    ],
    builtIn: true
  },
  {
    id: 'content',
    name: 'Content calendar',
    description: 'Plan articles and posts from idea to published.',
    columns: ['Ideas', 'Writing', 'Editing', 'Scheduled', 'Done'],
    fields: [
      { id: 'field-channel', name: 'Channel', type: 'select', options: ['Blog', 'Newsletter', 'Social'] },
      { id: 'field-word-count', name: 'Word count', type: 'number' }
    ],
    builtIn: true
  }
];

@Injectable({
  providedIn: 'root'
})
export class BoardService {
  private isBrowser: boolean;

  private readonly boardsKey = 'drello-boards';
  private readonly legacyColumnsKey = 'drello-columns';
  private readonly templatesKey = 'drello-templates';
  private readonly syncedKey = 'drello-synced-with-server';

  /**
   * Changes are sent to the server one after another, in the order they happened.
   * Without this, "create board" could reach the server after "save its columns".
   */
  private writeQueue: Promise<void> = Promise.resolve();
  /** Saving columns happens on every keystroke in a card title, so it waits for a short pause. */
  private columnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly columnSaveDelay = 500;

  /** True when the last request to the server failed (e.g. the server isn't running). */
  serverUnavailable = false;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private api: ApiService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  // ----- Sync with the server -----
  //
  // The browser keeps a copy of the data (localStorage) so the app stays fast and works
  // offline. The database is the source of truth: every change is also sent to the server,
  // and opening the Boards page or a board fetches the latest data from it.

  /** Loads the board list (and saved templates) from the server. Moves old browser data there once. */
  async syncBoards(): Promise<void> {
    if (!this.isBrowser) return;

    try {
      const serverBoards = await firstValueFrom(this.api.getBoards());
      const localBoards = this.readStoredBoards();

      // First time this browser talks to an empty server: upload what it has.
      if (serverBoards.length === 0 && localBoards.length > 0 && !localStorage.getItem(this.syncedKey)) {
        await this.uploadLocalData(localBoards);
      } else {
        this.writeBoards(serverBoards);
        this.writeCustomTemplates(await firstValueFrom(this.api.getTemplates()));
      }

      localStorage.setItem(this.syncedKey, 'true');
      this.serverUnavailable = false;
    } catch (error) {
      this.serverUnavailable = true;
      console.warn('Could not reach the AppDrello server. Showing the data saved in this browser.', error);
    }
  }

  /** Loads one board's columns, cards, sprints, fields, automations and history from the server. */
  async syncBoard(boardId: string): Promise<void> {
    if (!this.isBrowser || boardId === 'default') return;

    try {
      const state = await firstValueFrom(this.api.getBoardState(boardId));

      const boards = this.readStoredBoards().filter(board => board.id !== boardId);
      this.writeBoards([...boards, state.board]);
      this.writeLocalColumns(boardId, state.columns);
      this.writeLocal(`drello-sprints-${boardId}`, state.sprints);
      this.writeLocal(`drello-fields-${boardId}`, state.fields);
      this.writeLocal(`drello-automations-${boardId}`, state.automations);
      this.writeLocal(`drello-activity-${boardId}`, state.activity);
      this.serverUnavailable = false;
    } catch (error: any) {
      if (error?.status === 404) {
        // The board was deleted on the server (e.g. by another browser): drop the local copy too.
        this.writeBoards(this.readStoredBoards().filter(board => board.id !== boardId));
      } else {
        this.serverUnavailable = true;
        console.warn('Could not load the board from the server. Showing the copy saved in this browser.', error);
      }
    }
  }

  /** Sends everything stored in this browser to the server (runs once, the first time). */
  private async uploadLocalData(boards: Board[]): Promise<void> {
    for (const board of boards) {
      await firstValueFrom(this.api.saveBoard(board));
      await firstValueFrom(this.api.saveCustomFields(board.id, this.getCustomFields(board.id)));
      await firstValueFrom(this.api.saveSprints(board.id, this.getSprints(board.id)));
      await firstValueFrom(this.api.saveColumns(board.id, this.loadColumns(board.id)));
      await firstValueFrom(this.api.saveAutomations(board.id, this.getAutomations(board.id)));
      await firstValueFrom(this.api.addActivity(board.id, this.getActivity(board.id)));
    }
    for (const template of this.readCustomTemplates()) {
      await firstValueFrom(this.api.saveTemplate(template));
    }
  }

  /** Adds a request to the queue. A failed request is logged and the queue carries on. */
  private sendToServer(request: () => Observable<unknown>): void {
    if (!this.isBrowser) return;

    this.writeQueue = this.writeQueue
      .then(() => firstValueFrom(request()))
      .then(() => { this.serverUnavailable = false; })
      .catch(error => {
        this.serverUnavailable = true;
        console.warn('Could not save the change to the server. It is saved in this browser.', error);
      });
  }

  private writeLocal(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  getBoards(): Board[] {
    return this.readStoredBoards();
  }

  createBoard(name: string, templateId = 'blank'): Board {
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
    this.sendToServer(() => this.api.saveBoard(board));
    const template = this.getTemplates().find(item => item.id === templateId);
    const columns = template
      ? this.columnsFromTemplate(board.id, template)
      : this.createDefaultColumns(board.id);

    this.saveColumns(board.id, columns);
    // Copy the fields so later edits on this board never change the template.
    this.saveCustomFields(board.id, (template?.fields || []).map(field => ({
      ...field,
      options: field.options ? [...field.options] : undefined
    })));
    this.recordActivity(
      board.id,
      'Board created',
      `Created the “${cleanName}” board${template ? ` from the ${template.name} template` : ''}.`
    );

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
    const renamed = boards[index];
    this.sendToServer(() => this.api.saveBoard(renamed));

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
    this.cancelColumnSave(boardId);
    if (boardId !== 'default') {
      // The database deletes the board's columns, cards, sprints and history with it (CASCADE).
      this.sendToServer(() => this.api.deleteBoard(boardId));
    }
    localStorage.removeItem(`drello-columns-${boardId}`);
    localStorage.removeItem(`drello-activity-${boardId}`);
    localStorage.removeItem(`drello-sprints-${boardId}`);
    localStorage.removeItem(`drello-fields-${boardId}`);
    localStorage.removeItem(`drello-automations-${boardId}`);

    // Remove legacy data when deleting the legacy default board.
    if (boardId === 'default') {
      localStorage.removeItem(this.legacyColumnsKey);
    }
  }

  deleteAllBoards(): void {
    if (!this.isBrowser) {
      return;
    }

    this.readStoredBoards().forEach(board => {
      this.cancelColumnSave(board.id);
      this.sendToServer(() => this.api.deleteBoard(board.id));
    });

    // Remove each board's columns and any legacy column data.
    const keysToRemove: string[] = [];

    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);

      if (
        key &&
        (
          key.startsWith('drello-columns-') ||
          key.startsWith('drello-activity-') ||
          key.startsWith('drello-sprints-') ||
          key.startsWith('drello-fields-') ||
          key.startsWith('drello-automations-') ||
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
      this.writeLocalColumns(boardId, columns);
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

    this.writeLocalColumns(boardId, columns);

    if (boardId === 'default') return;

    // Wait for a short pause, then send the latest version of the columns.
    this.cancelColumnSave(boardId);
    this.columnTimers.set(boardId, setTimeout(() => {
      this.columnTimers.delete(boardId);
      const latest = this.loadColumns(boardId);
      this.sendToServer(() => this.api.saveColumns(boardId, latest));
    }, this.columnSaveDelay));
  }

  private cancelColumnSave(boardId: string): void {
    const timer = this.columnTimers.get(boardId);
    if (timer) clearTimeout(timer);
    this.columnTimers.delete(boardId);
  }

  private writeLocalColumns(boardId: string, columns: Column[]): void {
    localStorage.setItem(
      `drello-columns-${boardId}`,
      JSON.stringify(columns)
    );
  }

  getSprints(boardId: string): Sprint[] {
    if (!this.isBrowser) return [];

    try {
      const stored = localStorage.getItem(`drello-sprints-${boardId}`);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed as Sprint[] : [];
    } catch (error) {
      console.error('Could not load sprints:', error);
      return [];
    }
  }

  saveSprints(boardId: string, sprints: Sprint[]): void {
    if (!this.isBrowser) return;

    localStorage.setItem(`drello-sprints-${boardId}`, JSON.stringify(sprints));
    if (boardId !== 'default') this.sendToServer(() => this.api.saveSprints(boardId, sprints));
  }

  // ----- Custom fields -----

  getCustomFields(boardId: string): CustomFieldDefinition[] {
    if (!this.isBrowser) return [];

    try {
      const stored = localStorage.getItem(`drello-fields-${boardId}`);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed as CustomFieldDefinition[] : [];
    } catch (error) {
      console.error('Could not load custom fields:', error);
      return [];
    }
  }

  saveCustomFields(boardId: string, fields: CustomFieldDefinition[]): void {
    if (!this.isBrowser) return;

    localStorage.setItem(`drello-fields-${boardId}`, JSON.stringify(fields));
    if (boardId !== 'default') this.sendToServer(() => this.api.saveCustomFields(boardId, fields));
  }

  // ----- Automations -----

  getAutomations(boardId: string): AutomationRule[] {
    if (!this.isBrowser) return [];

    try {
      const stored = localStorage.getItem(`drello-automations-${boardId}`);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed as AutomationRule[] : [];
    } catch (error) {
      console.error('Could not load automations:', error);
      return [];
    }
  }

  saveAutomations(boardId: string, rules: AutomationRule[]): void {
    if (!this.isBrowser) return;

    localStorage.setItem(`drello-automations-${boardId}`, JSON.stringify(rules));
    if (boardId !== 'default') this.sendToServer(() => this.api.saveAutomations(boardId, rules));
  }

  // ----- Templates -----

  getTemplates(): BoardTemplate[] {
    return [...BUILT_IN_TEMPLATES, ...this.readCustomTemplates()];
  }

  /** Saves a board's columns and custom fields (not its cards) as a new template. */
  saveBoardAsTemplate(boardId: string, name: string, description = ''): BoardTemplate {
    const cleanName = name.trim();

    if (!cleanName) {
      throw new Error('Template name cannot be empty.');
    }

    const template: BoardTemplate = {
      id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      description: description.trim() || 'Saved from one of your boards.',
      columns: this.loadColumns(boardId).map(column => column.title),
      fields: this.getCustomFields(boardId)
    };

    this.writeCustomTemplates([...this.readCustomTemplates(), template]);
    this.sendToServer(() => this.api.saveTemplate(template));
    return template;
  }

  deleteTemplate(templateId: string): void {
    this.writeCustomTemplates(
      this.readCustomTemplates().filter(template => template.id !== templateId)
    );
    this.sendToServer(() => this.api.deleteTemplate(templateId));
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

  /** Removes the board's whole activity history, in this browser and on the server. */
  clearActivity(boardId: string): void {
    if (!this.isBrowser) return;

    localStorage.removeItem(`drello-activity-${boardId}`);
    if (boardId !== 'default') this.sendToServer(() => this.api.clearActivity(boardId));
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
      if (boardId !== 'default') this.sendToServer(() => this.api.addActivity(boardId, [event]));
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

  private columnsFromTemplate(boardId: string, template: BoardTemplate): Column[] {
    return template.columns.map((title, index) => ({
      id: `col-${index + 1}-${boardId}`,
      boardId,
      title,
      cards: []
    }));
  }

  private readCustomTemplates(): BoardTemplate[] {
    if (!this.isBrowser) return [];

    try {
      const stored = localStorage.getItem(this.templatesKey);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed as BoardTemplate[] : [];
    } catch (error) {
      console.error('Could not load templates:', error);
      return [];
    }
  }

  private writeCustomTemplates(templates: BoardTemplate[]): void {
    if (!this.isBrowser) return;

    localStorage.setItem(this.templatesKey, JSON.stringify(templates));
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

  createDefaultColumns(boardId: string): Column[] {
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

