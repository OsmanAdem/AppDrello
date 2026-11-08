import { Component, ElementRef, EventEmitter, HostListener, Inject, Input, NgZone, OnDestroy, OnInit, Output, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { IconComponent } from './icon.component';

export interface FilterMenuOption {
  value: string;
  label: string;
  count: number;
}

/**
 * A filter button that opens a list of checkboxes, so several values can be picked at once.
 * Use: <app-filter-menu name="Priority" [options]="..." [(selected)]="priorityFilters" />
 */
@Component({
  selector: 'app-filter-menu',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <button
      type="button"
      class="filter-button"
      [class.is-active]="selected.length"
      [class.is-open]="open"
      (click)="open = !open"
      aria-haspopup="true"
      [attr.aria-expanded]="open">
      <span class="filter-name">{{ name }}</span>
      <span class="filter-value">{{ summary }}</span>
      <app-icon name="chevron-down" [size]="14" />
    </button>

    <div class="filter-popover" *ngIf="open" role="group" [attr.aria-label]="'Filter by ' + name">
      <label class="filter-option" *ngFor="let option of options; trackBy: trackByValue">
        <input type="checkbox" [checked]="isSelected(option.value)" (change)="toggle(option.value)">
        <span class="filter-option-label">{{ option.label }}</span>
        <span class="filter-option-count">{{ option.count }}</span>
      </label>
      <div class="filter-popover-footer" *ngIf="selected.length">
        <button type="button" (click)="clear()">Clear {{ name.toLowerCase() }}</button>
      </div>
    </div>
  `,
  styles: [`
    :host { position: relative; display: inline-flex; }
    .filter-button { display: inline-flex; align-items: center; gap: 6px; width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--text-muted); font: inherit; font-size: 12px; cursor: pointer; transition: border-color .15s ease, background-color .15s ease; }
    .filter-button:hover, .filter-button.is-open { border-color: var(--accent-border); }
    .filter-button:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
    .filter-button.is-active { border-color: var(--accent-border); background: var(--accent-soft); color: var(--accent-hover); }
    .filter-name { font-weight: 650; }
    .filter-value { overflow: hidden; max-width: 150px; color: var(--text-strong); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .filter-button.is-active .filter-value { color: var(--accent-hover); }
    .filter-button app-icon { margin-left: auto; color: var(--text-subtle); transition: transform .15s ease; }
    .filter-button.is-open app-icon { transform: rotate(180deg); }

    .filter-popover { position: absolute; top: calc(100% + 6px); left: 0; z-index: 60; display: flex; flex-direction: column; min-width: 210px; padding: 6px; border: 1px solid var(--line-soft); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-lg); animation: filter-in .12s ease-out; }
    .filter-option { display: flex; align-items: center; gap: 10px; padding: 8px 9px; border-radius: 7px; color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; }
    .filter-option:hover { background: var(--accent-soft); }
    .filter-option input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
    .filter-option-label { flex: 1; }
    .filter-option-count { min-width: 20px; padding: 1px 6px; border-radius: 6px; background: var(--line-soft); color: var(--text-muted); font-size: 11px; font-weight: 750; text-align: center; }
    .filter-popover-footer { margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--line-soft); }
    .filter-popover-footer button { width: 100%; padding: 7px; border: 0; border-radius: 7px; background: transparent; color: var(--text-muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
    .filter-popover-footer button:hover { background: var(--danger-soft); color: var(--danger-strong); }
    @keyframes filter-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .filter-popover, .filter-button app-icon { animation: none; transition: none; } }
  `]
})
export class FilterMenuComponent implements OnInit, OnDestroy {
  @Input({ required: true }) name!: string;
  @Input() options: FilterMenuOption[] = [];
  @Input() selected: string[] = [];
  @Output() selectedChange = new EventEmitter<string[]>();

  open = false;

  constructor(
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  /** "All", "High", or "High, Medium". */
  get summary(): string {
    if (!this.selected.length) return 'All';
    const labels = this.options.filter(option => this.selected.includes(option.value)).map(option => option.label);
    return labels.length > 2 ? `${labels.length} selected` : labels.join(', ');
  }

  /**
   * Keep the same checkbox elements when the options list is rebuilt (the counts change).
   * Without this, Angular replaces them mid-click, and the click is lost.
   */
  trackByValue(_index: number, option: FilterMenuOption): string {
    return option.value;
  }

  isSelected(value: string): boolean {
    return this.selected.includes(value);
  }

  toggle(value: string): void {
    const next = this.isSelected(value)
      ? this.selected.filter(item => item !== value)
      : this.options.map(option => option.value).filter(item => item === value || this.selected.includes(item));
    this.selectedChange.emit(next);
  }

  clear(): void {
    this.selectedChange.emit([]);
    this.open = false;
  }

  // Close on a press outside (captured first, because cards stop clicks from bubbling) or on Escape.
  private readonly closeOnOutsidePress = (event: Event): void => {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.zone.run(() => (this.open = false));
    }
  };

  @HostListener('document:keydown.escape')
  close(): void {
    this.open = false;
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) document.addEventListener('pointerdown', this.closeOnOutsidePress, true);
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) document.removeEventListener('pointerdown', this.closeOnOutsidePress, true);
  }
}
