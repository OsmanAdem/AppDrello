// The database uses snake_case (due_date), the Angular app uses camelCase (dueDate).
// These functions translate a database row into the shape the app expects.

export function toBoard(row: any) {
  return {
    id: row.id,
    name: row.name,
    backgroundColor: row.background_color ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    role: row.role ?? undefined,
    ownerName: row.owner_name ?? undefined
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

export function toSprint(row: any) {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    goal: row.goal ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    status: row.status,
    createdAt: row.created_at
  };
}

export function toField(row: any) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    options: row.options ?? undefined
  };
}

export function toAutomation(row: any) {
  return {
    id: row.id,
    boardId: row.board_id,
    enabled: row.enabled,
    trigger: row.trigger_type,
    triggerColumnId: row.trigger_column_id ?? undefined,
    action: row.action_type,
    actionValue: row.action_value,
    createdAt: row.created_at
  };
}

export function toActivity(row: any) {
  return {
    id: row.id,
    boardId: row.board_id,
    action: row.action,
    description: row.description,
    cardId: row.card_id ?? undefined,
    issueKey: row.issue_key ?? undefined,
    cardTitle: row.card_title ?? undefined,
    createdAt: row.created_at
  };
}

export function toTemplate(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    columns: row.columns,
    fields: row.fields
  };
}
