import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AutomationRule,
  Board,
  BoardActivity,
  BoardInvitation,
  BoardMember,
  BoardTemplate,
  Card,
  Column,
  CustomFieldDefinition,
  Sprint
} from './card/card.model';

import { environment } from '../environments/environment';

/**
 * The address of the server (server/). It comes from the environment files:
 * localhost while developing, the deployed server's address in the live app.
 */
export const API_URL = environment.apiUrl;

/** The card fields the API lets you change with PATCH /cards/:id. */
export type CardUpdate = Partial<Pick<Card,
  'title' | 'priority' | 'label' | 'description' | 'assignee' |
  'startDate' | 'dueDate' | 'sprintId' | 'checklist' | 'customFields'
>>;

/** Everything the app needs to show one board, as GET /boards/:id/state returns it. */
export interface BoardState {
  board: Board;
  columns: Column[];
  sprints: Sprint[];
  fields: CustomFieldDefinition[];
  automations: AutomationRule[];
  activity: BoardActivity[];
}

/**
 * Talks to the AppDrello API (server/). Every method matches one endpoint
 * and returns an Observable: nothing is sent until someone subscribes.
 * BoardService uses the "sync" methods to keep the database up to date.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // ----- Boards -----

  getBoards(): Observable<Board[]> {
    return this.http.get<Board[]>(`${API_URL}/boards`);
  }

  getBoard(boardId: string): Observable<Board> {
    return this.http.get<Board>(`${API_URL}/boards/${boardId}`);
  }

  createBoard(name: string, columns?: string[]): Observable<Board> {
    return this.http.post<Board>(`${API_URL}/boards`, { name, columns });
  }

  renameBoard(boardId: string, name: string): Observable<Board> {
    return this.http.patch<Board>(`${API_URL}/boards/${boardId}`, { name });
  }

  deleteBoard(boardId: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/boards/${boardId}`);
  }

  // ----- Columns -----

  /** The board's columns, each with its cards in order. */
  getColumns(boardId: string): Observable<Column[]> {
    return this.http.get<Column[]>(`${API_URL}/boards/${boardId}/columns`);
  }

  addColumn(boardId: string, title: string): Observable<Column> {
    return this.http.post<Column>(`${API_URL}/boards/${boardId}/columns`, { title });
  }

  renameColumn(columnId: string, title: string): Observable<Column> {
    return this.http.patch<Column>(`${API_URL}/columns/${columnId}`, { title });
  }

  deleteColumn(columnId: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/columns/${columnId}`);
  }

  // ----- Cards -----

  addCard(columnId: string, title: string): Observable<Card> {
    return this.http.post<Card>(`${API_URL}/columns/${columnId}/cards`, { title });
  }

  updateCard(cardId: string, changes: CardUpdate): Observable<Card> {
    return this.http.patch<Card>(`${API_URL}/cards/${cardId}`, changes);
  }

  /** Drag and drop: put the card in `columnId` at `position` (0 = top). */
  moveCard(cardId: string, columnId: string, position: number): Observable<Card> {
    return this.http.post<Card>(`${API_URL}/cards/${cardId}/move`, { columnId, position });
  }

  deleteCard(cardId: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/cards/${cardId}`);
  }

  // ----- Sync: save or load a whole board at once (used by BoardService) -----

  /** Creates the board with this id, or updates its name if it already exists. */
  saveBoard(board: Board): Observable<Board> {
    return this.http.put<Board>(`${API_URL}/boards/${board.id}`, {
      name: board.name,
      backgroundColor: board.backgroundColor,
      createdAt: board.createdAt
    });
  }

  getBoardState(boardId: string): Observable<BoardState> {
    return this.http.get<BoardState>(`${API_URL}/boards/${boardId}/state`);
  }

  /** Saves columns and cards. Only the ids in `removed` are deleted on the server. */
  saveColumns(
    boardId: string,
    columns: Column[],
    removed: { columnIds: string[]; cardIds: string[] } = { columnIds: [], cardIds: [] }
  ): Observable<void> {
    return this.http.put<void>(`${API_URL}/boards/${boardId}/columns`, {
      columns,
      removedColumnIds: removed.columnIds,
      removedCardIds: removed.cardIds
    });
  }

  // For sprints, fields and automations, only the ids in `removedIds` are deleted on the server.

  saveSprints(boardId: string, sprints: Sprint[], removedIds: string[] = []): Observable<void> {
    return this.http.put<void>(`${API_URL}/boards/${boardId}/sprints`, { sprints, removedIds });
  }

  saveCustomFields(boardId: string, fields: CustomFieldDefinition[], removedIds: string[] = []): Observable<void> {
    return this.http.put<void>(`${API_URL}/boards/${boardId}/fields`, { fields, removedIds });
  }

  saveAutomations(boardId: string, automations: AutomationRule[], removedIds: string[] = []): Observable<void> {
    return this.http.put<void>(`${API_URL}/boards/${boardId}/automations`, { automations, removedIds });
  }

  clearActivity(boardId: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/boards/${boardId}/activity`);
  }

  addActivity(boardId: string, events: BoardActivity[]): Observable<void> {
    return this.http.post<void>(`${API_URL}/boards/${boardId}/activity`, { events });
  }

  // ----- Sharing a board -----

  getMembers(boardId: string): Observable<BoardMember[]> {
    return this.http.get<BoardMember[]>(`${API_URL}/boards/${boardId}/members`);
  }

  /** Shares the board with the person who has this email (owner only). Returns the new member list. */
  addMember(boardId: string, email: string): Observable<BoardMember[]> {
    return this.http.post<BoardMember[]>(`${API_URL}/boards/${boardId}/members`, { email });
  }

  /** Invitations to other people's boards that the user hasn't answered yet. */
  getInvitations(): Observable<BoardInvitation[]> {
    return this.http.get<BoardInvitation[]>(`${API_URL}/invitations`);
  }

  /** Accepts an invitation. Returns the board, which now shows under "Shared with you". */
  acceptInvitation(boardId: string): Observable<Board> {
    return this.http.post<Board>(`${API_URL}/invitations/${boardId}/accept`, {});
  }

  declineInvitation(boardId: string): Observable<void> {
    return this.http.post<void>(`${API_URL}/invitations/${boardId}/decline`, {});
  }

  /** Removes someone from the board, or leaves it when userId is your own id. */
  removeMember(boardId: string, userId: string): Observable<BoardMember[]> {
    return this.http.delete<BoardMember[]>(`${API_URL}/boards/${boardId}/members/${userId}`);
  }

  // ----- Templates the user saved -----

  getTemplates(): Observable<BoardTemplate[]> {
    return this.http.get<BoardTemplate[]>(`${API_URL}/templates`);
  }

  saveTemplate(template: BoardTemplate): Observable<BoardTemplate> {
    return this.http.put<BoardTemplate>(`${API_URL}/templates/${template.id}`, template);
  }

  deleteTemplate(templateId: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/templates/${templateId}`);
  }
}
