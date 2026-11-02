export type CardPriority = 'Low' | 'Medium' | 'High' | '';

export type CardLabel = 'Bug' | 'Feature' | 'Improvement' | 'Planning' | 'Completed' | '';

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
  dueDate?: string;
  checklist?: ChecklistItem[];
  sprintId?: string;
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
