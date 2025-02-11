# Frontend Design

This document details the file structure and component responsibilities for the frontend of the Alchemy application. Built with ViteJS and Bun, the app leverages React, Tan Stack Router, Shadcn UI, Tailwind CSS, and TypeScript to deliver a clean, modular, and maintainable codebase.

## Architectural Principles

• Separation of concerns: Each component or page is defined in its own file.  
• Modularity: Reusable UI components are isolated in dedicated files.  
• Consistency: All pages follow a uniform layout and routing strategy using Tan Stack Router.

## File Structure Overview

The frontend source code is organized as follows:

### Bootstrap and Routing

- [src/main.tsx](./src/main.tsx)  
  • Bootstraps the React application and ties in ViteJS configurations.  
  • Integrates Bun runtime specifics if needed.

- [src/App.tsx](./src/App.tsx)  
  • Main application component that wraps routes and overall app context.  
  • Imports a common layout component to provide global UI structure.

- [src/routes.tsx](./src/routes.tsx)  
  • Configures client-side routing using Tan Stack Router.  
  • Maps URL paths to the appropriate page components.

### Global Layout and Reusable Components

- [src/components/Layout.tsx](./src/components/Layout.tsx)  
  • Provides the main layout structure (common header, footer, and container).  
  • Wraps every page to ensure consistent styling.

- [src/components/Navbar.tsx](./src/components/Navbar.tsx)  
  • Contains site navigation elements (e.g., links to Home, Login, Register).  
  • Is used inside the layout to keep navigation consistent.

- [src/components/Footer.tsx](./src/components/Footer.tsx)  
  • Renders site footer information and links.  
  • Included in the global layout.

### Page Components

Each major page is implemented as an individual component in the `/src/pages` directory:

- [src/pages/Home.tsx](./src/pages/Home.tsx)  
  • Home Page: Serves as the landing page with an overview and introduction to the application.

- [src/pages/Login.tsx](./src/pages/Login.tsx)  
  • Login Page: Presents a form for users to submit their credentials and sign in.

- [src/pages/Register.tsx](./src/pages/Register.tsx)  
  • Register Page: Contains a user registration form capturing essential details like name, email, and password.

- [src/pages/ForgotPassword.tsx](./src/pages/ForgotPassword.tsx)  
  • Forgot Password Page: Enables users to enter their email to receive a password reset link.

- [src/pages/ResetPassword.tsx](./src/pages/ResetPassword.tsx)  
  • Reset Password Page: Provides a secure form for users to set a new password via a reset token.

- [src/pages/VerifyEmail.tsx](./src/pages/VerifyEmail.tsx)  
  • Verify Email Page: Processes email verification using a token provided in the URL.

## Styling and UI Components

- Tailwind CSS is used to enforce a utility-first approach to styling. Global configurations are maintained in the Tailwind configuration file.  
- Shadcn UI components are integrated for standard UI elements like buttons, cards, and input fields, ensuring design consistency across the application.

## Navigation and State Management

- **Routing:** Tan Stack Router is set up in [src/routes.tsx](./src/routes.tsx) for mapping URLs to pages. The routing mechanism integrates with [Layout.tsx](./src/components/Layout.tsx) to provide a common header/footer across all pages.  
- **State Management:** React hooks and context manage local state (e.g., for authentication status). External libraries like React Query can be integrated if data fetching needs become complex.

## Summary

This design document provides a clear separation of concerns by dedicating individual files for bootstrapping, routing, layout, and each page component. The file structure, with links to each component as shown above, ensures adherence to best practices, making the frontend modular, maintainable, and scalable.