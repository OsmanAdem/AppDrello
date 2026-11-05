import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

/** One board and everything on it, kept while it couldn't be sent to the server. */
interface BoardBundle {
  board: Board;
  columns: Column[];
  sprints: Sprint[];
  fields: CustomFieldDefinition[];
  automations: AutomationRule[];
}
import {
  AutomationRule,
  BoardActivity,
  BoardMember,
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
  /**
   * The column and card ids the server has for each board (from the last load or save).
   * Comparing with the board now tells us exactly what the user deleted, so a save never
   * deletes cards someone else just added to a shared board.
   */
  private serverIds = new Map<string, { columnIds: Set<string>; cardIds: Set<string> }>();

  /** Boards with changes that failed to reach the server. They are sent again before the next sync. */
  private unsavedBoards = new Set<string>();

  /** True when some changes are only saved in this browser, not on the server yet. */
  get hasUnsavedChanges(): boolean {
    return this.unsavedBoards.size > 0;
  }

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
      // Changes kept from an earlier session (the server was unreachable at log out) go first.
      await this.sendKeptChanges();

      // Never load from the server while our own latest changes are still on their way there.
      await this.flushPendingWrites();
      if (this.hasUnsavedChanges) return; // keep the local copy; it has changes the server doesn't

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
      await this.flushPendingWrites();
      // If an earlier save failed, the local copy is newer than the server's: keep it.
      if (this.unsavedBoards.has(boardId)) return;

      const state = await firstValueFrom(this.api.getBoardState(boardId));

      const boards = this.readStoredBoards().filter(board => board.id !== boardId);
      this.writeBoards([...boards, state.board]);
      this.writeLocalColumns(boardId, state.columns);
      this.rememberServerIds(boardId, state.columns);
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

  /**
   * Sends any column saves that are still waiting for their pause, then waits until every
   * queued change has been answered by the server. Boards whose saves failed are sent again in full.
   */
  async flushPendingWrites(): Promise<void> {
    if (!this.isBrowser) return;

    for (const [boardId, timer] of this.columnTimers) {
      clearTimeout(timer);
      this.columnTimers.delete(boardId);
      this.sendColumns(boardId);
    }
    await this.writeQueue;

    for (const boardId of [...this.unsavedBoards]) {
      const board = this.readStoredBoards().find(item => item.id === boardId);
      if (!board) {
        this.unsavedBoards.delete(boardId);
        continue;
      }
      try {
        await this.uploadBoard(board);
        this.unsavedBoards.delete(boardId);
        this.serverUnavailable = false;
      } catch {
        this.serverUnavailable = true;
        break; // the server is still unreachable; try again later
      }
    }
  }

  /** Sends one board and everything on it to the server. */
  private async uploadBoard(board: Board): Promise<void> {
    await this.uploadBundle(this.bundleOf(board));
  }

  private bundleOf(board: Board): BoardBundle {
    return {
      board,
      columns: this.loadColumns(board.id),
      sprints: this.getSprints(board.id),
      fields: this.getCustomFields(board.id),
      automations: this.getAutomations(board.id)
    };
  }

  private async uploadBundle(bundle: BoardBundle): Promise<void> {
    const boardId = bundle.board.id;
    await firstValueFrom(this.api.saveBoard(bundle.board));
    await firstValueFrom(this.api.saveCustomFields(boardId, bundle.fields));
    await firstValueFrom(this.api.saveSprints(boardId, bundle.sprints));
    await firstValueFrom(this.api.saveColumns(boardId, bundle.columns, this.removedSince(boardId, bundle.columns)));
    this.rememberServerIds(boardId, bundle.columns);
    await firstValueFrom(this.api.saveAutomations(boardId, bundle.automations));
  }

  // ----- Keeping changes safe across log out -----
  //
  // Logging out removes this browser's copy of the boards (so the next person can't see them).
  // If some changes never reached the server, they are first set aside for that user only,
  // and sent automatically the next time the same user logs in.

  private keptKey(userId: string): string {
    return `drello-kept-${userId}`;
  }

  /** Called when logging out: sets aside boards whose changes the server didn't get. */
  keepUnsavedChangesFor(userId: string): void {
    if (!this.isBrowser || !this.hasUnsavedChanges) return;

    const kept = this.readKept(userId).filter(bundle => !this.unsavedBoards.has(bundle.board.id));
    for (const boardId of this.unsavedBoards) {
      const board = this.readStoredBoards().find(item => item.id === boardId);
      if (board) kept.push(this.bundleOf(board));
    }
    this.writeLocal(this.keptKey(userId), kept);
    this.unsavedBoards.clear();
  }

  /** Sends changes kept from an earlier session of the logged-in user. */
  private async sendKeptChanges(): Promise<void> {
    const userId = this.currentUserId();
    if (!userId) return;

    const kept = this.readKept(userId);
    if (!kept.length) return;

    const stillKept: BoardBundle[] = [];
    for (const bundle of kept) {
      try {
        await this.uploadBundle(bundle);
      } catch (error: any) {
        if (error?.status !== 404) stillKept.push(bundle); // 404: the board was deleted meanwhile
      }
    }

    if (stillKept.length) {
      this.writeLocal(this.keptKey(userId), stillKept);
    } else {
      localStorage.removeItem(this.keptKey(userId));
    }
  }

  private readKept(userId: string): BoardBundle[] {
    try {
      const stored = localStorage.getItem(this.keptKey(userId));
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed as BoardBundle[] : [];
    } catch {
      return [];
    }
  }

  /** The logged-in user's id, as AuthService saved it. */
  private currentUserId(): string | null {
    try {
      const stored = localStorage.getItem('drello-user');
      return stored ? JSON.parse(stored).id ?? null : null;
    } catch {
      return null;
    }
  }

  // ----- Sharing -----

  /** Your role on a board. Boards made before sharing existed are yours. */
  getRole(boardId: string): 'owner' | 'member' {
    return this.readStoredBoards().find(board => board.id === boardId)?.role ?? 'owner';
  }

  getMembers(boardId: string): Promise<BoardMember[]> {
    return firstValueFrom(this.api.getMembers(boardId));
  }

  inviteMember(boardId: string, email: string): Promise<BoardMember[]> {
    return firstValueFrom(this.api.addMember(boardId, email.trim()));
  }

  removeMember(boardId: string, userId: string): Promise<BoardMember[]> {
    return firstValueFrom(this.api.removeMember(boardId, userId));
  }

  /** Leaves a board someone shared with you, and removes it from this browser. */
  async leaveBoard(boardId: string, myUserId: string): Promise<void> {
    await this.flushPendingWrites();
    await firstValueFrom(this.api.removeMember(boardId, myUserId));
    this.forgetBoardLocally(boardId);
  }

  /** Removes a board and everything on it from this browser only (not from the server). */
  private forgetBoardLocally(boardId: string): void {
    this.cancelColumnSave(boardId);
    this.unsavedBoards.delete(boardId);
    this.writeBoards(this.readStoredBoards().filter(board => board.id !== boardId));
    ['columns', 'activity', 'sprints', 'fields', 'automations'].forEach(part =>
      localStorage.removeItem(`drello-${part}-${boardId}`)
    );
  }

  /** Sends everything stored in this browser to the server (runs once, the first time). */
  private async uploadLocalData(boards: Board[]): Promise<void> {
    for (const board of boards) {
      await this.uploadBoard(board);
      await firstValueFrom(this.api.addActivity(board.id, this.getActivity(board.id)));
    }
    for (const template of this.readCustomTemplates()) {
      await firstValueFrom(this.api.saveTemplate(template));
    }
  }

  /**
   * Adds a request to the queue. If it fails, the board is remembered as "unsaved"
   * and sent again in full later, so the change isn't lost.
   */
  private sendToServer(boardId: string | null, request: () => Observable<unknown>): void {
    if (!this.isBrowser) return;

    this.writeQueue = this.writeQueue
      .then(() => firstValueFrom(request()))
      .then(() => { this.serverUnavailable = false; })
      .catch(error => {
        this.serverUnavailable = true;
        if (boardId && error?.status !== 404) this.unsavedBoards.add(boardId);
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
    this.sendToServer(board.id, () => this.api.saveBoard(board));
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
    this.sendToServer(renamed.id, () => this.api.saveBoard(renamed));

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
    this.unsavedBoards.delete(boardId);
    if (boardId !== 'default') {
      // The database deletes the board's columns, cards, sprints and history with it (CASCADE).
      this.sendToServer(null, () => this.api.deleteBoard(boardId));
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
      // Only your own boards are deleted on the server; boards shared with you are left alone.
      if (board.role !== 'member') this.sendToServer(null, () => this.api.deleteBoard(board.id));
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
      this.sendColumns(boardId);
    }, this.columnSaveDelay));
  }

  /** Sends the board's latest columns, plus the ids the user removed since the last save. */
  private sendColumns(boardId: string): void {
    const latest = this.loadColumns(boardId);
    const removed = this.removedSince(boardId, latest);
    // Remember what the server has only once it has answered. Until then, later saves send
    // the same removals again, which is harmless (deleting twice changes nothing).
    this.sendToServer(boardId, () => this.api.saveColumns(boardId, latest, removed).pipe(
      tap(() => this.rememberServerIds(boardId, latest))
    ));
  }

  private removedSince(boardId: string, columns: Column[]): { columnIds: string[]; cardIds: string[] } {
    const known = this.serverIds.get(boardId);
    if (!known) return { columnIds: [], cardIds: [] };

    const columnIds = new Set(columns.map(column => column.id));
    const cardIds = new Set(columns.flatMap(column => column.cards).map(card => card.id));
    return {
      columnIds: [...known.columnIds].filter(id => !columnIds.has(id)),
      cardIds: [...known.cardIds].filter(id => !cardIds.has(id))
    };
  }

  private rememberServerIds(boardId: string, columns: Column[]): void {
    this.serverIds.set(boardId, {
      columnIds: new Set(columns.map(column => column.id)),
      cardIds: new Set(columns.flatMap(column => column.cards).map(card => card.id))
    });
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
    if (boardId !== 'default') this.sendToServer(boardId, () => this.api.saveSprints(boardId, sprints));
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
    if (boardId !== 'default') this.sendToServer(boardId, () => this.api.saveCustomFields(boardId, fields));
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
    if (boardId !== 'default') this.sendToServer(boardId, () => this.api.saveAutomations(boardId, rules));
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
    this.sendToServer(null, () => this.api.saveTemplate(template));
    return template;
  }

  deleteTemplate(templateId: string): void {
    this.writeCustomTemplates(
      this.readCustomTemplates().filter(template => template.id !== templateId)
    );
    this.sendToServer(null, () => this.api.deleteTemplate(templateId));
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
    if (boardId !== 'default') this.sendToServer(null, () => this.api.clearActivity(boardId));
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
      if (boardId !== 'default') this.sendToServer(null, () => this.api.addActivity(boardId, [event]));
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
      updatedAt: new Date(),
      role: 'owner'
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

