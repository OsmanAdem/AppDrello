import {
  Component,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  AutomationAction,
  AutomationRule,
  AutomationTrigger,
  BoardActivity,
  Card,
  CardLabel,
  CardPriority,
  Column,
  CustomFieldDefinition,
  CustomFieldType,
  Sprint
} from '../card/card.model';
import { BoardService } from '../board.service';
import {
  addDays,
  daysBetween,
  parseDateKey,
  startOfWeek,
  toDateKey
} from '../shared/date-utils';

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

type BoardView = 'board' | 'calendar' | 'timeline' | 'backlog';

interface TimelineDay {
  date: Date;
  key: string;
  isToday: boolean;
  isWeekStart: boolean;
}

interface TimelineBar {
  card: Card;
  gridColumn: string;   // CSS grid position, e.g. "3 / 8"
  startsBefore: boolean; // the task began before the visible range
  endsAfter: boolean;    // the task continues after the visible range
  isOverdue: boolean;
}

interface TimelineGroup {
  column: Column;
  bars: TimelineBar[];
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
  activeView: BoardView = 'board';
  timelineStart = startOfWeek(new Date());
  readonly timelineLength = 28; // days shown at once (4 weeks)
  calendarAnchor = new Date();
  showActivityPanel = false;
  showSettingsMenu = false;
  sprints: Sprint[] = [];
  showActiveSprintOnly = false;
  customFields: CustomFieldDefinition[] = [];
  automations: AutomationRule[] = [];
  showAutomationsPanel = false;
  newRule: { trigger: AutomationTrigger; triggerColumnId: string; action: AutomationAction; actionValue: string } =
    { trigger: 'card-moved', triggerColumnId: '', action: 'set-label', actionValue: '' };
  ruleError = '';
  readonly triggerOptions: { value: AutomationTrigger; label: string }[] = [
    { value: 'card-moved', label: 'A card is moved to…' },
    { value: 'card-created', label: 'A card is created in…' },
    { value: 'checklist-completed', label: 'A checklist is completed' }
  ];
  readonly actionOptions: { value: AutomationAction; label: string }[] = [
    { value: 'set-label', label: 'Set the label' },
    { value: 'set-priority', label: 'Set the priority' },
    { value: 'set-assignee', label: 'Assign to someone' },
    { value: 'move-to-column', label: 'Move it to a column' },
    { value: 'set-due-in-days', label: 'Set a due date' }
  ];
  readonly labelOptions: CardLabel[] = ['Bug', 'Feature', 'Improvement', 'Planning', 'Completed'];
  readonly priorityOptions: CardPriority[] = ['Low', 'Medium', 'High'];
  showFieldsPanel = false;
  newField: { name: string; type: CustomFieldType; options: string } = { name: '', type: 'text', options: '' };
  fieldError = '';
  readonly fieldTypes: { value: CustomFieldType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown' },
    { value: 'checkbox', label: 'Checkbox' }
  ];
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
      const view = params.get('view');
      this.activeView = view === 'calendar' || view === 'timeline' || view === 'backlog' ? view : 'board';
    }));
  }

  /** Escape closes the settings menu, like any native menu. */
  @HostListener('document:keydown.escape')
  closeMenus(): void {
    this.showSettingsMenu = false;
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
    const todayKey = toDateKey(new Date());
    const cards = this.columns.flatMap(column => this.getFilteredCards(column));

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = toDateKey(date);
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
    const todayKey = toDateKey(new Date());
    return this.columns.reduce((total, column) => total + this.getFilteredCards(column).filter(card =>
      !!card.dueDate && card.dueDate < todayKey && !this.isCompleted(card, column)
    ).length, 0);
  }

  setActiveView(view: BoardView): void {
    this.activeView = view;
    this.selectedCalendarCard = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: view === 'board' ? null : view },
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

  // ----- Timeline view -----

  get timelineEnd(): Date {
    return addDays(this.timelineStart, this.timelineLength - 1);
  }

  get timelineTitle(): string {
    const format = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
    return `${format.format(this.timelineStart)} – ${format.format(this.timelineEnd)}, ${this.timelineEnd.getFullYear()}`;
  }

  get timelineDays(): TimelineDay[] {
    const todayKey = toDateKey(new Date());

    return Array.from({ length: this.timelineLength }, (_, index) => {
      const date = addDays(this.timelineStart, index);
      const key = toDateKey(date);
      return { date, key, isToday: key === todayKey, isWeekStart: date.getDay() === 1 };
    });
  }

  /** Cards with a due date, grouped by column, positioned on the timeline grid. */
  get timelineGroups(): TimelineGroup[] {
    const firstKey = toDateKey(this.timelineStart);
    const lastKey = toDateKey(this.timelineEnd);
    const todayKey = toDateKey(new Date());

    return this.columns
      .map(column => {
        const bars = this.getFilteredCards(column)
          .filter(card => !!card.dueDate)
          .map(card => {
            // A card without a start date is shown as a one-day bar on its due date.
            let start = card.startDate || card.dueDate!;
            let end = card.dueDate!;
            if (start > end) [start, end] = [end, start];
            return { card, start, end };
          })
          // Keep only cards that overlap the visible four weeks.
          .filter(item => item.end >= firstKey && item.start <= lastKey)
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(item => {
            const visibleStart = item.start < firstKey ? firstKey : item.start;
            const visibleEnd = item.end > lastKey ? lastKey : item.end;
            const startColumn = this.timelineDayIndex(visibleStart) + 1;
            const endColumn = this.timelineDayIndex(visibleEnd) + 2;

            return {
              card: item.card,
              gridColumn: `${startColumn} / ${endColumn}`,
              startsBefore: item.start < firstKey,
              endsAfter: item.end > lastKey,
              isOverdue: item.end < todayKey && !this.isCompleted(item.card, column)
            };
          });

        return { column, bars };
      })
      .filter(group => group.bars.length > 0);
  }

  get timelineTaskCount(): number {
    return this.timelineGroups.reduce((total, group) => total + group.bars.length, 0);
  }

  moveTimeline(weeks: number): void {
    this.timelineStart = addDays(this.timelineStart, weeks * 7);
  }

  goToCurrentWeek(): void {
    this.timelineStart = startOfWeek(new Date());
  }

  // ----- Custom fields -----

  openFieldsPanel(): void {
    this.newField = { name: '', type: 'text', options: '' };
    this.fieldError = '';
    this.showFieldsPanel = true;
  }

  closeFieldsPanel(): void {
    this.showFieldsPanel = false;
  }

  fieldTypeLabel(type: CustomFieldType): string {
    return this.fieldTypes.find(item => item.value === type)?.label || type;
  }

  addCustomField(): void {
    const name = this.newField.name.trim();
    const options = this.newField.options
      .split(',')
      .map(option => option.trim())
      .filter(Boolean);

    if (!name) {
      this.fieldError = 'Give the field a name.';
      return;
    }
    if (this.customFields.some(field => field.name.toLowerCase() === name.toLowerCase())) {
      this.fieldError = 'A field with that name already exists.';
      return;
    }
    if (this.newField.type === 'select' && options.length < 2) {
      this.fieldError = 'A dropdown needs at least two options, separated by commas.';
      return;
    }

    const field: CustomFieldDefinition = {
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      type: this.newField.type,
      options: this.newField.type === 'select' ? options : undefined
    };

    this.customFields = [...this.customFields, field];
    this.boardService.saveCustomFields(this.boardId, this.customFields);
    this.recordActivity('Field added', `Added the “${name}” field.`);
    this.newField = { name: '', type: 'text', options: '' };
    this.fieldError = '';
  }

  removeCustomField(field: CustomFieldDefinition): void {
    if (!window.confirm(`Remove the “${field.name}” field? Its values on every card are deleted too.`)) return;

    // Delete the stored values so cards don't keep data for a field that no longer exists.
    this.columns.forEach(column => column.cards.forEach(card => {
      if (card.customFields) delete card.customFields[field.id];
    }));

    this.customFields = this.customFields.filter(item => item.id !== field.id);
    this.boardService.saveCustomFields(this.boardId, this.customFields);
    this.saveColumns(false);
    this.recordActivity('Field removed', `Removed the “${field.name}” field.`);
  }

  formatFieldValue(card: Card, field: CustomFieldDefinition): string {
    const value = card.customFields?.[field.id];
    if (value === undefined || value === '') return 'Not set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }

  // ----- Automations -----

  openAutomationsPanel(): void {
    this.newRule = { trigger: 'card-moved', triggerColumnId: this.columns[0]?.id || '', action: 'set-label', actionValue: '' };
    this.ruleError = '';
    this.showAutomationsPanel = true;
  }

  closeAutomationsPanel(): void {
    this.showAutomationsPanel = false;
  }

  setRuleAction(action: AutomationAction): void {
    this.newRule.action = action;
    this.newRule.actionValue = action === 'set-due-in-days' ? '3' : '';
  }

  addAutomation(): void {
    const { trigger, triggerColumnId, action } = this.newRule;
    const actionValue = String(this.newRule.actionValue ?? '').trim();

    if (trigger === 'card-moved' && !triggerColumnId) {
      this.ruleError = 'Choose which column the card is moved to.';
      return;
    }
    if (!actionValue) {
      this.ruleError = 'Choose what the automation should do.';
      return;
    }
    if (action === 'set-due-in-days') {
      const days = Number(actionValue);
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        this.ruleError = 'Days must be a whole number between 0 and 365.';
        return;
      }
    }
    if (action === 'move-to-column' && trigger !== 'checklist-completed' && actionValue === triggerColumnId) {
      this.ruleError = 'The card is already in that column. Pick another one.';
      return;
    }

    const rule: AutomationRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      boardId: this.boardId,
      enabled: true,
      trigger,
      triggerColumnId: trigger === 'checklist-completed' ? undefined : triggerColumnId || undefined,
      action,
      actionValue,
      createdAt: new Date().toISOString()
    };

    this.automations = [...this.automations, rule];
    this.boardService.saveAutomations(this.boardId, this.automations);
    this.recordActivity('Automation added', `${this.describeRule(rule)}.`);
    this.setRuleAction('set-label');
    this.ruleError = '';
  }

  toggleAutomation(rule: AutomationRule): void {
    this.automations = this.automations.map(item =>
      item.id === rule.id ? { ...item, enabled: !item.enabled } : item
    );
    this.boardService.saveAutomations(this.boardId, this.automations);
  }

  removeAutomation(rule: AutomationRule): void {
    if (!window.confirm('Delete this automation?')) return;

    this.automations = this.automations.filter(item => item.id !== rule.id);
    this.boardService.saveAutomations(this.boardId, this.automations);
    this.recordActivity('Automation removed', `${this.describeRule(rule)}.`);
  }

  /** Plain-English summary, e.g. "When a card is moved to Done → set the label to Completed". */
  describeRule(rule: AutomationRule): string {
    const column = (id?: string) => this.columns.find(item => item.id === id)?.title || 'a deleted column';

    const when = rule.trigger === 'card-moved'
      ? `When a card is moved to ${column(rule.triggerColumnId)}`
      : rule.trigger === 'card-created'
        ? `When a card is created${rule.triggerColumnId ? ` in ${column(rule.triggerColumnId)}` : ''}`
        : 'When a checklist is completed';

    const days = Number(rule.actionValue);
    const then = {
      'set-label': `set the label to ${rule.actionValue}`,
      'set-priority': `set the priority to ${rule.actionValue}`,
      'set-assignee': `assign it to ${rule.actionValue}`,
      'move-to-column': `move it to ${column(rule.actionValue)}`,
      'set-due-in-days': days === 0 ? 'set the due date to today' : `set the due date ${days} day${days === 1 ? '' : 's'} ahead`
    }[rule.action];

    return `${when} → ${then}`;
  }

  /**
   * Compares the board before and after the user's change, finds what happened
   * (card created, card moved, checklist completed) and runs matching rules once.
   * Rules don't trigger each other, so an automation can never loop forever.
   */
  private runAutomations(previous: Column[]): { rule: AutomationRule; card: Card }[] {
    const rules = this.automations.filter(rule => rule.enabled);
    if (!rules.length) return [];

    const previousCards = new Map(previous.flatMap(column => column.cards).map(card => [card.id, card]));
    const isChecklistDone = (card?: Card) => !!card?.checklist?.length && card.checklist.every(item => item.completed);
    const events: { trigger: AutomationTrigger; card: Card; columnId: string }[] = [];

    this.columns.forEach(column => column.cards.forEach(card => {
      const before = previousCards.get(card.id);
      if (!before) {
        events.push({ trigger: 'card-created', card, columnId: column.id });
      } else if (before.columnId !== card.columnId) {
        events.push({ trigger: 'card-moved', card, columnId: column.id });
      }
      if (isChecklistDone(card) && !isChecklistDone(before)) {
        events.push({ trigger: 'checklist-completed', card, columnId: column.id });
      }
    }));

    const results: { rule: AutomationRule; card: Card }[] = [];

    for (const event of events) {
      for (const rule of rules) {
        if (rule.trigger !== event.trigger) continue;
        if (rule.triggerColumnId && rule.triggerColumnId !== event.columnId) continue;
        if (this.applyAutomation(rule, event.card)) results.push({ rule, card: event.card });
      }
    }

    return results;
  }

  private applyAutomation(rule: AutomationRule, card: Card): boolean {
    switch (rule.action) {
      case 'set-label':
        card.label = rule.actionValue as CardLabel;
        return true;
      case 'set-priority':
        card.priority = rule.actionValue as CardPriority;
        return true;
      case 'set-assignee':
        card.assignee = rule.actionValue;
        return true;
      case 'set-due-in-days':
        card.dueDate = toDateKey(addDays(new Date(), Number(rule.actionValue)));
        return true;
      case 'move-to-column': {
        const target = this.columns.find(column => column.id === rule.actionValue);
        const source = this.columns.find(column => column.cards.includes(card));
        if (!target || !source || source === target) return false;

        source.cards.splice(source.cards.indexOf(card), 1);
        target.cards.push(card);
        card.columnId = target.id;
        return true;
      }
    }
  }

  // ----- Templates -----

  saveAsTemplate(): void {
    if (!this.isBrowser) return;

    const name = window.prompt(
      'Name the template. It saves this board\'s columns and custom fields (not the cards):',
      `${this.boardName} template`
    );

    if (name === null) return;

    if (!name.trim()) {
      window.alert('Template name cannot be empty.');
      return;
    }

    this.boardService.saveBoardAsTemplate(this.boardId, name);
    window.alert(`Saved “${name.trim()}”. Pick it the next time you create a board.`);
  }

  // ----- Sprints -----

  get activeSprint(): Sprint | undefined {
    return this.sprints.find(sprint => sprint.status === 'active');
  }

  /** All cards for the backlog view: search and quick views apply, the sprint filter does not. */
  get backlogCards(): Card[] {
    return this.columns.flatMap(column => this.getFilteredCards(column, true));
  }

  onSprintsChanged(sprints: Sprint[]): void {
    this.sprints = sprints;
    if (!this.activeSprint) this.showActiveSprintOnly = false;
  }

  toggleActiveSprintFilter(): void {
    this.showActiveSprintOnly = !this.showActiveSprintOnly;
  }

  getSprintName(card: Card): string {
    return this.sprints.find(sprint =>
      sprint.id === card.sprintId && sprint.status !== 'completed'
    )?.name || 'Backlog';
  }

  private timelineDayIndex(dateKey: string): number {
    return daysBetween(this.timelineStart, parseDateKey(dateKey));
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

  getDropListIds(): string[] {
    return this.columns.map((_, index) => `column-${index}`);
  }

  get filtersActive(): boolean {
    return this.taskView !== 'all' || !!this.taskSearch.trim() || this.showActiveSprintOnly;
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

  getFilteredCards(column: Column, ignoreSprintFilter = false): Card[] {
    const query = this.taskSearch.trim().toLocaleLowerCase();
    const activeSprintId = this.activeSprint?.id;
    return column.cards.filter(card => {
      const matchesSprint = ignoreSprintFilter || !this.showActiveSprintOnly ||
        (!!activeSprintId && card.sprintId === activeSprintId);
      const matchesView = this.taskView === 'all' ||
        this.matchesTaskView(card, column, this.taskView);
      const searchableText = [card.title, card.description, card.issueKey]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return matchesSprint && matchesView && (!query || searchableText.includes(query));
    });
  }

  clearFilters(): void {
    this.taskView = 'all';
    this.taskSearch = '';
    this.showActiveSprintOnly = false;
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

    // Restore the default columns with empty cards. Only this board is affected.
    this.columns = this.boardService.createDefaultColumns(this.boardId);

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

    // Automations run first, so their changes are saved together with the user's change.
    const automationResults = trackActivity ? this.runAutomations(this.lastSavedColumns) : [];

    const nextColumns = this.cloneColumns(this.columns);
    this.boardService.saveColumns(this.boardId, this.columns);
    if (trackActivity) {
      this.trackColumnChanges(this.lastSavedColumns, nextColumns);
    }
    automationResults.forEach(({ rule, card }) =>
      this.recordActivity('Automation ran', `${this.describeRule(rule)} — on “${card.title}”.`, card)
    );
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
    this.sprints = this.boardService.getSprints(this.boardId);
    this.showActiveSprintOnly = false;
    this.customFields = this.boardService.getCustomFields(this.boardId);
    this.automations = this.boardService.getAutomations(this.boardId);
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
      startDate: 'the start date',
      dueDate: 'the due date',
      checklist: 'the checklist',
      customFields: 'a custom field'
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

