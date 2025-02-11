# Alchemy Application

This is an ViteJS application.

# Tools

We use `bun` (Bun JavaScript runtime) to install dependencies, run the application etc.

# Frontend

We will use React, Tan Stack Router, Shadcn UI, Tailwind CSS, and TypeScript.

Detailed design for the frontend can be found in [frontend.md](./designs/frontend.md):

1. Home Page
2. Login Page
3. Register Page
4. Forgot Password Page
5. Reset Password Page
6. Verify Email Page

# Backend

We will use Hono, and TypeScript.

Detailed design for the backend can be found in [backend.md](./designs/backend.md):

1. API Endpoints
2. Database Schema
3. Authentication
4. Authorization

This design contains:

1. input/output contract for each API endpoint.
2. database schema.
3. authentication and authorization logic.

Each API endpoint will be placed in its own file.

Our design is not ambiguous. We leave no "optional" parts.

# Dependencies

1. Bun
2. Vite
3. React
4. React-dom
5. Tan Stack Router
6. Tailwind CSS
7. Shadcn UI
8. @tsconfig/node22
