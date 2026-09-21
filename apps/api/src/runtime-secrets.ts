import { readFileSync } from 'node:fs';

export function loadSecret(name: string, environment: NodeJS.ProcessEnv = process.env): void {
  const fileName = `${name}_FILE`;
  if (environment[name] && environment[fileName]) throw new Error(`Set only one of ${name} or ${fileName}`);
  if (environment[fileName]) {
    environment[name] = readFileSync(environment[fileName], 'utf8').trim();
    delete environment[fileName];
  }
}
