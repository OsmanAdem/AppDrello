import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';
import { Card, Column, Sprint } from '../card/card.model';
import { BoardService } from '../board.service';
import { ConfirmService, quoted } from '../shared/confirm.service';
import { addDays, toDateKey } from '../shared/date-utils';

/**
 * Backlog and sprint planning for one board.
 * Cards without a sprint live in the backlog. A sprint is a planned period of
 * work: you plan it, start it, and complete it. Only one sprint can be active.
 */
@Component({
  selector: 'app-backlog',
  templateUrl: './backlog.component.html',
  styleUrls: ['./backlog.component.scss']
})
export class BacklogComponent implements OnChanges {
  @Input() boardId = '';
  @Input() columns: Column[] = [];
  @Input() cards: Card[] = []; // all cards, already filtered by search/quick views

  @Output() cardsChanged = new EventEmitter<void>();
  @Output() sprintsChanged = new EventEmitter<Sprint[]>();
  @Output() openCard = new EventEmitter<Card>();

  sprints: Sprint[] = [];
  showCreateForm = false;
  showCompleted = false;
  newSprint = { name: '', goal: '', startDate: '', endDate: '' };
  formError = '';

  constructor(
    private boardService: BoardService,
    private confirm: ConfirmService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['boardId']) {
      this.sprints = this.boardService.getSprints(this.boardId);
    }
  }

  // ----- What to show -----

  get activeSprint(): Sprint | undefined {
    return this.sprints.find(sprint => sprint.status === 'active');
  }

  /** Active sprint first, then planned sprints in the order they were created. */
  get openSprints(): Sprint[] {
    const order = { active: 0, planned: 1, completed: 2 };
    return this.sprints
      .filter(sprint => sprint.status !== 'completed')
      .sort((a, b) => order[a.status] - order[b.status] || a.createdAt.localeCompare(b.createdAt));
  }

  /** Most recently created first, so the latest finished sprint is on top. */
  get completedSprints(): Sprint[] {
    return this.sprints
      .filter(sprint => sprint.status === 'completed')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Cards that are not in any open sprint. */
  get backlogCards(): Card[] {
    const openSprintIds = new Set(this.openSprints.map(sprint => sprint.id));
    return this.cards.filter(card => !card.sprintId || !openSprintIds.has(card.sprintId));
  }

  cardsInSprint(sprint: Sprint): Card[] {
    return this.cards.filter(card => card.sprintId === sprint.id);
  }

  doneCount(sprint: Sprint): number {
    return this.cardsInSprint(sprint).filter(card => this.isDone(card)).length;
  }

  progress(sprint: Sprint): number {
    const total = this.cardsInSprint(sprint).length;
    return total ? Math.round((this.doneCount(sprint) / total) * 100) : 0;
  }

  columnTitle(card: Card): string {
    return this.columns.find(column => column.id === card.columnId)?.title || 'No column';
  }

  isDone(card: Card): boolean {
    const status = this.columnTitle(card).trim().toLowerCase();
    return status === 'done' || status === 'completed' || card.label === 'Completed';
  }

  // ----- Creating sprints -----

  openCreateForm(): void {
    const today = new Date();
    this.newSprint = {
      name: `Sprint ${this.sprints.length + 1}`,
      goal: '',
      startDate: toDateKey(today),
      endDate: toDateKey(addDays(today, 13)) // two weeks is a common sprint length
    };
    this.formError = '';
    this.showCreateForm = true;
  }

  createSprint(): void {
    const name = this.newSprint.name.trim();

    if (!name) {
      this.formError = 'Give the sprint a name.';
      return;
    }
    if (this.newSprint.startDate && this.newSprint.endDate && this.newSprint.endDate < this.newSprint.startDate) {
      this.formError = 'The end date must be after the start date.';
      return;
    }

    const sprint: Sprint = {
      id: `sprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      boardId: this.boardId,
      name,
      goal: this.newSprint.goal.trim() || undefined,
      startDate: this.newSprint.startDate || undefined,
      endDate: this.newSprint.endDate || undefined,
      status: 'planned',
      createdAt: new Date().toISOString()
    };

    this.sprints = [...this.sprints, sprint];
    this.saveSprints();
    this.boardService.recordActivity(this.boardId, 'Sprint created', `Created “${name}”.`);
    this.showCreateForm = false;
  }

  // ----- Sprint lifecycle: planned → active → completed -----

  async startSprint(sprint: Sprint): Promise<void> {
    if (this.activeSprint) {
      await this.confirm.notify({
        title: 'Another sprint is running',
        message: `Complete ${quoted(this.activeSprint.name)} before starting ${quoted(sprint.name)}. Only one sprint can be active at a time.`
      });
      return;
    }

    this.updateSprint(sprint.id, {
      status: 'active',
      startDate: sprint.startDate || toDateKey(new Date())
    });
    this.boardService.recordActivity(this.boardId, 'Sprint started', `Started “${sprint.name}”.`);
  }

  async completeSprint(sprint: Sprint): Promise<void> {
    const unfinished = this.cardsInSprint(sprint).filter(card => !this.isDone(card));
    const confirmed = await this.confirm.ask({
      title: `Complete sprint ${quoted(sprint.name)}?`,
      message: unfinished.length
        ? `${unfinished.length} unfinished task${unfinished.length === 1 ? '' : 's'} will go back to the backlog.`
        : 'Every task in this sprint is done. Nice work!',
      confirmLabel: 'Complete sprint'
    });
    if (!confirmed) return;

    // Unfinished work returns to the backlog so it can be planned again.
    unfinished.forEach(card => delete card.sprintId);

    this.updateSprint(sprint.id, { status: 'completed' });
    this.boardService.recordActivity(this.boardId, 'Sprint completed', `Completed “${sprint.name}”.`);
    this.cardsChanged.emit();
  }

  async deleteSprint(sprint: Sprint): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Delete sprint ${quoted(sprint.name)}?`,
      message: 'The sprint is deleted. Its tasks are kept and go back to the backlog.',
      confirmLabel: 'Delete sprint',
      danger: true
    });
    if (!confirmed) return;

    this.cardsInSprint(sprint).forEach(card => delete card.sprintId);
    this.sprints = this.sprints.filter(item => item.id !== sprint.id);
    this.saveSprints();
    this.boardService.recordActivity(this.boardId, 'Sprint deleted', `Deleted “${sprint.name}”.`);
    this.cardsChanged.emit();
  }

  /** Removes completed sprints from the history. The tasks themselves are kept. */
  async clearCompletedSprints(sprintToRemove?: Sprint): Promise<void> {
    const toRemove = sprintToRemove ? [sprintToRemove] : this.completedSprints;
    if (!toRemove.length) return;

    const confirmed = await this.confirm.ask({
      title: sprintToRemove
        ? `Remove sprint ${quoted(sprintToRemove.name)} from the history?`
        : `Remove all ${toRemove.length} completed sprint${toRemove.length === 1 ? '' : 's'}?`,
      message: 'Only the sprint history is removed. The tasks are kept on the board.',
      confirmLabel: sprintToRemove ? 'Remove sprint' : 'Remove all',
      danger: true
    });
    if (!confirmed) return;

    const removedIds = new Set(toRemove.map(sprint => sprint.id));

    // Use every card on the board (not just the filtered ones) so none keep a link to a removed sprint.
    this.columns
      .flatMap(column => column.cards)
      .filter(card => card.sprintId && removedIds.has(card.sprintId))
      .forEach(card => delete card.sprintId);

    this.sprints = this.sprints.filter(sprint => !removedIds.has(sprint.id));
    this.saveSprints();
    this.boardService.recordActivity(
      this.boardId,
      'Sprint history cleared',
      sprintToRemove ? `Removed “${sprintToRemove.name}” from the history.` : 'Removed all completed sprints from the history.'
    );
    if (!this.completedSprints.length) this.showCompleted = false;
    this.cardsChanged.emit();
  }

  // ----- Moving cards -----

  moveCard(card: Card, sprintId: string): void {
    if (sprintId) {
      card.sprintId = sprintId;
    } else {
      delete card.sprintId;
    }

    const target = this.sprints.find(sprint => sprint.id === sprintId)?.name || 'the backlog';
    this.boardService.recordActivity(this.boardId, 'Card moved', `Moved “${card.title}” to ${target}.`, card);
    this.cardsChanged.emit();
  }

  /** The value for the "Move to" dropdown: the card's open sprint, or '' for backlog. */
  sprintValue(card: Card): string {
    return this.openSprints.some(sprint => sprint.id === card.sprintId) ? card.sprintId! : '';
  }

  // ----- Helpers -----

  private updateSprint(sprintId: string, changes: Partial<Sprint>): void {
    this.sprints = this.sprints.map(sprint =>
      sprint.id === sprintId ? { ...sprint, ...changes } : sprint
    );
    this.saveSprints();
  }

  private saveSprints(): void {
    this.boardService.saveSprints(this.boardId, this.sprints);
    this.sprintsChanged.emit(this.sprints);
  }
}
