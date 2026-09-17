default:
    @just --list

# install project dependencies.
install:
    bun install

# start Postgres Docker container
db-up:
    docker compose up -d postgres

# production database migrations
db-migrate-prod: db-up
    bun db:migrate:prod

# development database migrations
db-migrate-dev: db-up
    bun db:migrate:dev

# start production stack
prod:
    docker compose up -d

# stop production stack
prod-down:
    docker compose down

# build and start the complete production stack
prod-build:
    docker compose up --build -d

# restart the production
prod-restart:
    docker compose restart backend web
