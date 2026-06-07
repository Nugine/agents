dev: fmt check lint test

run:
    deno run -A src/main.tsx

compile:
    deno compile -A -o dist/agents src/main.tsx


fmt:
    deno fmt

check:
    deno check src/main.tsx

lint:
    deno lint

test:
    deno test --allow-env src/
