import { repositoryRoot } from './cli.js';
import { generateWorkTables } from './work-tables.js';
console.log(await generateWorkTables(repositoryRoot));
