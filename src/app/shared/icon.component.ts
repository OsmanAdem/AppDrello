import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Line icons drawn as SVG paths (shapes based on Lucide, ISC licence).
 * They take the text colour (currentColor), so they work in light and dark mode.
 * Use: <app-icon name="trash" />   or   <app-icon name="plus" [size]="18" />
 */
const ICONS = {
  'board': ["M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z", "M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z", "M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z", "M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z"],
  'calendar': ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z", "M16 2v4M8 2v4M3 10h18"],
  'timeline': ["M8 6h10M6 12h9M11 18h7"],
  'list': ["M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
  'clock': ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M12 6v6l4 2"],
  'share': ["M15 5a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M15 19a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"],
  'settings': ["M20 7h-9M14 17H5", "M14 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M4 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"],
  'chevron-down': ["m6 9 6 6 6-6"],
  'chevron-right': ["m9 18 6-6-6-6"],
  'chevron-left': ["m15 18-6-6 6-6"],
  'zap': ["M13 2 3 14h9l-1 8 10-12h-9l1-8z"],
  'fields': ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z", "M3 9h18M3 15h18M9 9v12"],
  'copy': ["M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
  'pencil': ["M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z", "m15 5 4 4"],
  'log-out': ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17L21 12L16 7", "M21 12H9"],
  'reset': ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  'trash': ["M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"],
  'flag': ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
  'search': ["M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0", "m21 21-4.3-4.3"],
  'x': ["M18 6 6 18M6 6l12 12"],
  'arrow-right': ["M5 12h14M12 5l7 7-7 7"],
  'plus': ["M5 12h14M12 5v14"],
  'sparkle': ["M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"],
  'trending-up': ["M22 7L13.5 15.5L8.5 10.5L2 17", "M16 7L22 7L22 13"],
  'target': ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", "M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  'sun': ["M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"],
  'moon': ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  'checklist': ["m9 11 3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  'check': ["M20 6 9 17l-5-5"],
  'expand': ["M15 3L21 3L21 9", "M9 21L3 21L3 15", "M21 3l-7 7M3 21l7-7"],
  'monitor': ["M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8 21h8M12 17v4"],
  'dot': ["M10.5 12a1.5 1.5 0 1 0 3.0 0a1.5 1.5 0 1 0 -3.0 0"],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'app-icon', 'aria-hidden': 'true' },
  template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      [attr.stroke-width]="strokeWidth" stroke-linecap="round" stroke-linejoin="round" focusable="false">
      @for (d of paths; track $index) { <path [attr.d]="d" /> }
    </svg>`,
  styles: [':host { display: inline-flex; flex: none; line-height: 0; vertical-align: -0.15em; }']
})
export class IconComponent {
  @Input({ required: true }) name!: IconName;
  @Input() size = 16;
  @Input() strokeWidth = 2;

  get paths(): string[] {
    return ICONS[this.name] ?? [];
  }
}
