import '../src/emulator/cpu/globals';
import { DispatchCompiler } from '../src/emulator/cpu/dispatchCompiler';
import { writeFileSync } from 'fs';

function usage(): void {
    console.log('usage: generate-dispatcher.ts <output file>');
}

function main(): void {
    if (process.argv.length !== 3) return usage();

    writeFileSync(process.argv[2], new DispatchCompiler().generateDispatch());
}

main();
