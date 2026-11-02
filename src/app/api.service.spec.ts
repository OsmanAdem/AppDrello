import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL, ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let http: HttpTestingController; // a fake backend: no real requests are sent

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify()); // fails the test if a request was not handled

  it('loads boards with GET /boards', () => {
    service.getBoards().subscribe(boards => expect(boards.length).toBe(1));

    const request = http.expectOne(`${API_URL}/boards`);
    expect(request.request.method).toBe('GET');
    request.flush([{ id: 'b1', name: 'Board', createdAt: new Date(), updatedAt: new Date() }]);
  });

  it('creates a board with POST /boards', () => {
    service.createBoard('New', ['A', 'B']).subscribe();

    const request = http.expectOne(`${API_URL}/boards`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'New', columns: ['A', 'B'] });
    request.flush({});
  });

  it('sends only the changed fields with PATCH /cards/:id', () => {
    service.updateCard('c1', { priority: 'High' }).subscribe();

    const request = http.expectOne(`${API_URL}/cards/c1`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ priority: 'High' });
    request.flush({});
  });

  it('moves a card with POST /cards/:id/move', () => {
    service.moveCard('c1', 'col2', 0).subscribe();

    const request = http.expectOne(`${API_URL}/cards/c1/move`);
    expect(request.request.body).toEqual({ columnId: 'col2', position: 0 });
    request.flush({});
  });
});
