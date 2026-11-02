import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ColumnComponent } from './column.component';

describe('ColumnComponent', () => {
  let fixture: ComponentFixture<ColumnComponent>;
  let component: ColumnComponent;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      declarations: [ColumnComponent],
      imports: [FormsModule, DragDropModule],
      schemas: [NO_ERRORS_SCHEMA] // ignore <app-card>; only the column is tested here
    }).compileComponents();

    fixture = TestBed.createComponent(ColumnComponent);
    component = fixture.componentInstance;
    component.column = { id: 'col-2', boardId: 'b1', title: 'To Do', cards: [] };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('adds a card with a trimmed title and tells the board', () => {
    spyOn(component.cardsChanged, 'emit');
    component.newCardTitle = '  Write tests  ';

    component.addCard();

    expect(component.column.cards.length).toBe(1);
    expect(component.column.cards[0].title).toBe('Write tests');
    expect(component.column.cards[0].columnId).toBe('col-2');
    expect(component.newCardTitle).toBe('');
    expect(component.cardsChanged.emit).toHaveBeenCalled();
  });

  it('does not add a card without a title', () => {
    component.newCardTitle = '   ';
    component.addCard();
    expect(component.column.cards.length).toBe(0);
  });

  // Guards the bug we fixed: renaming must identify the column by id, not by title.
  it('sends the column id when renaming', () => {
    spyOn(component.renameRequested, 'emit');
    component.startRename();
    component.editTitle = 'Backlog';

    component.saveRename();

    expect(component.renameRequested.emit).toHaveBeenCalledWith({ columnId: 'col-2', newTitle: 'Backlog' });
  });

  it('marks a past due date as overdue, but not in Done', () => {
    const card = { id: 'c', boardId: 'b1', columnId: 'col-2', title: 'Old', dueDate: '2000-01-01' };
    expect(component.isOverdue(card)).toBeTrue();

    component.column.title = 'Done';
    expect(component.isOverdue(card)).toBeFalse();
  });
});
