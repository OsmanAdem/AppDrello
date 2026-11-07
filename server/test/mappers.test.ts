import './test-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toBoard, toCard } from '../src/mappers';

describe('mappers (database row → app object)', () => {
  it('turns a board row into camelCase, with role and owner name', () => {
    const created = new Date('2026-11-01T10:00:00Z');
    const board = toBoard({
      id: 'b1', name: 'Website', background_color: null,
      created_at: created, updated_at: created, role: 'member', owner_name: 'Osman'
    });

    assert.deepEqual(board, {
      id: 'b1', name: 'Website', backgroundColor: undefined,
      createdAt: created, updatedAt: created, role: 'member', ownerName: 'Osman'
    });
  });

  it('leaves out role and owner name when the query has none', () => {
    const board = toBoard({ id: 'b1', name: 'Website', created_at: null, updated_at: null });
    assert.equal(board.role, undefined);
    assert.equal(board.ownerName, undefined);
  });

  it('turns empty card fields (NULL) into undefined', () => {
    const card = toCard({
      id: 'c1', board_id: 'b1', column_id: 'col1', sprint_id: null, issue_key: 'DRL-001',
      title: 'Write tests', priority: 'High', label: '', description: null, assignee: null,
      start_date: null, due_date: '2026-11-20', checklist: [], custom_fields: {}
    });

    assert.equal(card.sprintId, undefined);
    assert.equal(card.description, undefined);
    assert.equal(card.dueDate, '2026-11-20');
    assert.equal(card.issueKey, 'DRL-001');
  });
});
