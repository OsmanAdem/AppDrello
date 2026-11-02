import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Board, Card, Column } from './card/card.model';

/** The address of the backend in server/. Change this when the API is deployed. */
export const API_URL = 'http://localhost:3000/api';

/** The card fields the API lets you change with PATCH /cards/:id. */
export type CardUpdate = Partial<Pick<Card,
  'title' | 'priority' | 'label' | 'description' | 'assignee' |
  'startDate' | 'dueDate' | 'sprintId' | 'checklist' | 'customFields'
>>;

/**
 * Talks to the AppDrello API (server/). Every method matches one endpoint
 * and returns an Observable: nothing is sent until someone subscribes.
 *
 * Not used by the components yet. The next step of point 4 is to switch
 * BoardService from localStorage to these calls.
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
}
