export type CardPriority = 'Low' | 'Medium' | 'High' | '';

export type CardLabel = 'Bug' | 'Feature' | 'Improvement' | 'Planning' | 'Completed' | '';

export type CustomFieldType = 'text' | 'number' | 'select' | 'checkbox' | 'date';

export type CustomFieldValue = string | number | boolean;

/** A field the board owner adds themselves, e.g. "Story points" or "Severity". */
export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[]; // only used by 'select' fields
}

/** A reusable starting point for new boards: which columns and fields they get. */
export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  columns: string[];
  fields: CustomFieldDefinition[];
  builtIn?: boolean; // built-in templates can't be deleted
}

/** What starts an automation. */
export type AutomationTrigger = 'card-created' | 'card-moved' | 'checklist-completed';

/** What an automation does to the card. */
export type AutomationAction = 'set-label' | 'set-priority' | 'set-assignee' | 'move-to-column' | 'set-due-in-days';

/** A rule: "When <trigger> happens, do <action>". */
export interface AutomationRule {
  id: string;
  boardId: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  triggerColumnId?: string; // empty = any column
  action: AutomationAction;
  actionValue: string;      // label, priority, name, column id or number of days
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Card {
  id: string;
  issueKey?: string;
  boardId: string;
  columnId: string;
  title: string;
  priority?: CardPriority;
  label?: CardLabel;
  description?: string;
  assignee?: string;
  startDate?: string;
  dueDate?: string;
  checklist?: ChecklistItem[];
  sprintId?: string;
  customFields?: Record<string, CustomFieldValue>; // field id → value
}

export interface Column {
  id: string;
  boardId: string;
  title: string;
  cards: Card[];
  isBacklog?: boolean;
}

export type SprintStatus = 'planned' | 'active' | 'completed';

export interface Sprint {
  id: string;
  boardId: string;
  name: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  status: SprintStatus;
  createdAt: string;
}

export interface Board {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  backgroundColor?: string;
}

export interface BoardActivity {
  id: string;
  boardId: string;
  action: string;
  description: string;
  cardId?: string;
  issueKey?: string;
  cardTitle?: string;
  createdAt: string;
}
