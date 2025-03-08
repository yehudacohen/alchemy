Alchemy is a markdown-based development framework.

A markdown document can be thought of as a module file in a programming language.

It consists of expressions that:

1. describe system requirements
2. enumerate and describe `1..*` files that should be created
3. refer to `0..*` files that should be referenced to inform the creation of files

Design documents are succinct and concise.
We purposely avoid over documentation and over explanation.

It should be thought more of a sequence of statements in a programming language.

Example:

```md
# Backend Server

The backend server is a Hono app that exposes a REST API.

## API Reference

- [GetUser](src/get-user.ts) - gets a user by UserID (ULID)
- [CreateUser](src/create-user.ts)
  - inserts a User (Email, FirstName, LastName)
  - generates a UserID
  - Email must be Unique

## Database Schema

Refer to the [Database Schema](src/schema.sql.ts)
```

Notice how the example document is very matter of a fact.
Line, line, line.
Simple, logical components capturing all the important details and nothing more.
