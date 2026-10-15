# Contributing to Server Survival

First off, thanks for taking the time to contribute! 🎉

The following is a set of guidelines for contributing to Server Survival. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/your-username/server-survival.git
    cd server-survival
    ```
3.  **Create a branch** for your feature or bugfix:
    ```bash
    git checkout -b feature/amazing-feature
    ```

## Development Workflow

This project uses vanilla JavaScript, HTML, and CSS with Three.js. No build step is currently required for the core game, but we use a modular structure in `src/`.

1.  Open `index.html` in your browser to run the game.
2.  Make changes in the `src/` directory or `game.js`.
3.  Reload the browser to see your changes.

### Tests

A small set of Node-only regression tests live at the repo root (e.g. `test_i18n_locale_validation.js`). They exercise logic that does not require a browser environment — stubs for `window`, `document`, and `localStorage` are provided inline. Run them with:

```bash
node test_i18n_locale_validation.js
```

CI runs the same command on every push and PR (see `.github/workflows/tests.yml`). Add a new `test_*.js` next to any new piece of logic that is testable in isolation, and wire it into the workflow.

### Project Structure

*   `index.html`: Main entry point and UI structure.
*   `game.js`: Main game loop and logic (currently under refactoring).
*   `src/`: Modularized code.
    *   `entities/`: Game entities like `Service` and `Request`.
    *   `services/`: Systems like `SoundService`.
    *   `locales/`: Translation files (one per supported locale, registered as globals in `src/i18n.js`).
    *   `config.js`: Game configuration constants.
    *   `state.js`: Global game state.

### Adding a new locale

Adding a translation requires three coordinated changes. The locale allowlist in `src/i18n.js` enforces this — out-of-sync state silently falls back to `'en'`, by design.

1.  Create `src/locales/<code>.js` exposing a global `XX_TRANSLATIONS` object.
2.  Add `<script src="src/locales/<code>.js"></script>` to `index.html` and a matching `<option value="<code>">` in the `#lang-select` element.
3.  Register the global in the `translations` map **and** add `<code>` to `SUPPORTED_LOCALES` in `src/i18n.js`.

## Code Style

*   **JavaScript**: Use modern ES6+ syntax (const/let, arrow functions, classes).
*   **Formatting**: Keep code clean and readable.
*   **Comments**: Comment complex logic, but aim for self-documenting code.

## Pull Request Process

1.  Ensure your code works and doesn't break existing features.
2.  Update the `README.md` if you change any game mechanics or controls.
3.  Open a Pull Request against the `main` branch.
4.  Describe your changes clearly in the PR description.

## Reporting Bugs

Bugs are tracked as GitHub issues. When filing an issue, please include:

*   A clear title and description.
*   Steps to reproduce the bug.
*   Expected vs. actual behavior.
*   Screenshots if applicable.

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
