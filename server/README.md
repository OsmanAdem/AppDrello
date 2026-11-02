# AppDrello API

Express + PostgreSQL backend for AppDrello.

## Setup

1. Make sure PostgreSQL is running and create a database called `appdrello`
   (in pgAdmin: right-click *Databases* → *Create* → *Database…*).
2. Copy `.env.example` to `.env` and set your PostgreSQL user and password.
3. Install and create the tables:

   ```bash
   cd server
   npm install
   npm run db:setup
   npm run dev
   ```

4. Open http://localhost:3000/api/health — you should see `"database": "connected"`.

Try the endpoints with `requests.http` (VS Code "REST Client" extension).

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | /api/health | Server and database status |
| GET | /api/boards | All boards |
| POST | /api/boards | Create a board `{ name, columns? }` |
| GET | /api/boards/:id | One board |
| PATCH | /api/boards/:id | Rename `{ name }` |
| DELETE | /api/boards/:id | Delete a board and everything on it |
| GET | /api/boards/:id/columns | Columns with their cards |
| POST | /api/boards/:id/columns | Add a column `{ title }` |
| PATCH | /api/columns/:id | Rename `{ title }` |
| DELETE | /api/columns/:id | Delete a column and its cards |
| POST | /api/columns/:id/cards | Add a card `{ title }` |
| PATCH | /api/cards/:id | Update card fields |
| POST | /api/cards/:id/move | Move `{ columnId, position }` |
| DELETE | /api/cards/:id | Delete a card |
