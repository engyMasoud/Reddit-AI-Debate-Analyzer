# Reddit AI Debate Analyzer

A full-stack application with a React frontend and a Node.js/Express/TypeScript backend for analyzing debates on Reddit.

---

## Prerequisites

- **Node.js** (v18 or later) — [https://nodejs.org](https://nodejs.org)
- **npm** (bundled with Node.js)

---

## Running Backend Tests

### Frameworks & Libraries

The backend test suite uses the following (all installed automatically via `npm install`):

| Package | Purpose |
|---|---|
| **Jest** (v30) | Test runner and assertion library |
| **ts-jest** | Runs Jest on TypeScript files without a separate compile step |
| **TypeScript** (v5) | Language the backend is written in |
| **@types/jest** | TypeScript type definitions for Jest |
| **@stryker-mutator/core** | Mutation testing (optional, for `test:mutate` script) |

### Steps

1. **Navigate to the backend directory:**

   ```bash
   cd backend
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

   This installs all production and dev dependencies listed in `backend/package.json`, including Jest, ts-jest, TypeScript, and all type definitions.

3. **Run the tests:**

   ```bash
   npm test
   ```

   This executes `jest --verbose --coverage`, which:
   - Discovers all `*.test.ts` files under `backend/tests/`.
   - Uses the `ts-jest` preset to transpile TypeScript on the fly.
   - Prints verbose test results and generates a coverage report in `backend/coverage/`.

4. **(Optional) Run mutation tests:**

   ```bash
   npm run test:mutate
   ```

   This runs Stryker mutation testing via the `@stryker-mutator/jest-runner` plugin. The HTML report is generated in `backend/reports/mutation/`.

---

## Running Frontend Tests

### Frameworks & Libraries

The frontend test suite uses the following (all installed automatically via `npm install`):

| Package | Purpose |
|---|---|
| **Jest** (v29) | Test runner and assertion library |
| **jest-environment-jsdom** | Simulates a browser DOM for component tests |
| **@testing-library/react** | Utilities for rendering and querying React components |
| **@testing-library/jest-dom** | Custom Jest matchers for DOM assertions (e.g., `toBeInTheDocument()`) |
| **@testing-library/user-event** | Simulates realistic user interactions (clicks, typing, etc.) |
| **Babel** (`@babel/core`, `@babel/preset-env`, `@babel/preset-react`) | Transpiles JSX and modern JavaScript for Jest |
| **babel-jest** | Integrates Babel with Jest's transform pipeline |
| **identity-obj-proxy** | Mocks CSS module imports so they don't break tests |

### Steps

1. **Navigate to the frontend directory:**

   ```bash
   cd frontend
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

   This installs all production and dev dependencies listed in `frontend/package.json`, including Jest, React Testing Library, Babel, and all related packages.

3. **Run the tests:**

   ```bash
   npm test
   ```

   This executes `node --experimental-vm-modules node_modules/.bin/jest --coverage`, which:
   - Discovers all `*.test.jsx` files under `backend/tests/P5/` (the frontend jest config points its roots there).
   - Uses `jsdom` as the test environment to simulate a browser.
   - Uses Babel (via `babel-jest`) to transpile JSX and modern JS.
   - Prints test results and generates a coverage report in `frontend/coverage/`.

   > **Note:** The `--experimental-vm-modules` flag is required because the project uses `"type": "module"` in `package.json`. A custom resolver (`jest-resolver.cjs`) ensures Jest treats `.js`/`.jsx` files correctly.
