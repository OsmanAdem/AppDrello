import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BoardService } from './board.service';

describe('BoardService', () => {
  let service: BoardService;

  beforeEach(() => {
    localStorage.clear(); // every test starts with an empty "database"
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()], // no real requests in tests });
    service = TestBed.inject(BoardService);
  });

  afterEach(() => localStorage.clear());

  it('starts with no boards', () => {
    expect(service.getBoards()).toEqual([]);
  });

  it('creates a board with the three default columns', () => {
    const board = service.createBoard('  Launch  ');

    expect(board.name).toBe('Launch'); // whitespace is trimmed
    expect(service.getBoards().length).toBe(1);
    expect(service.loadColumns(board.id).map(column => column.title))
      .toEqual(['To Do', 'In Progress', 'Done']);
  });

  it('refuses an empty board name', () => {
    expect(() => service.createBoard('   ')).toThrowError('Board name cannot be empty.');
  });

  it('creates a board from a template, with its columns and fields', () => {
    const board = service.createBoard('Bugs', 'bugs');

    expect(service.loadColumns(board.id).map(column => column.title))
      .toEqual(['Reported', 'Triaged', 'Fixing', 'Testing', 'Done']);
    expect(service.getCustomFields(board.id).map(field => field.name))
      .toEqual(['Severity', 'Environment', 'Reproducible']);
  });

  it('copies template fields, so editing a board never changes the template', () => {
    const board = service.createBoard('Bugs', 'bugs');
    const fields = service.getCustomFields(board.id);
    fields[0].options!.push('Trivial');
    service.saveCustomFields(board.id, fields);

    const template = service.getTemplates().find(item => item.id === 'bugs')!;
    expect(template.fields[0].options).not.toContain('Trivial');
  });

  it('renames a board and ignores empty names', () => {
    const board = service.createBoard('Old');

    expect(service.renameBoard(board.id, 'New')).toBeTrue();
    expect(service.getBoards()[0].name).toBe('New');
    expect(service.renameBoard(board.id, '  ')).toBeFalse();
  });

  it('deletes a board together with everything stored for it', () => {
    const board = service.createBoard('Temporary');
    service.saveSprints(board.id, []);

    service.deleteBoard(board.id);

    expect(service.getBoards()).toEqual([]);
    const leftovers = Object.keys(localStorage).filter(key => key.includes(board.id));
    expect(leftovers).toEqual([]);
  });

  it('gives each new card the next issue key', () => {
    const board = service.createBoard('Keys');
    const columns = service.loadColumns(board.id);
    expect(service.nextIssueKey(board.id)).toBe('DRL-001');

    columns[0].cards.push({ id: 'a', issueKey: 'DRL-007', boardId: board.id, columnId: columns[0].id, title: 'A' });
    service.saveColumns(board.id, columns);

    expect(service.nextIssueKey(board.id)).toBe('DRL-008');
  });

  it('saves a board as a template without its cards', () => {
    const board = service.createBoard('Source', 'scrum');
    const template = service.saveBoardAsTemplate(board.id, 'My Scrum');

    expect(template.columns).toEqual(['To Do', 'In Progress', 'Review', 'Done']);
    expect(service.getTemplates().some(item => item.id === template.id)).toBeTrue();

    service.deleteTemplate(template.id);
    expect(service.getTemplates().some(item => item.id === template.id)).toBeFalse();
  });

  it('keeps at most 200 activity entries, newest first', () => {
    const board = service.createBoard('Busy');
    for (let i = 0; i < 205; i++) service.recordActivity(board.id, 'Test', `Event ${i}`);

    const activity = service.getActivity(board.id);
    expect(activity.length).toBe(200);
  });
});
