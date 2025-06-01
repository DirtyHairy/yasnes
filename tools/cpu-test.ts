import { Command } from 'commander';
import { outdent } from 'outdent';
import { getInstruction } from '../src/emulator/cpu/instruction';
import { hex8 } from '../src/emulator/util';
import '../src/emulator/cpu/globals';
import { Suite, TestRunner } from './test/runner';
import { green, red } from 'colors';

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

function runOne(suite: Suite, indexArg?: number): void {
    const instruction = getInstruction(suite.opcode);
    const runner = new TestRunner();

    if (!instruction.isImplemented()) {
        console.log(`opcode ${hex8(suite.opcode)} is not implemented`);
        return;
    }

    if (indexArg === undefined) {
        runner.runSuite(suite);
    } else {
        runner.runOne(suite, indexArg);
    }
}

function runAll(stopOnFail = false): void {
    const runner = new TestRunner();

    let suitesOk = 0;
    let suitesFailed = 0;
    let opcodesOk = 0;
    let opcodesFailed = 0;
    let ok = true;

    const runSuite = (suite: Suite): boolean => {
        if (!runner.runSuite(suite)) {
            ok = false;
            suitesFailed++;

            if (stopOnFail) {
                opcodesFailed++;
                return false;
            }
        } else {
            suitesOk++;
        }

        return true;
    };

    for (let opcode = 0; opcode < 0x100; opcode++) {
        if (!getInstruction(opcode).isImplemented()) continue;
        ok = true;

        if (!runSuite({ opcode, emulation: false })) break;
        if (!runSuite({ opcode, emulation: true })) break;

        if (ok) opcodesOk++;
        else opcodesFailed++;
    }

    console.log();

    if (suitesOk > 0 || opcodesOk > 0) {
        console.log(`${green('PASSED')} ${suitesOk} suites, ${opcodesOk} opcodes`);
    }

    if (suitesFailed > 0 || opcodesFailed > 0) {
        console.log(`${red('FAILED')} ${suitesFailed} suites, ${opcodesFailed} opcodes`);
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
        .option('-s, --stop-on-fail', 'stop on first failing suite')
        .addHelpText(
            'after',
            outdent`
            Examples:
              $ cpu-test                    # Run all implemented opcodes
              $ cpu-test 0x89               # Run all tests for opcode 0x89 in native mode
              $ cpu-test 0x89e              # Run all tests for opcode 0x89 in emulation mode
              $ cpu-test 0x89 5             # Run test index 5 for opcode 0x89 in native mode
              $ cpu-test -s                 # Run all implemented opcodes, stop on first failure
        `,
        )
        .action((suiteArg?: string, indexArg?: number, options?: { stopOnFail?: boolean }) => {
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

            if (suite) {
                runOne(suite, indexArg);
            } else {
                runAll(options?.stopOnFail);
            }
        });

    program.parse();
}

main();
