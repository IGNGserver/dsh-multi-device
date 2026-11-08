/**
 * Vitest configuration.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is provided by DSH at runtime and is
 * only an optional peer dependency of this package, so it is not installed
 * here. Client components import it directly; without an alias, any suite that
 * imports one of those components fails at import time instead of exercising
 * behaviour. Suites that need different primitive behaviour still call
 * `vi.mock('@deepseek-ai/dsh-client-ui-primitives', …)` and win over this alias.
 */
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(
        new URL('./tests/support/primitives.tsx', import.meta.url),
      ),
    },
  },
})
