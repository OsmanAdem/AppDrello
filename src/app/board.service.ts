import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
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
    return template;
  }

  deleteTemplate(templateId: string): void {
    this.writeCustomTemplates(
      this.readCustomTemplates().filter(template => template.id !== templateId)
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

