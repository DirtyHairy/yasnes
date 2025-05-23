import { outdent } from 'outdent';
import { BreakReason } from '../../src/emulator/break';
import { Cpu } from '../../src/emulator/cpu/cpu';
import {
    compareState,
    Flag,
    INITIAL_STATE,
    Mode,
    SlowPathReason,
    State,
    stateToString,
} from '../../src/emulator/cpu/state';
import { BusTest } from './busTest';
import { ClockTest } from './clockTest';
import { readFileSync } from 'fs';
import path from 'path';
import { getInstruction } from '../../src/emulator/cpu/instruction';
import { hex16, hex8 } from '../../src/emulator/util';
import { green, red } from 'colors';

export interface Suite {
    opcode: number;
    emulation: boolean;
}

interface FixtureState {
    pc: number;
    s: number;
    p: number;
    a: number;
    x: number;
    y: number;
    dbr: number;
    d: number;
    pbr: number;
    e: 1 | 0;
    ram: Array<[number, number]>;
}

interface Fixture {
    name: string;
    initial: FixtureState;
    final: FixtureState;
    cycles: Array<[number, number, string]>;
}

function copyFixtureToState(state: State, fixture: FixtureState): void {
    state.pc = fixture.pc;
    state.a = fixture.a;
    state.x = fixture.x;
    state.y = fixture.y;
    state.s = fixture.s;
    state.p = fixture.p;
    state.d = fixture.d;
    state.dbr = fixture.dbr << 16;
    state.k = fixture.pbr << 16;
    state.breakReason = BreakReason.none;
    state.slowPath = 0;
    state.mode = fixture.e > 0 ? Mode.em : (fixture.p >>> 4) & 0x03;

    if (state.mode === Mode.em) {
        state.s = 0x0100 | (state.s & 0xff);
        state.p |= Flag.m | Flag.x;
    }

    if (state.mode !== Mode.mx && state.mode !== Mode.Mx) {
        state.x &= 0xff;
        state.y &= 0xff;
    }
}

function describeFixture(fixture: Fixture): string {
    const state = { ...INITIAL_STATE };

    copyFixtureToState(state, fixture.initial);

    let description = stateToString(state) + '\n\n';

    description +=
        'RAM:\n' + fixture.initial.ram.map(([addr, value]) => ` * ${hex16(addr)} : ${hex8(value)}`).join('\n');

    description +=
        '\n\nexpected:\n' + fixture.final.ram.map(([addr, value]) => ` * ${hex16(addr)} : ${hex8(value)}`).join('\n');

    return description;
}

function loadSuite(suite: Suite): Array<Fixture> {
    const name = suite.opcode.toString(16).padStart(2, '0') + (suite.emulation ? '.e' : '.n') + '.json';

    return JSON.parse(
        readFileSync(path.join(__dirname, '..', '..', 'test', '65816_suite', 'v1', name), 'utf-8'),
    ) as Array<Fixture>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeError(e: any): string {
    try {
        return (e as Error).message;
    } catch {
        return `${e}`;
    }
}

export class TestRunner {
    private finalState = { ...INITIAL_STATE };
    private bus: BusTest;
    private clock: ClockTest;
    private cpu: Cpu;

    constructor() {
        this.clock = new ClockTest();
        this.bus = new BusTest(this.clock);
        this.cpu = new Cpu(this.bus, this.clock);
    }

    runOne(suite: Suite, index: number): void {
        const fixtures = loadSuite(suite);
        const instruction = getInstruction(suite.opcode);
        const description = `${hex8(suite.opcode)} (${suite.emulation ? 'em' : 'nt'}) ${instruction.description()}`;

        try {
            this.execute(fixtures[index]);

            process.stdout.write(green(`${description} SUCCESS`) + '\n');
        } catch (e) {
            process.stdout.write(red(`${description} FAIL`) + '\n');

            process.stdout.write(describeFixture(fixtures[index]) + '\n\n');

            process.stdout.write(describeError(e));
            process.stdout.write('\n\n');
        }
    }

    runSuite(suite: Suite): void {
        const fixtures = loadSuite(suite);
        const instruction = getInstruction(suite.opcode);
        const description = `${hex8(suite.opcode)} (${suite.emulation ? 'em' : 'nt'}) ${instruction.description()}`;

        process.stdout.write(description.padEnd(35, ' '));

        const step = fixtures.length / 40;
        let remaining = 40;
        let i = 0;

        try {
            for (; i < fixtures.length; i++) {
                if (i % step === 0) {
                    process.stdout.write('.');
                    remaining--;
                }

                this.execute(fixtures[i]);
            }

            process.stdout.write('   ' + green('PASS') + '\n');
        } catch (e) {
            process.stdout.write(''.padEnd(remaining + 3, ' ') + red('FAIL') + '\n');
            process.stdout.write(red(`${description} failed at index ${i}:` + '\n\n'));

            process.stdout.write(describeFixture(fixtures[i]) + '\n\n');

            process.stdout.write(describeError(e));
            process.stdout.write('\n\n');
        }
    }

    private execute(fixture: Fixture): void {
        this.cpu.reset();
        this.bus.reset();
        this.clock.reset();

        copyFixtureToState(this.cpu.state, fixture.initial);
        copyFixtureToState(this.finalState, fixture.final);

        this.bus.populate(fixture.initial.ram);

        this.cpu.run(1);

        if (this.cpu.state.breakReason !== BreakReason.none) {
            throw new Error(`break: ${this.cpu.getBreakMessage()}`);
        }

        this.cpu.state.breakReason = BreakReason.none;
        this.cpu.state.slowPath = 0;
        if (!compareState(this.finalState, this.cpu.state)) {
            throw new Error(outdent`
                expected state:
                ${stateToString(this.finalState)}

                got state:
                ${stateToString(this.cpu.state)}
                `);
        }

        this.bus.verify(fixture.final.ram);

        if (this.clock.getTicks() !== fixture.cycles.length) {
            throw new Error(`expected ${fixture.cycles.length} cycles, got ${this.clock.getTicks()} cycles`);
        }
    }
}
