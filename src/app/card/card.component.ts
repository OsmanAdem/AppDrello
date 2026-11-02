import {
  Component,
  EventEmitter,
  Input,
  Output,
  AfterViewInit,
  AfterViewChecked,
  ElementRef,
  ViewChild
} from '@angular/core';

import {
  Card,
  ChecklistItem,
  CustomFieldDefinition,
  CustomFieldValue
} from './card.model';

@Component({
  selector: 'app-card',
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss']
})
export class CardComponent implements AfterViewInit, AfterViewChecked {
  @Input() card?: Card;
  @Input() isOverdue = false;
  @Input() customFields: CustomFieldDefinition[] = [];

  @Output() deleteRequested = new EventEmitter<void>();
  @Output() cardChanged = new EventEmitter<void>();

  @ViewChild('cardTextarea')
  cardTextarea?: ElementRef<HTMLTextAreaElement>;

  isDetailsOpen = false;
  newChecklistItem = '';

  get completedChecklistCount(): number {
    return this.card?.checklist?.filter(item => item.completed).length || 0;
  }

  get checklistProgress(): number {
    const items = this.card?.checklist || [];
    return items.length ? Math.round((this.completedChecklistCount / items.length) * 100) : 0;
  }

  get issueKey(): string {
    if (this.card?.issueKey) return this.card.issueKey;
    const suffix = (this.card?.id || '')
      .replace(/[^a-z0-9]/gi, '')
      .slice(-5)
      .toUpperCase();

    return `DRL-${suffix || '001'}`;
  }

  get assigneeInitials(): string {
    const name = this.card?.assignee?.trim();

    if (!name) return '';

    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }

  ngAfterViewInit(): void {
    this.resizeCard();
  }

  ngAfterViewChecked(): void {
    this.resizeCard();
  }

  onTitleChange(): void {
    this.cardChanged.emit();
  }

  deleteCard(): void {
    this.deleteRequested.emit();
  }

  openDetails(): void {
    this.isDetailsOpen = true;
  }

  closeDetails(): void {
    this.isDetailsOpen = false;
    this.cardChanged.emit();
  }

  addChecklistItem(): void {
    const text = this.newChecklistItem.trim();
    if (!text || !this.card) return;

    this.card.checklist ||= [];
    this.card.checklist.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      completed: false
    });
    this.newChecklistItem = '';
    this.onTitleChange();
  }

  fieldValue(field: CustomFieldDefinition): CustomFieldValue | undefined {
    return this.card?.customFields?.[field.id];
  }

  /** Saves a custom field value. Empty values are removed so the card stays tidy. */
  setFieldValue(field: CustomFieldDefinition, value: CustomFieldValue | null): void {
    if (!this.card) return;

    this.card.customFields ||= {};

    if (value === null || value === '' || value === false) {
      delete this.card.customFields[field.id];
    } else {
      this.card.customFields[field.id] = field.type === 'number' ? Number(value) : value;
    }

    this.onTitleChange();
  }

  removeChecklistItem(item: ChecklistItem): void {
    if (!this.card?.checklist) return;
    this.card.checklist = this.card.checklist.filter(entry => entry.id !== item.id);
    this.onTitleChange();
  }

  resizeTitle(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  resizeCard(): void {
    const textarea = this.cardTextarea?.nativeElement;

    if (textarea) {
      this.resizeTitle(textarea);
    }
  }
}



