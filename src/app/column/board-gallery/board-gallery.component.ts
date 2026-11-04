import {
  Component,
  OnInit,
  Inject,
  PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Board, BoardTemplate } from '../../card/card.model';
import { BoardService } from '../../board.service';
import { ConfirmService, quoted } from '../../shared/confirm.service';

@Component({
  selector: 'app-board-gallery',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="gallery-container">
      <header class="gallery-header">
        <div class="title-section">
          <p class="eyebrow">YOUR WORKSPACE</p>
          <h1>Boards</h1>
          <p>Bring projects, plans, and priorities together.</p>
        </div>
        <div class="header-actions">
          <span class="board-total">{{ boards.length }} {{ boards.length === 1 ? 'board' : 'boards' }}</span>
          <button type="button" class="create-board-btn" (click)="openModal()">
            <span class="plus-icon" aria-hidden="true">+</span> Create board
          </button>
        </div>
      </header>

      <section class="boards-grid" *ngIf="boards.length > 0" aria-label="Your boards">
        <article *ngFor="let board of boards" class="board-card">
          <button type="button" class="board-open" (click)="goToBoard(board.id)" [attr.aria-label]="'Open ' + board.name">
            <span class="preview-icon" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
            <span class="board-info">
              <span class="board-name">{{ board.name }}</span>
              <span class="board-meta">Created {{ board.createdAt | date:'mediumDate' }}</span>
            </span>
          </button>
          <div class="board-actions" aria-label="Board actions">
            <button type="button" class="action-btn" [attr.aria-label]="'Rename ' + board.name" title="Rename board" (click)="renameBoard(board, $event)">✎</button>
            <button type="button" class="action-btn delete-btn" [attr.aria-label]="'Delete ' + board.name" title="Delete board" (click)="deleteBoard(board.id, $event)">×</button>
          </div>
        </article>
      </section>

      <section class="empty-state" *ngIf="boards.length === 0">
        <div class="empty-illustration" aria-hidden="true"><span></span><span></span><span></span></div>
        <p class="eyebrow">A FRESH START</p>
        <h2>Your workspace is ready.</h2>
        <p>Create a board to bring your next project into focus.</p>
        <button type="button" class="create-board-btn" (click)="openModal()"><span class="plus-icon" aria-hidden="true">+</span> Create your first board</button>
      </section>

      <div class="modal-overlay" *ngIf="showModal" (click)="closeModal()" (keydown.escape)="closeModal()">
        <section class="modal-content" role="dialog" aria-modal="true" aria-labelledby="create-board-title" (click)="$event.stopPropagation()">
          <div class="modal-mark" aria-hidden="true">＋</div>
          <h2 id="create-board-title">Create a board</h2>
          <p>Give your workspace a name and pick a template to start from. You can change both later.</p>
          <div class="input-group">
            <label for="boardName">Board name</label>
            <input #boardNameInput id="boardName" type="text" [(ngModel)]="newBoardName" placeholder="e.g. Product launch" maxlength="80" (keyup.enter)="createBoard()" (keydown.escape)="closeModal()" autofocus>
          </div>
          <fieldset class="template-picker">
            <legend>Template</legend>
            <label class="template-option" *ngFor="let template of templates" [class.is-selected]="selectedTemplateId === template.id">
              <input type="radio" name="template" [value]="template.id" [(ngModel)]="selectedTemplateId">
              <span class="template-name">
                {{ template.name }}
                <button
                  type="button"
                  class="template-delete"
                  *ngIf="!template.builtIn"
                  (click)="deleteTemplate(template, $event)"
                  [attr.aria-label]="'Delete template ' + template.name">×</button>
              </span>
              <span class="template-description">{{ template.description }}</span>
              <span class="template-columns">{{ template.columns.join(' → ') }}</span>
              <span class="template-fields" *ngIf="template.fields.length">
                Fields: {{ fieldNames(template) }}
              </span>
            </label>
          </fieldset>
          <div class="modal-footer">
            <button type="button" class="cancel-btn" (click)="closeModal()">Cancel</button>
            <button type="button" class="confirm-btn" (click)="createBoard()" [disabled]="!newBoardName.trim()">Create board <span aria-hidden="true">→</span></button>
          </div>
        </section>
      </div>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100%; color: var(--text-strong); }
    .gallery-container { width: min(100% - 64px, 1240px); min-height: calc(100vh - 72px); margin: 0 auto; padding: 46px 0 72px; }
    .gallery-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 30px; }
    .eyebrow { margin: 0 0 9px; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .15em; }
    .title-section h1 { margin: 0; color: var(--text-strong); font-size: clamp(30px, 4vw, 38px); font-weight: 760; letter-spacing: -.055em; line-height: 1.12; }
    .title-section > p:last-child { margin: 9px 0 0; color: var(--text-muted); font-size: 14px; }
    .header-actions { display: flex; align-items: center; gap: 16px; }
    .board-total { color: var(--text-muted); font-size: 12px; font-weight: 650; }
    .create-board-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px; border: 1px solid var(--accent); border-radius: 11px; background: linear-gradient(135deg, var(--accent), var(--accent)); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 14px rgba(81,70,216,.18); transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
    .create-board-btn:hover { transform: translateY(-1px); box-shadow: 0 9px 20px rgba(81,70,216,.24); }
    .create-board-btn:focus-visible, .action-btn:focus-visible, .board-open:focus-visible, .cancel-btn:focus-visible, .confirm-btn:focus-visible { outline: 3px solid var(--accent-border); outline-offset: 3px; }
    .plus-icon { font-size: 19px; font-weight: 400; line-height: .8; }
    .boards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 310px), 1fr)); gap: 15px; }
    .board-card { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 13px; border: 1px solid var(--board-card-border); border-radius: 15px; background: var(--board-card-bg); box-shadow: var(--shadow-sm); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
    .board-card:hover { transform: translateY(-2px); border-color: var(--accent-border); box-shadow: var(--shadow-md); }
    .board-open { display: flex; align-items: center; gap: 13px; flex: 1; min-width: 0; padding: 4px; border: 0; background: transparent; text-align: left; cursor: pointer; }
    .preview-icon { display: grid; flex: 0 0 48px; grid-template-columns: repeat(2, 7px); grid-template-rows: repeat(2, 7px); place-content: center; gap: 3px; width: 48px; height: 48px; border: 0; border-radius: 12px; background: var(--board-card-icon-bg); }
    .preview-icon span { border-radius: 2px; background: var(--board-card-icon); }
    .preview-icon span:nth-child(2), .preview-icon span:nth-child(3) { opacity: .55; }
    .board-info { display: flex; flex: 1; flex-direction: column; gap: 5px; min-width: 0; }
    .board-name { overflow: hidden; color: var(--board-card-title); font-size: 14px; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
    .board-meta { color: var(--board-card-meta); font-size: 12px; }
    .board-actions { display: flex; gap: 4px; }
    .action-btn { display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 9px; background: transparent; color: var(--board-card-action); font-size: 16px; cursor: pointer; transition: color .15s ease, background .15s ease; }
    .action-btn:hover { background: var(--board-card-action-hover); color: var(--board-card-action); }
    .delete-btn:hover { background: var(--danger-soft); color: var(--danger-strong); }
    .empty-state { display: flex; align-items: center; flex-direction: column; margin-top: 32px; padding: 56px 24px; border: 1px dashed var(--accent-border); border-radius: 20px; background: linear-gradient(145deg,color-mix(in srgb, var(--surface) 90%, transparent),rgba(246,246,255,.75)); text-align: center; }
    .empty-illustration { display: flex; align-items: flex-start; gap: 5px; height: 78px; margin-bottom: 17px; padding: 12px; border: 1px solid var(--line-soft); border-radius: 17px; background: var(--surface-sunken); transform: rotate(-4deg); }
    .empty-illustration span { width: 19px; height: 45px; border: 1px solid var(--line-soft); border-radius: 5px; background: white; box-shadow: 0 2px 4px rgba(29,39,74,.05); }
    .empty-illustration span:nth-child(2) { height: 35px; }
    .empty-illustration span:nth-child(3) { height: 25px; }
    .empty-state h2 { margin: 2px 0 8px; color: var(--text-strong); font-size: 22px; letter-spacing: -.04em; }
    .empty-state > p:not(.eyebrow) { margin: 0 0 22px; color: var(--text-muted); font-size: 13px; }
    .modal-overlay { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 20px; background: rgba(20,27,49,.42); backdrop-filter: blur(5px); animation: fadeIn .16s ease; }
    .modal-content { width: min(100%, 620px); max-height: calc(100vh - 40px); overflow: auto; padding: 28px; border: 1px solid rgba(255,255,255,.8); border-radius: 20px; background: var(--surface); box-shadow: 0 28px 80px rgba(23,43,77,.24); animation: liftIn .2s ease-out; }
    .modal-mark { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 18px; border-radius: 13px; background: var(--accent-soft); color: var(--accent); font-size: 24px; }
    .modal-content h2 { margin: 0 0 7px; color: var(--text-strong); font-size: 22px; letter-spacing: -.04em; }
    .modal-content > p { margin: 0 0 24px; color: var(--text-muted); font-size: 13px; line-height: 1.55; }
    .input-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
    .input-group label { color: var(--text); font-size: 12px; font-weight: 700; }
    .input-group input { width: 100%; min-height: 46px; padding: 0 13px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text-strong); font-size: 13px; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
    .input-group input::placeholder { color: var(--text-subtle); }
    .input-group input:focus { border-color: var(--accent-border); box-shadow: 0 0 0 3px rgba(108,99,220,.12); }
    .modal-footer { display: flex; justify-content: flex-end; gap: 9px; }
    .template-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 24px; padding: 0; border: 0; }
    .template-picker legend { margin-bottom: 8px; padding: 0; color: var(--text); font-size: 12px; font-weight: 700; }
    .template-option { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 12px 13px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
    .template-option:hover { border-color: var(--accent-border); }
    .template-option.is-selected { border-color: var(--accent); background: var(--accent-softer); box-shadow: 0 0 0 3px rgba(108,99,220,.12); }
    .template-option input { position: absolute; opacity: 0; pointer-events: none; }
    .template-option:focus-within { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
    .template-name { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--text-strong); font-size: 13px; font-weight: 750; }
    .template-description { color: var(--text-muted); font-size: 12px; line-height: 1.45; }
    .template-columns, .template-fields { color: var(--accent); font-size: 11px; font-weight: 700; line-height: 1.45; }
    .template-fields { color: var(--text-muted); }
    .template-delete { width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: var(--text-subtle); font-size: 16px; line-height: 1; cursor: pointer; }
    .template-delete:hover { background: var(--danger-soft); color: var(--danger-strong); }
    .cancel-btn, .confirm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 41px; padding: 0 14px; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
    .cancel-btn { border: 1px solid var(--line); background: var(--surface); color: var(--text-muted); }
    .cancel-btn:hover { background: var(--surface-sunken); }
    .confirm-btn { border: 1px solid var(--accent); background: var(--accent); color: white; }
    .confirm-btn:hover:not(:disabled) { background: var(--accent-pressed); }
    .confirm-btn:disabled { opacity: .45; cursor: not-allowed; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes liftIn { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @media (max-width: 640px) {
      .template-picker { grid-template-columns: 1fr; }
      .gallery-container { width: calc(100% - 32px); padding: 30px 0 48px; }
      .gallery-header { align-items: flex-start; flex-direction: column; gap: 18px; margin-bottom: 22px; }
      .header-actions { width: 100%; justify-content: space-between; }
      .board-card { padding: 10px; }
      .empty-state { margin-top: 12px; padding: 42px 18px; }
      .modal-content { padding: 23px; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
  `]
})
export class BoardGalleryComponent implements OnInit {
  boards: Board[] = [];
  showModal = false;
  newBoardName = '';
  templates: BoardTemplate[] = [];
  selectedTemplateId = 'blank';

  private isBrowser: boolean;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private router: Router,
    private boardService: BoardService,
    private confirm: ConfirmService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.refreshBoards();
    // Show the copy in this browser right away, then the latest list from the server.
    this.boardService.syncBoards().then(() => this.refreshBoards());
  }

  private refreshBoards(): void {
    if (!this.isBrowser) {
      return;
    }

    this.boards = this.boardService.getBoards();
  }

  openModal(): void {
    this.newBoardName = '';
    this.templates = this.boardService.getTemplates();
    this.selectedTemplateId = 'blank';
    this.showModal = true;
  }

  fieldNames(template: BoardTemplate): string {
    return template.fields.map(field => field.name).join(', ');
  }

  async deleteTemplate(template: BoardTemplate, event: MouseEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = await this.confirm.ask({
      title: `Delete template ${quoted(template.name)}?`,
      message: "Boards you've already made from this template won't change. This can't be undone.",
      confirmLabel: 'Delete template',
      danger: true
    });
    if (!confirmed) return;

    this.boardService.deleteTemplate(template.id);
    this.templates = this.boardService.getTemplates();
    if (this.selectedTemplateId === template.id) this.selectedTemplateId = 'blank';
  }

  closeModal(): void {
    this.showModal = false;
    this.newBoardName = '';
  }

  createBoard(): void {
    if (!this.isBrowser) {
      return;
    }

    const name = this.newBoardName.trim();

    if (!name) {
      return;
    }

    try {
      this.boardService.createBoard(name, this.selectedTemplateId);
      this.closeModal();
      this.refreshBoards();
    } catch (error) {
      console.error('Could not create board:', error);
      window.alert('Could not create the board.');
    }
  }

  goToBoard(boardId: string): void {
    this.router.navigate(['/boards', boardId]);
  }

  renameBoard(board: Board, event: MouseEvent): void {
    event.stopPropagation();

    if (!this.isBrowser) {
      return;
    }

    const newName = window.prompt(
      'Enter the new board name:',
      board.name
    );

    if (newName === null) {
      return;
    }

    if (!newName.trim()) {
      window.alert('Board name cannot be empty.');
      return;
    }

    const success = this.boardService.renameBoard(
      board.id,
      newName.trim()
    );

    if (success) {
      this.refreshBoards();
    } else {
      window.alert('Could not rename the board.');
    }
  }

  async deleteBoard(boardId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();

    if (!this.isBrowser) {
      return;
    }

    const board = this.boards.find(item => item.id === boardId);

    if (!board) {
      return;
    }

    const confirmed = await this.confirm.ask({
      title: `Delete board ${quoted(board.name)}?`,
      message: 'This permanently deletes the board with all its columns, cards, sprints and history. This can\'t be undone.',
      confirmLabel: 'Delete board',
      danger: true
    });

    if (!confirmed) {
      return;
    }

    this.boardService.deleteBoard(boardId);
    this.refreshBoards();
  }

  async deleteAllBoards(): Promise<void> {
    if (!this.isBrowser || this.boards.length === 0) {
      return;
    }

    const count = this.boards.length;
    const confirmed = await this.confirm.ask({
      title: `Delete all ${count} board${count === 1 ? '' : 's'}?`,
      message: 'This permanently deletes every board with all its columns, cards, sprints and history. This can\'t be undone.',
      confirmLabel: 'Delete all boards',
      danger: true
    });

    if (!confirmed) {
      return;
    }

    this.boardService.deleteAllBoards();
    this.refreshBoards();
  }
}
