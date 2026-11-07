import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { CardComponent } from './card.component';
import { IconComponent } from '../shared/icon.component';

describe('CardComponent', () => {
  let fixture: ComponentFixture<CardComponent>;
  let component: CardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CardComponent],
      imports: [FormsModule, IconComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    component.card = { id: 'c1', issueKey: 'DRL-001', boardId: 'b1', columnId: 'col', title: 'Card' };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows initials for the assignee', () => {
    component.card!.assignee = 'Osman Adem';
    expect(component.assigneeInitials).toBe('OA');
  });

  it('calculates checklist progress', () => {
    component.card!.checklist = [
      { id: '1', text: 'A', completed: true },
      { id: '2', text: 'B', completed: false }
    ];
    expect(component.completedChecklistCount).toBe(1);
    expect(component.checklistProgress).toBe(50);
  });

  it('stores custom field values and removes empty ones', () => {
    const field = { id: 'f1', name: 'Points', type: 'number' as const };

    component.setFieldValue(field, '5');
    expect(component.card!.customFields!['f1']).toBe(5);

    component.setFieldValue(field, '');
    expect('f1' in component.card!.customFields!).toBeFalse();
  });
});
