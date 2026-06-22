#!/usr/bin/env node
/**
 * Scaffold a new feature slice that matches the architecture:
 *   npm run new:feature -- checkout
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const name = process.argv[2]?.toLowerCase().replace(/[^a-z0-9-]/g, '');
if (!name) {
  console.error('Usage: npm run new:feature -- <kebab-case-name>');
  process.exit(1);
}

const pascal = name
  .split('-')
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join('');

const base = join(process.cwd(), 'src', 'features', name);
if (existsSync(base)) {
  console.error(`Feature "${name}" already exists.`);
  process.exit(1);
}

for (const dir of ['ui', 'model', 'lib', '__tests__']) {
  mkdirSync(join(base, dir), { recursive: true });
}

writeFileSync(
  join(base, 'index.ts'),
  `/**
 * PUBLIC API of the ${name} feature. Keep it minimal.
 */
export { ${pascal}Screen } from './ui/${name}-screen';
`,
);

writeFileSync(
  join(base, 'ui', `${name}-screen.tsx`),
  `import { AppText, Screen } from '@/shared/ui';

export function ${pascal}Screen() {
  return (
    <Screen testID="${name}-screen">
      <AppText variant="display">${pascal}</AppText>
    </Screen>
  );
}
`,
);

writeFileSync(
  join(base, '__tests__', `${name}-screen.test.tsx`),
  `import { render, screen } from '@/shared/testing/render';

import { ${pascal}Screen } from '../ui/${name}-screen';

describe('<${pascal}Screen />', () => {
  it('renders', () => {
    render(<${pascal}Screen />);
    expect(screen.getByTestId('${name}-screen')).toBeOnTheScreen();
  });
});
`,
);

console.log(`✓ Created src/features/${name}
Next steps:
  1. Add a route in src/app/ that renders ${pascal}Screen
  2. Write the PRD: docs/product/prds/ (copy _template.md)
  3. Add a Maestro flow when the CUJ stabilizes: .maestro/flows/
`);
