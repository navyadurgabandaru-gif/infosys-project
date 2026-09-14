#!/bin/sh
set -e

echo "Waiting for PostgreSQL at ${PGHOST:-postgres}:${PGPORT:-5432}..."

ATTEMPTS=0

until node -e "
  const { Client } = require('pg');

  const c = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: {
      rejectUnauthorized: false
    }
  });

  c.connect()
    .then(() => c.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('PostgreSQL connection failed:', err.message);
      process.exit(1);
    });
"; do

  ATTEMPTS=$((ATTEMPTS + 1))

  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "PostgreSQL did not become ready in time." >&2
    exit 1
  fi

  sleep 2
done

echo "PostgreSQL is ready."

echo "Running schema + demo seed (idempotent)..."
node src/db/init.js

echo "Starting API server..."
exec node server.js
