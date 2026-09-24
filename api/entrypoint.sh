#!/bin/sh
set -e
cd /app
echo "Running database migrations (alembic upgrade head)..."
alembic upgrade head
echo "Migrations complete. Starting API..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
