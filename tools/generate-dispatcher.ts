import '../src/emulator/cpu/globals';
import { generateDispatcher } from '../src/emulator/cpu/dispatcher';
import { writeFileSync } from 'fs';

function usage(): void {
    console.log('usage: generate-dispatcher.ts <output file>');
}

function main(): void {
    if (process.argv.length !== 3) return usage();

    writeFileSync(process.argv[2], generateDispatcher());
}

main();
