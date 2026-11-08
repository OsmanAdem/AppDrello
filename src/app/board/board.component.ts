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
import { IconName } from '../shared/icon.component';
import { LiveBoardService } from '../shared/live-board.service';
import { FilterMenuOption } from '../shared/filter-menu.component';
import {
  AutomationAction,
  AutomationRule,
  AutomationTrigger,
  BoardActivity,
  BoardMember,
  Card,
  CardLabel,
  CardPriority,
  Column,
  CustomFieldDefinition,
  CustomFieldType,
  Sprint
} from '../card/card.model';
import { BoardService } from '../board.service';
import { AuthService } from '../auth/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmService, quoted } from '../shared/confirm.service';
import {
  addDays,
  daysBetween,
  parseDateKey,
  startOfWeek,
  toDateKey
} from '../shared/date-utils';

/** Values for the board filters. 'none' = cards without a priority/label. */
type PriorityFilter = 'High' | 'Medium' | 'Low' | 'none';
type LabelFilter = 'Bug' | 'Feature' | 'Improvement' | 'Planning' | 'Completed' | 'none';

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
  /** The checked values in each filter menu. Empty = no filter (show all). */
  priorityFilters: PriorityFilter[] = [];
  labelFilters: LabelFilter[] = [];
  taskSearch = '';
  activeView: BoardView = 'board';
  timelineStart = startOfWeek(new Date());
  readonly timelineLength = 28; // days shown at once (4 weeks)
  calendarAnchor = new Date();
  showActivityPanel = false;
  showSettingsMenu = false;
  // Sharing
  showSharePanel = false;
  members: BoardMember[] = [];
  membersLoading = false;
  inviteEmail = '';
  inviteError = '';
  inviteSuccess = '';
  inviting = false;
  /** The owner's name, shown on boards shared with you. */
  ownerName = '';
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
  readonly priorityFilterOptions: { value: PriorityFilter; label: string }[] = [
    { value: 'High', label: 'High' },
    { value: 'Medium', label: 'Medium' },
    { value: 'Low', label: 'Low' },
    { value: 'none', label: 'No priority' }
  ];
  readonly labelFilterOptions: { value: LabelFilter; label: string }[] = [
    { value: 'Bug', label: 'Bug' },
    { value: 'Feature', label: 'Feature' },
    { value: 'Improvement', label: 'Improvement' },
    { value: 'Planning', label: 'Planning' },
    { value: 'Completed', label: 'Completed' },
    { value: 'none', label: 'No label' }
  ];

  private isBrowser: boolean;
  private routeSubscription?: Subscription;
  private lastSavedColumns: Column[] = [];
  private cardActivityTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private route: ActivatedRoute,
    private router: Router,
    private boardService: BoardService,
    private confirm: ConfirmService,
    private auth: AuthService,
    private live: LiveBoardService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.routeSubscription = this.route.params.subscribe(params => {
      this.boardId = params['id'] || 'default';
      this.openBoard();
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
    this.stopLiveUpdates();
  }

  // ----- Live updates -----
  //
  // While a board is open, the server tells us when someone else saved a change to it.
  // We then fetch the board again, but never while the user is in the middle of something
  // (typing, dragging, a dialog or panel open), so nothing they are doing jumps or disappears.

  private stopWatching?: () => void;
  private liveRefreshTimer?: ReturnType<typeof setTimeout>;

  private startLiveUpdates(boardId: string): void {
    this.stopLiveUpdates();
    this.stopWatching = this.live.watch(boardId, () => {
      // Someone accepted or declined an invitation: keep the open share panel up to date.
      if (this.showSharePanel) this.refreshMembers();
      this.scheduleLiveRefresh(boardId, 300);
    });
  }

  private stopLiveUpdates(): void {
    this.stopWatching?.();
    this.stopWatching = undefined;
    clearTimeout(this.liveRefreshTimer);
  }

  /** Waits a moment (several saves often arrive together), then refreshes once. */
  private scheduleLiveRefresh(boardId: string, delay: number): void {
    clearTimeout(this.liveRefreshTimer);
    this.liveRefreshTimer = setTimeout(() => {
      if (this.boardId !== boardId) return;
      if (this.isUserBusy()) {
        this.scheduleLiveRefresh(boardId, 1500); // try again when they're done
        return;
      }
      this.boardService.syncBoard(boardId).then(() => {
        if (this.boardId === boardId && !this.isUserBusy()) this.loadBoard();
        else if (this.boardId === boardId) this.scheduleLiveRefresh(boardId, 1500);
      });
    }, delay);
  }

  /** True while the user is typing, dragging a card, or has a dialog or panel open. */
  private isUserBusy(): boolean {
    const active = document.activeElement as HTMLElement | null;
    const typing = !!active && (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable)
      && !active.closest('.board-search');
    const dragging = !!document.querySelector('.cdk-drag-preview');
    const dialogOpen = !!document.querySelector('[aria-modal="true"]') || this.showSettingsMenu;
    return typing || dragging || dialogOpen;
  }

  // ----- Sharing -----

  /** Owners can rename, delete, reset and share the board. Members work on its contents. */
  get isOwner(): boolean {
    return this.boardService.getRole(this.boardId) === 'owner';
  }

  get myUserId(): string {
    return this.auth.user?.id ?? '';
  }

  async openSharePanel(): Promise<void> {
    this.showSharePanel = true;
    this.inviteEmail = '';
    this.inviteError = '';
    this.inviteSuccess = '';
    this.membersLoading = true;
    try {
      this.members = await this.boardService.getMembers(this.boardId);
    } catch (error) {
      this.inviteError = this.describeError(error);
    } finally {
      this.membersLoading = false;
    }
  }

  private async refreshMembers(): Promise<void> {
    try {
      this.members = await this.boardService.getMembers(this.boardId);
    } catch {
      // Keep the list we have; the next change will try again.
    }
  }

  closeSharePanel(): void {
    this.showSharePanel = false;
  }

  async invite(): Promise<void> {
    this.inviteError = '';
    this.inviteSuccess = '';
    const email = this.inviteEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.inviteError = 'Enter the email address of the person you want to invite.';
      return;
    }

    this.inviting = true;
    try {
      this.members = await this.boardService.inviteMember(this.boardId, email);
      const added = this.members.find(member => member.email === email.toLowerCase());
      this.inviteSuccess = `Invitation sent to ${added?.name ?? email}. They can open the board once they accept it.`;
      this.recordActivity('Member invited', `Invited ${added?.name ?? email} to the board.`);
      this.inviteEmail = '';
    } catch (error) {
      this.inviteError = this.describeError(error);
    } finally {
      this.inviting = false;
    }
  }

  async removeMember(member: BoardMember): Promise<void> {
    if (member.status === 'pending') {
      const cancel = await this.confirm.ask({
        title: `Cancel the invitation to ${member.name}?`,
        message: `${member.name} won't be able to accept it anymore. You can invite them again later.`,
        confirmLabel: 'Cancel invitation',
        cancelLabel: 'Keep it',
        danger: true
      });
      if (!cancel) return;
      try {
        this.members = await this.boardService.removeMember(this.boardId, member.id);
        this.recordActivity('Invitation cancelled', `Cancelled the invitation to ${member.name}.`);
      } catch (error) {
        this.inviteError = this.describeError(error);
      }
      return;
    }

    const confirmed = await this.confirm.ask({
      title: `Remove ${member.name} from ${quoted(this.boardName)}?`,
      message: `${member.name} won't be able to open this board anymore. Their cards and changes stay on the board.`,
      confirmLabel: 'Remove',
      danger: true
    });
    if (!confirmed) return;

    try {
      this.members = await this.boardService.removeMember(this.boardId, member.id);
      this.recordActivity('Member removed', `Removed ${member.name} from the board.`);
    } catch (error) {
      this.inviteError = this.describeError(error);
    }
  }

  async leaveBoard(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Leave ${quoted(this.boardName)}?`,
      message: `You won't be able to open this board anymore, unless ${this.ownerName || 'the owner'} invites you again. Your changes stay on the board.`,
      confirmLabel: 'Leave board',
      danger: true
    });
    if (!confirmed) return;

    try {
      await this.boardService.leaveBoard(this.boardId, this.myUserId);
      this.router.navigate(['/boards']);
    } catch (error) {
      await this.confirm.notify({ title: "Couldn't leave the board", message: this.describeError(error) });
    }
  }

  initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
  }

  private describeError(error: unknown): string {
    const http = error as HttpErrorResponse;
    if (http?.status === 0) return "Can't reach the server. Is it running? (npm run dev in the server folder)";
    return http?.error?.error || 'Something went wrong. Please try again.';
  }

  /** True when some changes are only saved in this browser (the server didn't get them). */
  get hasUnsavedChanges(): boolean {
    return this.boardService.hasUnsavedChanges;
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

  async removeCustomField(field: CustomFieldDefinition): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Delete field ${quoted(field.name)}?`,
      message: 'The field is removed from every card on this board, together with the values filled in. This can\'t be undone.',
      confirmLabel: 'Delete field',
      danger: true
    });
    if (!confirmed) return;

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

  async removeAutomation(rule: AutomationRule): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Delete automation?',
      message: `“${this.describeRule(rule)}” will stop running. Changes it already made stay.`,
      confirmLabel: 'Delete automation',
      danger: true
    });
    if (!confirmed) return;

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

  async saveAsTemplate(): Promise<void> {
    if (!this.isBrowser) return;

    const name = await this.confirm.prompt({
      title: 'Save as template',
      message: "The template keeps this board's columns and custom fields, but not its cards.",
      label: 'Template name',
      value: `${this.boardName} template`,
      confirmLabel: 'Save template',
      maxLength: 60,
      emptyError: 'Give the template a name.'
    });
    if (name === null) return;

    this.boardService.saveBoardAsTemplate(this.boardId, name);
    await this.confirm.notify({
      title: `Template ${quoted(name)} saved`,
      message: 'Pick it under "Template" the next time you create a board.'
    });
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
    this.saveFilters();
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

  async clearActivity(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Clear the history of ${quoted(this.boardName)}?`,
      message: `All ${this.activity.length} activity entries are removed. Your cards and columns aren't affected. This can't be undone.`,
      confirmLabel: 'Clear history',
      danger: true
    });
    if (!confirmed) return;

    this.clearCardActivityTimers(); // don't let a pending "Card updated" entry reappear
    this.boardService.clearActivity(this.boardId);
    this.activity = [];
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

  getChecklistTotal(card: Card): number {
    return card.checklist?.length ?? 0;
  }

  /** "Small, Medium, Large" for a dropdown field, or '' when it has no options. */
  fieldOptionsText(field: CustomFieldDefinition): string {
    return field.options?.join(', ') ?? '';
  }

  getChecklistCompletedCount(card: Card): number {
    return card.checklist?.filter(item => item.completed).length || 0;
  }

  getActivityIcon(action: string): IconName {
    const value = action.toLowerCase();
    if (value.includes('created') || value.includes('added')) return 'plus';
    if (value.includes('deleted') || value.includes('removed')) return 'x';
    if (value.includes('moved')) return 'arrow-right';
    if (value.includes('renamed') || value.includes('updated')) return 'pencil';
    return 'dot';
  }

  getDropListIds(): string[] {
    return this.columns.map((_, index) => `column-${index}`);
  }

  get filtersActive(): boolean {
    return this.priorityFilters.length > 0 || this.labelFilters.length > 0 || !!this.taskSearch.trim() || this.showActiveSprintOnly;
  }

  /** The filters that are on, shown as small removable chips under the toolbar. */
  get activeFilters(): { label: string; clear: () => void }[] {
    const chips: { label: string; clear: () => void }[] = [];
    for (const priority of this.priorityFilterOptions.filter(option => this.priorityFilters.includes(option.value))) {
      chips.push({
        label: priority.value === 'none' ? 'No priority' : `${priority.label} priority`,
        clear: () => this.setPriorityFilters(this.priorityFilters.filter(value => value !== priority.value))
      });
    }
    for (const label of this.labelFilterOptions.filter(option => this.labelFilters.includes(option.value))) {
      chips.push({ label: label.label, clear: () => this.setLabelFilters(this.labelFilters.filter(value => value !== label.value)) });
    }
    if (this.showActiveSprintOnly && this.activeSprint) chips.push({ label: this.activeSprint.name, clear: () => this.toggleActiveSprintFilter() });
    if (this.taskSearch.trim()) chips.push({ label: `“${this.taskSearch.trim()}”`, clear: () => { this.taskSearch = ''; this.saveFilters(); } });
    return chips;
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

  /** The choices in the Priority menu, with how many cards each one matches. */
  get priorityMenuOptions(): FilterMenuOption[] {
    return this.priorityFilterOptions.map(option => ({ ...option, count: this.countPriority(option.value) }));
  }

  /** The choices in the Label menu, with how many cards each one matches. */
  get labelMenuOptions(): FilterMenuOption[] {
    return this.labelFilterOptions.map(option => ({ ...option, count: this.countLabel(option.value) }));
  }

  setPriorityFilters(values: string[]): void {
    this.priorityFilters = values as PriorityFilter[];
    this.saveFilters();
  }

  setLabelFilters(values: string[]): void {
    this.labelFilters = values as LabelFilter[];
    this.saveFilters();
  }

  /** How many cards have this priority (shown in the Priority menu). */
  countPriority(value: PriorityFilter): number {
    return this.columns.reduce((total, column) => total + column.cards.filter(card => this.matchesPriority(card, value)).length, 0);
  }

  /** How many cards have this label (shown in the Label menu). */
  countLabel(value: LabelFilter): number {
    return this.columns.reduce((total, column) => total + column.cards.filter(card => this.matchesLabel(card, column, value)).length, 0);
  }

  getFilteredCards(column: Column, ignoreSprintFilter = false): Card[] {
    const query = this.taskSearch.trim().toLocaleLowerCase();
    const activeSprintId = this.activeSprint?.id;
    return column.cards.filter(card => {
      const matchesSprint = ignoreSprintFilter || !this.showActiveSprintOnly ||
        (!!activeSprintId && card.sprintId === activeSprintId);
      // Within a menu any checked value may match; across menus both must match.
      const matchesFilters =
        (!this.priorityFilters.length || this.priorityFilters.some(value => this.matchesPriority(card, value))) &&
        (!this.labelFilters.length || this.labelFilters.some(value => this.matchesLabel(card, column, value)));
      const searchableText = [card.title, card.description, card.issueKey]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return matchesSprint && matchesFilters && (!query || searchableText.includes(query));
    });
  }

  clearFilters(): void {
    this.priorityFilters = [];
    this.labelFilters = [];
    this.taskSearch = '';
    this.showActiveSprintOnly = false;
    this.saveFilters();
  }

  // ----- Remembering the filters -----
  //
  // The filters are saved per board in this browser, so they are still on after a reload.
  // They are cleared when someone logs out (like all board data in the browser).

  private get filtersKey(): string {
    return `drello-filters-${this.boardId}`;
  }

  saveFilters(): void {
    if (!this.isBrowser) return;
    try {
      const filters = {
        priority: this.priorityFilters,
        label: this.labelFilters,
        sprintOnly: this.showActiveSprintOnly,
        search: this.taskSearch
      };
      const empty = !filters.priority.length && !filters.label.length && !filters.sprintOnly && !filters.search.trim();
      if (empty) localStorage.removeItem(this.filtersKey);
      else localStorage.setItem(this.filtersKey, JSON.stringify(filters));
    } catch {
      // Storage can be blocked (private mode). The filters then just reset on reload.
    }
  }

  private restoreFilters(): void {
    this.priorityFilters = [];
    this.labelFilters = [];
    this.taskSearch = '';
    this.showActiveSprintOnly = false;
    if (!this.isBrowser) return;
    try {
      const saved = JSON.parse(localStorage.getItem(this.filtersKey) ?? 'null');
      if (!saved) return;
      const priorities = this.priorityFilterOptions.map(option => option.value);
      const labels = this.labelFilterOptions.map(option => option.value);
      this.priorityFilters = (Array.isArray(saved.priority) ? saved.priority : []).filter((value: PriorityFilter) => priorities.includes(value));
      this.labelFilters = (Array.isArray(saved.label) ? saved.label : []).filter((value: LabelFilter) => labels.includes(value));
      this.showActiveSprintOnly = saved.sprintOnly === true;
      this.taskSearch = typeof saved.search === 'string' ? saved.search : '';
    } catch {
      // Unreadable or blocked storage: start without filters.
    }
  }

  private matchesPriority(card: Card, filter: PriorityFilter): boolean {
    return filter === 'none' ? !card.priority : card.priority === filter;
  }

  private matchesLabel(card: Card, column: Column, filter: LabelFilter): boolean {
    if (filter === 'none') return !card.label;
    if (filter === 'Completed') return this.isCompleted(card, column);
    return card.label === filter;
  }

  private isCompleted(card: Card, column: Column): boolean {
    const status = column.title.trim().toLowerCase();

    return status === 'done' || status === 'completed' || card.label === 'Completed';
  }

  async renameBoard(): Promise<void> {
    if (!this.isBrowser || this.boardId === 'default') return;

    const board = this.boardService
      .getBoards()
      .find(item => item.id === this.boardId);
    if (!board) return;

    const newName = await this.confirm.prompt({
      title: `Rename board ${quoted(board.name)}`,
      label: 'Board name',
      value: board.name,
      confirmLabel: 'Rename',
      maxLength: 80,
      emptyError: 'The board needs a name.'
    });
    if (newName === null || newName === board.name) return;

    if (this.boardService.renameBoard(this.boardId, newName)) {
      this.boardName = newName;
      this.recordActivity('Board renamed', `Renamed the board to “${this.boardName}”.`);
    } else {
      await this.confirm.notify({ title: "Couldn't rename the board", message: 'Please try again.' });
    }
  }

  async addColumn(): Promise<void> {
    if (!this.isBrowser) return;

    const title = await this.confirm.prompt({
      title: 'Add a column',
      label: 'Column name',
      placeholder: 'e.g. Review',
      confirmLabel: 'Add column',
      maxLength: 60,
      emptyError: 'Give the column a name.'
    });
    if (title === null) return;

    this.columns = [
      ...this.columns,
      {
        id: `col-${Date.now()}`,
        boardId: this.boardId,
        title,
        cards: []
      }
    ];

    this.saveColumns();
  }

  async removeColumn(index: number): Promise<void> {
    if (!this.isBrowser) return;

    const column = this.columns[index];
    if (!column) return;

    const cardCount = column.cards.length;
    const confirmed = await this.confirm.ask({
      title: `Delete column ${quoted(column.title)}?`,
      message: cardCount
        ? `The column and its ${cardCount} card${cardCount === 1 ? '' : 's'} will be deleted. This can't be undone.`
        : 'The column is empty. This can\'t be undone.',
      confirmLabel: 'Delete column',
      danger: true
    });

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

  async resetBoard(): Promise<void> {
    if (!this.isBrowser) return;

    const confirmed = await this.confirm.ask({
      title: `Reset board ${quoted(this.boardName)}?`,
      message: `All ${this.totalTaskCount} card${this.totalTaskCount === 1 ? '' : 's'} are deleted and the columns go back to To Do, In Progress and Done. This can't be undone.`,
      confirmLabel: 'Reset board',
      danger: true
    });

    if (!confirmed) return;
    this.clearCardActivityTimers();

    // Restore the default columns with empty cards. Only this board is affected.
    this.columns = this.boardService.createDefaultColumns(this.boardId);

    this.clearFilters();

    // Save the reset columns without logging every removed card individually.
    this.saveColumns(false);
    this.recordActivity('Board reset', 'Restored the default columns and cleared the cards.');
  }

  async deleteCurrentBoard(): Promise<void> {
    if (!this.isBrowser || this.boardId === 'default') return;

    const confirmed = await this.confirm.ask({
      title: `Delete board ${quoted(this.boardName)}?`,
      message: 'This permanently deletes the board with all its columns, cards, sprints and history. This can\'t be undone.',
      confirmLabel: 'Delete board',
      danger: true
    });

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

  /**
   * Shows the copy saved in this browser right away (if there is one),
   * then reloads the board once the latest version has arrived from the server.
   */
  private openBoard(): void {
    const boardId = this.boardId;
    const savedLocally = boardId === 'default' ||
      this.boardService.getBoards().some(board => board.id === boardId);

    this.restoreFilters();
    if (savedLocally) this.loadBoard();
    this.startLiveUpdates(boardId);

    this.boardService.syncBoard(boardId).then(() => {
      // Ignore the answer if the user has already opened another board.
      if (this.boardId === boardId) this.loadBoard();
    });
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
    this.ownerName = board?.ownerName ?? '';
    this.columns = this.boardService.loadColumns(this.boardId);
    this.lastSavedColumns = this.cloneColumns(this.columns);
    this.sprints = this.boardService.getSprints(this.boardId);
    if (!this.activeSprint) this.showActiveSprintOnly = false;
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

