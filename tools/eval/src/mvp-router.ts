if (process.argv.slice(2).includes('--source')) await import('./mvp-pairs-cli.js');
else await import('./mvp-cli.js');
