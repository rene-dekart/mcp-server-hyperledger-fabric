# Contributing

Thanks for helping! Keep it small and boring.

## Setup

```bash
npm install
npm run build
npm test
```

## Development

```bash
npm run dev        # tsx watch, restarts on change
npm run build      # tsc → dist/
npm test           # node:test unit tests
```

## Before a PR

1. `npm run build` passes.
2. `npm test` passes.
3. Comments explain **why**, not what (see Google style guides).
4. No secrets, certs, or real endpoints in code, tests, or docs. Use
   test-network placeholders (`localhost:7051`, `Org1MSP`).

## Scope

- One logical change per PR.
- No new dependencies unless a few lines of stdlib can't do it.
- No speculative abstractions — add them when a second use case exists.

## License

By contributing you agree your work is licensed under the [MIT License](LICENSE).
