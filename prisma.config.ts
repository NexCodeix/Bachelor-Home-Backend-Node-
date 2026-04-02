import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Prefer DIRECT_URL for migrate/introspect workflows, fallback to pooled DATABASE_URL.
    url: env('DATABASE_URL'),
  },
});
