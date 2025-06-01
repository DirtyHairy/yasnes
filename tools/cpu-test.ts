import { Command } from 'commander';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeError(e: any): string {
    try {
        return (e as Error).message;
    } catch {
        return `${e}`;
    }
}

function run(suite?: Suite, indexArg?: number): void {
    const runner = new TestRunner();

    if (suite) {
        const instruction = getInstruction(suite.opcode);

        if (!instruction.isImplemented()) {
            console.log(`opcode ${hex8(suite.opcode)} is not implemented`);
            return;
        }

        if (indexArg === undefined) {
            runner.runSuite(suite);
        } else {
            runner.runOne(suite, indexArg);
        }
    } else {
        for (let opcode = 0; opcode < 0x100; opcode++) {
            if (!getInstruction(opcode).isImplemented()) continue;

            runner.runSuite({ opcode, emulation: false });
            runner.runSuite({ opcode, emulation: true });
        }
    }
}

function main(): void {
    const program = new Command();

    program.name('cpu-test').description('CPU test runner for YASNES').version('0.0.1');

    program
        .argument('[suite]', 'opcode as hex with optional suffix "e" to select emulation mode (e.g., 0x42e)')
        .argument('[index]', 'test index in suite', (value) => {
            const parsedValue = parseInt(value, 10);
            if (isNaN(parsedValue)) {
                throw new Error(`invalid test index ${value}`);
            }
            return parsedValue;
        })
        .addHelpText(
            'after',
            outdent`
            Examples:
              $ cpu-test                    # Run all implemented opcodes
              $ cpu-test 0x89               # Run all tests for opcode 0x89 in native mode
              $ cpu-test 0x89e              # Run all tests for opcode 0x89 in emulation mode
              $ cpu-test 0x89 5             # Run test index 5 for opcode 0x89 in native mode
        `,
        )
        .action((suiteArg?: string, indexArg?: number) => {
            let suite: Suite | undefined;

            try {
                if (suiteArg) {
                    suite = parseSuite(suiteArg);
                }
            } catch (e) {
                console.log(describeError(e));
                program.help();
                return;
            }

            run(suite, indexArg);
        });

    program.parse();
}

main();
