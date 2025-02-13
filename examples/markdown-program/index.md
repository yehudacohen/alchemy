# Alchemy Application

# Tools

We use `bun` (Bun JavaScript runtime) to install dependencies, run the application etc.

Vite for our React frontend, all implemented in TypeScript.

DrizzleKit ORM for SQL ORM.

Hono for the REST API TypeScript implementation.

# File Layout

```
package.json
tsconfig.json (configured for JSX)
tailwind.config.ts
src/
  db/
    schema.sql.ts (drizzle kit ORM schema)
  api/
    get-todos.ts
    create-todo.ts
    delete-todo.ts
  components/
    (shadcn components, e.g. button, input, card, etc.)
  main.tsx
  App.tsx
  index.html
```

# Requirements

We are building a simple TODO application.
It has a single webpage that lists all TODOs.
It has a text input to add a new TODO.
It has an 'X' button next to each TODO to delete it.
The application has no auth.
We use a sqlite in memory database, managed with Drizzle ORM.

# API

The API has 3 endpoints:

- [List TODOs](./src/api/get-todos.ts)

```json
// GET /todos
// status: 200 OK
[
  {
    "id": 1,
    "text": "Buy groceries"
  }
]
```

- [Add TODO](./src/api/create-todo.ts)

```json
// POST /todos
{
  "text": "Buy groceries"
}
// response
{
  "id": 1,
}
```

- [Delete TODO](./src/api/delete-todo.ts)

```json
// DELETE /todos/:id
{
  "id": 1
}
// status: 200 OK
```

# Dependencies

1. Bun
2. Vite
3. React
4. React-dom
5. Tailwind CSS
6. Shadcn UI
7. @tsconfig/node22

# TSConfig

We need jsx: "react". Keep it standard @tsconfig/node22 beyond that.
