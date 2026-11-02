import {
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  BoardActivity,
  Card,
  Column
} from '../card/card.model';
import { BoardService } from '../board.service';

type TaskView =
  | 'all'
  | 'priority-high'
  | 'priority-medium'
  | 'priority-low'
  | 'priority-none'
  | 'label-bug'
  | 'label-feature'
  | 'label-improvement'
  | 'label-planning'
  | 'label-completed'
  | 'label-none';

interface TaskViewGroup {
  title: string;
  views: { id: TaskView; label: string }[];
}

interface CalendarDay {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  cards: Card[];
}

@Component({
  selector: 'app-board',
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
})
export class BoardComponent implements OnInit, OnDestroy {
  columns: Column[] = [];
  boardId = 'default';
  boardName = '';
  taskView: TaskView = 'all';
  taskSearch = '';
  activeView: 'board' | 'calendar' = 'board';
  calendarAnchor = new Date();
  showActivityPanel = false;
  activity: BoardActivity[] = [];
  selectedCalendarCard: Card | null = null;
  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  quickViewGroups: TaskViewGroup[] = [
    {
      title: 'Priority',
      views: [
        { id: 'priority-high', label: 'High' },
        { id: 'priority-medium', label: 'Medium' },
        { id: 'priority-low', label: 'Low' },
        { id: 'priority-none', label: 'No priority' }
      ]
    },
    {
      title: 'Label',
      views: [
        { id: 'label-bug', label: 'Bug' },
        { id: 'label-feature', label: 'Feature' },
        { id: 'label-improvement', label: 'Improvement' },
        { id: 'label-planning', label: 'Planning' },
        { id: 'label-completed', label: 'Completed' },
        { id: 'label-none', label: 'No label' }
      ]
    }
  ];

  private isBrowser: boolean;
  private routeSubscription?: Subscription;
  private lastSavedColumns: Column[] = [];
  private cardActivityTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private route: ActivatedRoute,
    private router: Router,
    private boardService: BoardService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.routeSubscription = this.route.params.subscribe(params => {
      this.boardId = params['id'] || 'default';
      this.loadBoard();
    });
    this.routeSubscription.add(this.route.queryParamMap.subscribe(params => {
      this.activeView = params.get('view') === 'calendar' ? 'calendar' : 'board';
    }));
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.clearCardActivityTimers();
  }

  get calendarTitle(): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric'
    }).format(this.calendarAnchor);
  }

  get calendarDays(): CalendarDay[] {
    const year = this.calendarAnchor.getFullYear();
    const month = this.calendarAnchor.getMonth();
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayOffset);
    const todayKey = this.toDateKey(new Date());
    const cards = this.columns.flatMap(column => this.getFilteredCards(column));

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = this.toDateKey(date);
      return {
        date,
        key,
        inCurrentMonth: date.getMonth() === month,
        isToday: key === todayKey,
        cards: cards.filter(card => card.dueDate === key)
      };
    });
  }

  get unscheduledTaskCount(): number {
    return this.columns.reduce(
      (total, column) => total + this.getFilteredCards(column).filter(card => !card.dueDate).length,
      0
    );
  }

  get calendarScheduledTaskCount(): number {
    return this.columns.reduce(
      (total, column) => total + this.getFilteredCards(column).filter(card => !!card.dueDate).length,
      0
    );
  }

  get overdueCalendarTaskCount(): number {
    const todayKey = this.toDateKey(new Date());
    return this.columns.reduce((total, column) => total + this.getFilteredCards(column).filter(card =>
      !!card.dueDate && card.dueDate < todayKey && !this.isCompleted(card, column)
    ).length, 0);
  }

  setActiveView(view: 'board' | 'calendar'): void {
    this.activeView = view;
    this.selectedCalendarCard = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'calendar' ? 'calendar' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  moveCalendarMonth(offset: number): void {
    this.calendarAnchor = new Date(
      this.calendarAnchor.getFullYear(),
      this.calendarAnchor.getMonth() + offset,
      1
    );
  }

  goToCurrentMonth(): void {
    this.calendarAnchor = new Date();
  }

  openActivityPanel(): void {
    this.activity = this.boardService.getActivity(this.boardId);
    this.showActivityPanel = true;
  }

  closeActivityPanel(): void {
    this.showActivityPanel = false;
  }

  openCalendarCard(card: Card): void {
    this.selectedCalendarCard = card;
  }

  closeCalendarCard(): void {
    this.selectedCalendarCard = null;
  }

  showCardOnBoard(): void {
    const card = this.selectedCalendarCard;
    this.selectedCalendarCard = null;
    this.activeView = 'board';
    if (card) {
      window.setTimeout(() => {
        document.getElementById(`card-${card.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }, 50);
    }
  }

  getCardColumnTitle(card: Card): string {
    return this.columns.find(column => column.id === card.columnId)?.title || 'No column';
  }

  getChecklistCompletedCount(card: Card): number {
    return card.checklist?.filter(item => item.completed).length || 0;
  }

  getActivityIcon(action: string): string {
    const value = action.toLowerCase();
    if (value.includes('created') || value.includes('added')) return '+';
    if (value.includes('deleted') || value.includes('removed')) return '×';
    if (value.includes('moved')) return '→';
    if (value.includes('renamed') || value.includes('updated')) return '✎';
    return '•';
  }

  private toDateKey(date: Date): string {
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
  }

  getDropListIds(): string[] {
    return this.columns.map((_, index) => `column-${index}`);
  }

  get filtersActive(): boolean {
    return this.taskView !== 'all' || !!this.taskSearch.trim();
  }

  get totalTaskCount(): number {
    return this.columns.reduce((total, column) => total + column.cards.length, 0);
  }

  get filteredTaskCount(): number {
    return this.columns.reduce(
      (total, column) => total + this.getFilteredCards(column).length,
      0
    );
  }

  countTasks(view: TaskView): number {
    return this.columns.reduce((total, column) => total + column.cards.filter(card =>
      this.matchesTaskView(card, column, view)
    ).length, 0);
  }

  setTaskView(view: TaskView): void {
    this.taskView = view;
  }

  getFilteredCards(column: Column): Card[] {
    const query = this.taskSearch.trim().toLocaleLowerCase();
    return column.cards.filter(card => {
      const matchesView = this.taskView === 'all' ||
        this.matchesTaskView(card, column, this.taskView);
      const searchableText = [card.title, card.description, card.issueKey]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return matchesView && (!query || searchableText.includes(query));
    });
  }

  clearFilters(): void {
    this.taskView = 'all';
    this.taskSearch = '';
  }

  private matchesTaskView(card: Card, column: Column, view: TaskView): boolean {
    switch (view) {
      case 'priority-high': return card.priority === 'High';
      case 'priority-medium': return card.priority === 'Medium';
      case 'priority-low': return card.priority === 'Low';
      case 'priority-none': return !card.priority;
      case 'label-bug': return card.label === 'Bug';
      case 'label-feature': return card.label === 'Feature';
      case 'label-improvement': return card.label === 'Improvement';
      case 'label-planning': return card.label === 'Planning';
      case 'label-completed': return this.isCompleted(card, column);
      case 'label-none': return !card.label;
      default: return true;
    }
  }

  private isCompleted(card: Card, column: Column): boolean {
    const status = column.title.trim().toLowerCase();

    return status === 'done' || status === 'completed' || card.label === 'Completed';
  }

  renameBoard(): void {
    if (!this.isBrowser || this.boardId === 'default') return;

    const board = this.boardService
      .getBoards()
      .find(item => item.id === this.boardId);

    if (!board) {
      window.alert('Board not found.');
      return;
    }

    const newName = window.prompt(
      'Enter the new board name:',
      board.name
    );

    if (newName === null) return;

    if (!newName.trim()) {
      window.alert('Board name cannot be empty.');
      return;
    }

    if (this.boardService.renameBoard(this.boardId, newName)) {
      this.boardName = newName.trim();
      this.recordActivity('Board renamed', `Renamed the board to “${this.boardName}”.`);
    } else {
      window.alert('Could not rename the board.');
    }
  }

  addColumn(): void {
    if (!this.isBrowser) return;

    const title = window.prompt('Enter column name:');

    if (title === null || title.trim() === '') return;

    this.columns = [
      ...this.columns,
      {
        id: `col-${Date.now()}`,
        boardId: this.boardId,
        title: title.trim(),
        cards: []
      }
    ];

    this.saveColumns();
  }

  removeColumn(index: number): void {
    if (!this.isBrowser) return;

    const column = this.columns[index];
    if (!column) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${column.title}" and all its cards?`
    );

    if (!confirmed) return;

    this.columns = this.columns.filter((_, i) => i !== index);
    this.saveColumns();
  }

  renameColumn(event: {
    columnId: string;
    newTitle: string;
  }): void {
    const index = this.columns.findIndex(
      column => column.id === event.columnId
    );

    if (index === -1) return;

    this.columns[index] = {
      ...this.columns[index],
      title: event.newTitle
    };

    this.saveColumns();
  }

  resetBoard(): void {
    if (!this.isBrowser) return;

    const confirmed = window.confirm(
      'Reset this board? All its cards will be removed and the default columns restored.'
    );

    if (!confirmed) return;
    this.clearCardActivityTimers();

    // Restore the three default columns with empty cards.
    // Only the current board is affected.
    this.columns = [
      {
        id: `col-1-${this.boardId}`,
        boardId: this.boardId,
        title: 'To Do',
        cards: []
      },
      {
        id: `col-2-${this.boardId}`,
        boardId: this.boardId,
        title: 'In Progress',
        cards: []
      },
      {
        id: `col-3-${this.boardId}`,
        boardId: this.boardId,
        title: 'Done',
        cards: []
      }
    ];

    this.clearFilters();

    // Save the reset columns without logging every removed card individually.
    this.saveColumns(false);
    this.recordActivity('Board reset', 'Restored the default columns and cleared the cards.');
  }

  deleteCurrentBoard(): void {
    if (!this.isBrowser || this.boardId === 'default') return;

    const confirmed = window.confirm(
      `Delete "${this.boardName}" and all its columns and cards? This cannot be undone.`
    );

    if (!confirmed) return;

    this.boardService.deleteBoard(this.boardId);
    this.router.navigate(['/boards']);
  }

  saveColumns(trackActivity = true): void {
    if (!this.isBrowser) return;

    const nextColumns = this.cloneColumns(this.columns);
    this.boardService.saveColumns(this.boardId, this.columns);
    if (trackActivity) {
      this.trackColumnChanges(this.lastSavedColumns, nextColumns);
    }
    this.lastSavedColumns = nextColumns;
    this.refreshActivity();
  }

  private loadBoard(): void {
    this.clearCardActivityTimers();
    const board = this.boardService
      .getBoards()
      .find(item => item.id === this.boardId);

    if (this.boardId !== 'default' && !board) {
      this.router.navigate(['/boards']);
      return;
    }

    this.boardName = board?.name || 'Default Board';
    this.columns = this.boardService.loadColumns(this.boardId);
    this.lastSavedColumns = this.cloneColumns(this.columns);
    this.activity = this.boardService.getActivity(this.boardId);
  }

  private cloneColumns(columns: Column[]): Column[] {
    return JSON.parse(JSON.stringify(columns)) as Column[];
  }

  private trackColumnChanges(previous: Column[], current: Column[]): void {
    const previousColumns = new Map(previous.map(column => [column.id, column]));
    const currentColumns = new Map(current.map(column => [column.id, column]));

    current.forEach(column => {
      const oldColumn = previousColumns.get(column.id);
      if (!oldColumn) {
        this.recordActivity('Column added', `Added the “${column.title}” column.`);
      } else if (oldColumn.title !== column.title) {
        this.recordActivity('Column renamed', `Renamed “${oldColumn.title}” to “${column.title}”.`);
      }
    });

    previous.forEach(column => {
      if (!currentColumns.has(column.id)) {
        this.recordActivity('Column deleted', `Removed the “${column.title}” column.`);
      }
    });

    const previousCards = new Map(previous.flatMap(column => column.cards).map(card => [card.id, card]));
    const currentCards = new Map(current.flatMap(column => column.cards).map(card => [card.id, card]));

    currentCards.forEach((card, cardId) => {
      const oldCard = previousCards.get(cardId);
      if (!oldCard) {
        this.recordActivity('Card created', `Created “${card.title}”.`, card);
        return;
      }

      if (oldCard.columnId !== card.columnId) {
        const from = previousColumns.get(oldCard.columnId)?.title || 'a column';
        const to = currentColumns.get(card.columnId)?.title || 'a column';
        this.recordActivity('Card moved', `Moved “${card.title}” from ${from} to ${to}.`, card);
        return;
      }

      const changedFields = this.changedCardFields(oldCard, card);
      if (changedFields.length) {
        this.queueCardUpdate(card, `Updated ${changedFields.join(', ')} on “${card.title}”.`);
      }
    });

    previousCards.forEach((card, cardId) => {
      if (!currentCards.has(cardId)) {
        const timer = this.cardActivityTimers.get(cardId);
        if (timer) clearTimeout(timer);
        this.cardActivityTimers.delete(cardId);
        this.recordActivity('Card deleted', `Deleted “${card.title}”.`, card);
      }
    });
  }

  private changedCardFields(before: Card, after: Card): string[] {
    const fieldLabels: Record<string, string> = {
      title: 'the title',
      description: 'the description',
      priority: 'the priority',
      label: 'the label',
      assignee: 'the assignee',
      dueDate: 'the due date',
      checklist: 'the checklist'
    };

    return Object.keys(fieldLabels).filter(key =>
      JSON.stringify((before as any)[key]) !== JSON.stringify((after as any)[key])
    ).map(key => fieldLabels[key]);
  }

  private queueCardUpdate(card: Card, description: string): void {
    const existing = this.cardActivityTimers.get(card.id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.recordActivity('Card updated', description, card);
      this.cardActivityTimers.delete(card.id);
    }, 900);
    this.cardActivityTimers.set(card.id, timer);
  }

  private clearCardActivityTimers(): void {
    this.cardActivityTimers.forEach(timer => clearTimeout(timer));
    this.cardActivityTimers.clear();
  }

  private recordActivity(action: string, description: string, card?: Card): void {
    this.boardService.recordActivity(this.boardId, action, description, card);
    this.refreshActivity();
  }

  private refreshActivity(): void {
    if (this.isBrowser) {
      this.activity = this.boardService.getActivity(this.boardId);
    }
  }
}

