// The database uses snake_case (due_date), the Angular app uses camelCase (dueDate).
// These functions translate a database row into the shape the app expects.

export function toBoard(row: any) {
  return {
    id: row.id,
    name: row.name,
    backgroundColor: row.background_color ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toColumn(row: any) {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    isBacklog: row.is_backlog || undefined
  };
}

export function toCard(row: any) {
  return {
    id: row.id,
    boardId: row.board_id,
    columnId: row.column_id,
    sprintId: row.sprint_id ?? undefined,
    issueKey: row.issue_key,
    title: row.title,
    priority: row.priority,
    label: row.label,
    description: row.description ?? undefined,
    assignee: row.assignee ?? undefined,
    startDate: row.start_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    checklist: row.checklist,
    customFields: row.custom_fields
  };
}
