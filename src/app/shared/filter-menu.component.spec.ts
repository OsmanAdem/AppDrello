import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterMenuComponent } from './filter-menu.component';

describe('FilterMenuComponent', () => {
  let fixture: ComponentFixture<FilterMenuComponent>;
  let menu: FilterMenuComponent;
  let emitted: string[][];

  beforeEach(() => {
    fixture = TestBed.createComponent(FilterMenuComponent);
    menu = fixture.componentInstance;
    menu.name = 'Priority';
    menu.options = [
      { value: 'High', label: 'High', count: 2 },
      { value: 'Medium', label: 'Medium', count: 4 },
      { value: 'Low', label: 'Low', count: 1 }
    ];
    emitted = [];
    menu.selectedChange.subscribe(values => {
      emitted.push(values);
      menu.selected = values;
    });
    fixture.detectChanges();
  });

  it('says "All" when nothing is picked, and lists what is picked', () => {
    expect(menu.summary).toBe('All');
    menu.selected = ['Medium', 'High'];
    expect(menu.summary).toBe('High, Medium');
    menu.selected = ['High', 'Medium', 'Low'];
    expect(menu.summary).toBe('3 selected');
  });

  it('lets several values be checked, in the menu order', () => {
    menu.toggle('Low');
    menu.toggle('High');
    expect(menu.selected).toEqual(['High', 'Low']);
    menu.toggle('Low');
    expect(menu.selected).toEqual(['High']);
  });

  it('opens a list of checkboxes, and closes when pressing outside', () => {
    (fixture.nativeElement.querySelector('.filter-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('input[type=checkbox]').length).toBe(3);

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.filter-popover')).toBeNull();
  });
});
