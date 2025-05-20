import { outdent } from 'outdent';
import { getInstruction } from '../src/emulator/cpu/instruction';
import { hex8 } from '../src/emulator/util';
import '../src/emulator/cpu/globals';
import { Suite, TestRunner } from './test/runner';

function parseSuite(x: string): Suite | undefined {
    if (x === undefined) return undefined;

    const match = x.match(/^0x([0-9a-f]{2})(e?)$/);
    if (!match) throw new Error(`invalid suite ${x}`);

    return { opcode: parseInt(match[1], 16), emulation: !!match[2] };
}

function usage(): void {
    console.log(outdent`
        usage: cpu-test.ts [suite] [index]

        suite: opcode as hex with an optional suffix 'e' to select emulation mode
        index: test index in suite
        `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeError(e: any): string {
    try {
        return (e as Error).message;
    } catch {
        return `${e}`;
    }
}

function main(): void {
    if (process.argv.length > 4) {
        usage();
        return;
    }

    let suite: Suite | undefined;
    let index: number | undefined;

    try {
        suite = parseSuite(process.argv[2]);
        index = process.argv[3] ? parseInt(process.argv[2], 10) : undefined;

        if (index !== undefined && isNaN(index)) throw new Error(`invalid test index ${index}`);
    } catch (e) {
        console.log(describeError(e));
        usage();
        return;
    }

    const runner = new TestRunner();

    if (suite) {
        const instruction = getInstruction(suite.opcode);

        if (!instruction.isImplemented()) {
            console.log(`opcode ${hex8(suite.opcode)} is not implemented`);
            return;
        }

        if (index === undefined) {
            runner.runSuite(suite);
        } else {
            runner.runOne(suite, index);
        }
    } else {
        for (let opcode = 0; opcode < 0x100; opcode++) {
            if (!getInstruction(opcode).isImplemented()) continue;

            runner.runSuite({ opcode, emulation: false });
            runner.runSuite({ opcode, emulation: true });
        }
    }
}

main();
