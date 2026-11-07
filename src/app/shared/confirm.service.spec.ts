import { ConfirmService, quoted } from './confirm.service';

describe('ConfirmService', () => {
  let dialogs: ConfirmService;

  beforeEach(() => {
    dialogs = new ConfirmService(); // no Angular needed: it's a plain class
  });

  it('ask() resolves true when confirmed and closes the dialog', async () => {
    const answer = dialogs.ask({ title: 'Delete?', message: 'Sure?', confirmLabel: 'Delete', danger: true });
    expect(dialogs.current?.kind).toBe('confirm');
    expect(dialogs.current?.danger).toBeTrue();

    dialogs.answer(true);

    expect(await answer).toBeTrue();
    expect(dialogs.current).toBeNull();
  });

  it('ask() resolves false when cancelled', async () => {
    const answer = dialogs.ask({ title: 'Delete?', message: '', confirmLabel: 'Delete' });
    dialogs.answer(false);
    expect(await answer).toBeFalse();
  });

  it('prompt() returns the trimmed text', async () => {
    const answer = dialogs.prompt({ title: 'Rename', label: 'Name', value: 'Old', confirmLabel: 'Rename' });
    dialogs.current!.value = '  New name  ';
    dialogs.answer(true);
    expect(await answer).toBe('New name');
  });

  it('prompt() stays open with an error when the text is empty', () => {
    dialogs.prompt({ title: 'Add', label: 'Name', confirmLabel: 'Add', emptyError: 'Give it a name.' });
    dialogs.current!.value = '   ';

    dialogs.answer(true);

    expect(dialogs.current).not.toBeNull();
    expect(dialogs.current!.error).toBe('Give it a name.');
  });

  it('prompt() returns null when cancelled', async () => {
    const answer = dialogs.prompt({ title: 'Add', label: 'Name', confirmLabel: 'Add' });
    dialogs.answer(false);
    expect(await answer).toBeNull();
  });

  it('a new dialog cancels the one that was open', async () => {
    const first = dialogs.ask({ title: 'First?', message: '', confirmLabel: 'OK' });
    dialogs.notify({ title: 'Second', message: '' });

    expect(await first).toBeFalse();
    expect(dialogs.current?.title).toBe('Second');
  });
});

describe('quoted', () => {
  it('puts a name in quotes', () => {
    expect(quoted('Website')).toBe('“Website”');
  });

  it('uses a fallback for empty names', () => {
    expect(quoted('   ', 'Untitled card')).toBe('“Untitled card”');
  });

  it('shortens very long names', () => {
    expect(quoted('x'.repeat(100)).length).toBeLessThan(64);
  });
});
