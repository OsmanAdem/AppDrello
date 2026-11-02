import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BoardComponent } from './board.component';
import { BoardService } from '../board.service';

describe('BoardComponent', () => {
  let fixture: ComponentFixture<BoardComponent>;
  let component: BoardComponent;
  let service: BoardService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      declarations: [BoardComponent],
      imports: [FormsModule, RouterModule.forRoot([])],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(BoardComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(BoardService);

    // Set up a real board without going through the router.
    const board = service.createBoard('Test board');
    component.boardId = board.id;
    component.columns = service.loadColumns(board.id);
    component.saveColumns(false); // remember this as the "before" state
  });

  afterEach(() => localStorage.clear());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renames the right column even when two have the same title', () => {
    component.columns[2].title = 'To Do'; // now columns 0 and 2 are both "To Do"

    component.renameColumn({ columnId: component.columns[2].id, newTitle: 'Backlog' });

    expect(component.columns[0].title).toBe('To Do');
    expect(component.columns[2].title).toBe('Backlog');
  });

  it('filters cards by search text and priority', () => {
    const [todo] = component.columns;
    todo.cards.push(
      { id: '1', boardId: component.boardId, columnId: todo.id, title: 'Fix login', priority: 'High' },
      { id: '2', boardId: component.boardId, columnId: todo.id, title: 'Write docs', priority: 'Low' }
    );

    component.taskSearch = 'login';
    expect(component.getFilteredCards(todo).map(card => card.id)).toEqual(['1']);

    component.taskSearch = '';
    component.setTaskView('priority-low');
    expect(component.getFilteredCards(todo).map(card => card.id)).toEqual(['2']);
  });

  it('runs an automation when a card is moved into a column', () => {
    const [todo, , done] = component.columns;
    todo.cards.push({ id: 'c1', boardId: component.boardId, columnId: todo.id, title: 'Ship it' });
    component.saveColumns(false);

    component.automations = [{
      id: 'r1', boardId: component.boardId, enabled: true,
      trigger: 'card-moved', triggerColumnId: done.id,
      action: 'set-label', actionValue: 'Completed', createdAt: ''
    }];

    // Simulate a drag and drop to Done
    const card = todo.cards.pop()!;
    card.columnId = done.id;
    done.cards.push(card);
    component.saveColumns();

    expect(done.cards[0].label).toBe('Completed');
  });

  it('ignores automations that are turned off', () => {
    const [todo] = component.columns;
    component.automations = [{
      id: 'r1', boardId: component.boardId, enabled: false,
      trigger: 'card-created', action: 'set-priority', actionValue: 'High', createdAt: ''
    }];

    todo.cards.push({ id: 'c2', boardId: component.boardId, columnId: todo.id, title: 'New' });
    component.saveColumns();

    expect(todo.cards[0].priority).toBeUndefined();
  });
});
