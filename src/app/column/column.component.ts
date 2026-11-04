import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem
} from '@angular/cdk/drag-drop';
import { Card, Column, CustomFieldDefinition } from '../card/card.model';
import { BoardService } from '../board.service';
import { ConfirmService, quoted } from '../shared/confirm.service';
import { toDateKey } from '../shared/date-utils';

@Component({
  selector: 'app-column',
  templateUrl: './column.component.html',
  styleUrls: ['./column.component.scss']
})
export class ColumnComponent {
  constructor(
    private boardService: BoardService,
    private confirm: ConfirmService
  ) {}
  @Input() column!: Column;
  @Input() dropListId = '';
  @Input() connectedDropLists: string[] = [];
  @Input() filteredCards: Card[] = [];
  @Input() filtersActive = false;
  @Input() customFields: CustomFieldDefinition[] = [];

  newCardTitle = ''; // State for the inline input
  isEditingTitle = false; // State for renaming column
  editTitle = '';

  @Output() cardsChanged = new EventEmitter<void>();
  @Output() deleteRequested = new EventEmitter<void>();
  @Output() renameRequested = new EventEmitter<{ columnId: string; newTitle: string }>();

  addCard(): void {
    const title = this.newCardTitle.trim();

    if (title === '') return;

    this.column.cards.push({
      id: this.createCardId(),
      issueKey: this.boardService.nextIssueKey(this.column.boardId),
      boardId: this.column.boardId,
      columnId: this.column.id,
      title: title,
      priority: '',
      label: ''
    });

    this.newCardTitle = ''; // Reset input after adding
    this.cardsChanged.emit();
  }

  startRename(): void {
    this.isEditingTitle = true;
    this.editTitle = this.column.title;
  }

  saveRename(): void {
    if (this.editTitle.trim() && this.editTitle.trim() !== this.column.title) {
      this.renameRequested.emit({
        columnId: this.column.id,
        newTitle: this.editTitle.trim()
      });
    }
    this.isEditingTitle = false;
  }

  cancelRename(): void {
    this.isEditingTitle = false;
  }

  private createCardId(): string {
    let id: string;

    do {
      id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    } while (this.column.cards.some(card => card.id === id));

    return id;
  }

  deleteColumn(): void {
    this.deleteRequested.emit();
  }

  isOverdue(card: Card): boolean {
    if (
      !card.dueDate ||
      card.label === 'Completed' ||
      ['done', 'completed'].includes(this.column.title.trim().toLowerCase())
    ) {
      return false;
    }

    return card.dueDate < toDateKey(new Date());
  }

  async removeCard(cardId: string): Promise<void> {
    const card = this.column.cards.find(item => item.id === cardId);
    if (!card) return;

    const label = card.issueKey ? `${card.issueKey} ${quoted(card.title, 'Untitled card')}` : quoted(card.title, 'Untitled card');
    const confirmed = await this.confirm.ask({
      title: `Delete card ${label}?`,
      message: 'The card and its description, checklist and fields will be deleted. This can\'t be undone.',
      confirmLabel: 'Delete card',
      danger: true
    });
    if (!confirmed) return;

    this.column.cards = this.column.cards.filter(
      card => card.id !== cardId
    );

    this.cardsChanged.emit();
  }

  drop(event: CdkDragDrop<Card[]>): void {
    if (this.filtersActive) return;

    if (event.previousContainer === event.container) {
      moveItemInArray(
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
      const movedCard = event.container.data[event.currentIndex];
      if (movedCard) movedCard.columnId = this.column.id;
    }

    this.cardsChanged.emit();
  }
}
