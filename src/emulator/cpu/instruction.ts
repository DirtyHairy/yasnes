import { Bus } from '../bus';
import { Flag, Mode, State } from './state';
import { Clock } from '../clock';
import { BreakCallback, BreakReason } from '../break';
import { outdent } from 'outdent';
import { hex16, hex8 } from '../util';
import { CodeBuilder } from './codeBuilder';

const instructions = new Array<Instruction>(0x100);

export const enum CompilationFlags {
    none = 0,
}

export const enum AddressingMode {
    abs = 'abs', // $0000
    abs_x = 'abs_x', // $0000,X
    abs_y = 'abs_y', // $0000,Y
    abs_16 = 'abs_16', // ($0000)
    abs_24 = 'abs_24', // [$0000]
    abs_x_16 = 'abs_x_16', //  ($0000,X)
    direct = 'direct', // $00
    direct_x = 'direct_x', // $00,X
    direct_y = 'direct_y', // $00,Y
    direct_16 = 'direct_16', // ($00)
    direct_24 = 'direct_24', // [$00]
    direct_x_16 = 'direct_x_16', // ($00,X)
    direct_y_16 = 'direct_y_16', // ($00),Y
    direct_y_24 = 'direct_y_24', // [$00],Y
    imm = 'imm', // #$00
    implied = 'implied',
    long = 'long', // $000000
    long_x = 'long_x', // $000000,X
    rel8 = 'rel8', // $00 (8 bit PC-relative)
    rel16 = 'rel16', // $0000 (16 bit PC-relative)
    src_dest = 'src_dest', // $00,$00
    stack = 'stack', // $00,S
    stack_y = 'stack_y', // ($00,S),Y
}

export interface DisassembleResult {
    disassembly: string;
    additionalBytes: number;
    mode: Mode;
}

export interface Instruction {
    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult;
    compile(mode: Mode, flags: number): string;

    execute(state: State, bus: Bus, clock: Clock, breakCb: BreakCallback, flags?: number): void;
}

export function getInstruction(opcode: number): Instruction {
    return instructions[opcode];
}

export function registerInstruction(opcode: number, instruction: Instruction): void {
    instructions[opcode] = instruction;
}

type ExecFn = (state: State, bus: Bus, clock: Clock, breakCb: BreakCallback) => void;

class InstructionBase implements Instruction {
    constructor(protected opcode: number) {}

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        return {
            disassembly: `D.B ${hex8(this.opcode)}`,
            additionalBytes: 0,
            mode,
        };
    }

    compile(mode: Mode, flags: number): string {
        const builder = new CodeBuilder(flags);

        this.build(mode, builder, flags);

        return builder.build();
    }

    execute(state: State, bus: Bus, clock: Clock, breakCb: BreakCallback, flags = CompilationFlags.none): void {
        (eval(this.compile(state.mode, flags)) as ExecFn)(state, bus, clock, breakCb);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected build(mode: Mode, builder: CodeBuilder, flags: CompilationFlags): void {
        builder.then(outdent`
            breakCb(${BreakReason.instructionFault}, 'instruction ${hex8(this.opcode)} not implemented');
        `);
    }

    protected disassembleWithAddressingMode(
        mnemnonic: string,
        address: number,
        addressingMode: AddressingMode,
        mode: Mode,
        bus: Bus
    ): DisassembleResult {
        switch (addressingMode) {
            case AddressingMode.abs: {
                let ptr = bus.peek(address);
                address = (address & 0xff0000) | ((address + 1) & 0xffff);

                ptr |= bus.peek(address) << 8;

                return { disassembly: `${mnemnonic} ${hex16(ptr, '$')}`, additionalBytes: 2, mode };
            }

            default:
                return { disassembly: `${mnemnonic} [addressing mode not implemented]`, additionalBytes: 0, mode };
        }
    }
}

// Base class for instructions with implied addressing mode
class InstructionImplied extends InstructionBase {
    constructor(opcode: number, private mnemonic: string) {
        super(opcode);
    }

    disassemble(mode: Mode): DisassembleResult {
        return {
            disassembly: this.mnemonic,
            additionalBytes: 0,
            mode,
        };
    }
}

// Base class for instructions with various addressing modes
class InstructionWithAddressingMode extends InstructionBase {
    constructor(opcode: number, protected mnemonic: string, protected addressingMode: AddressingMode) {
        super(opcode);
    }

    disassemble(mode: Mode, address: number, bus: Bus): DisassembleResult {
        return this.disassembleWithAddressingMode(this.mnemonic, address, this.addressingMode, mode, bus);
    }
}

// SEI - Set Interrupt Disable Flag
class InstructionSEI extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'SEI');
    }

    protected build(mode: Mode, builder: CodeBuilder): CodeBuilder {
        return builder.then(outdent`
            state.p |= ${Flag.i};
            clock.tickCpu(1);
        `);
    }
}

// STZ - Store Zero
class InstructionSTZ extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'STZ', addressingMode);
    }

    protected build(mode: Mode, builder: CodeBuilder): void {
        builder.store('0', mode, this.addressingMode);
    }
}

// ADC - Add with Carry
class InstructionADC extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'ADC', addressingMode);
    }
}

// AND - Logical AND
class InstructionAND extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'AND', addressingMode);
    }
}

// ASL - Arithmetic Shift Left
class InstructionASL extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'ASL', addressingMode);
    }
}

// BCC - Branch if Carry Clear
class InstructionBCC extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BCC', addressingMode);
    }
}

// BCS - Branch if Carry Set
class InstructionBCS extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BCS', addressingMode);
    }
}

// BEQ - Branch if Equal
class InstructionBEQ extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BEQ', addressingMode);
    }
}

// BIT - Bit Test
class InstructionBIT extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BIT', addressingMode);
    }
}

// BMI - Branch if Minus
class InstructionBMI extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BMI', addressingMode);
    }
}

// BNE - Branch if Not Equal
class InstructionBNE extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BNE', addressingMode);
    }
}

// BPL - Branch if Plus
class InstructionBPL extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BPL', addressingMode);
    }
}

// BRA - Branch Always
class InstructionBRA extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BRA', addressingMode);
    }
}

// BRK - Break
class InstructionBRK extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BRK', addressingMode);
    }
}

// BRL - Branch Long
class InstructionBRL extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BRL', addressingMode);
    }
}

// BVC - Branch if Overflow Clear
class InstructionBVC extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BVC', addressingMode);
    }
}

// BVS - Branch if Overflow Set
class InstructionBVS extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'BVS', addressingMode);
    }
}

// CLC - Clear Carry Flag
class InstructionCLC extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'CLC');
    }
}

// CLD - Clear Decimal Mode
class InstructionCLD extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'CLD');
    }
}

// CLI - Clear Interrupt Disable
class InstructionCLI extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'CLI');
    }
}

// CLV - Clear Overflow Flag
class InstructionCLV extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'CLV');
    }
}

// CMP - Compare
class InstructionCMP extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'CMP', addressingMode);
    }
}

// COP - Co-Processor
class InstructionCOP extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'COP', addressingMode);
    }
}

// CPX - Compare X Register
class InstructionCPX extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'CPX', addressingMode);
    }
}

// CPY - Compare Y Register
class InstructionCPY extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'CPY', addressingMode);
    }
}

// DEC - Decrement Memory
class InstructionDEC extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'DEC', addressingMode);
    }
}

// DEX - Decrement X Register
class InstructionDEX extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'DEX');
    }
}

// DEY - Decrement Y Register
class InstructionDEY extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'DEY');
    }
}

// EOR - Exclusive OR
class InstructionEOR extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'EOR', addressingMode);
    }
}

// INC - Increment Memory
class InstructionINC extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'INC', addressingMode);
    }
}

// INX - Increment X Register
class InstructionINX extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'INX');
    }
}

// INY - Increment Y Register
class InstructionINY extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'INY');
    }
}

// JMP - Jump
class InstructionJMP extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'JMP', addressingMode);
    }
}

// JSR - Jump to Subroutine
class InstructionJSR extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'JSR', addressingMode);
    }
}

// LDA - Load Accumulator
class InstructionLDA extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'LDA', addressingMode);
    }
}

// LDX - Load X Register
class InstructionLDX extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'LDX', addressingMode);
    }
}

// LDY - Load Y Register
class InstructionLDY extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'LDY', addressingMode);
    }
}

// LSR - Logical Shift Right
class InstructionLSR extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'LSR', addressingMode);
    }
}

// MVN - Block Move Negative
class InstructionMVN extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'MVN', addressingMode);
    }
}

// MVP - Block Move Positive
class InstructionMVP extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'MVP', addressingMode);
    }
}

// NOP - No Operation
class InstructionNOP extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'NOP');
    }
}

// ORA - Logical OR
class InstructionORA extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'ORA', addressingMode);
    }
}

// PEA - Push Effective Absolute Address
class InstructionPEA extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'PEA', addressingMode);
    }
}

// PEI - Push Effective Indirect Address
class InstructionPEI extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'PEI', addressingMode);
    }
}

// PER - Push Effective PC Relative Indirect Address
class InstructionPER extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'PER', addressingMode);
    }
}

// PHA - Push Accumulator
class InstructionPHA extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PHA');
    }
}

// PHB - Push Data Bank Register
class InstructionPHB extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PHB');
    }
}

// PHD - Push Direct Page Register
class InstructionPHD extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PHD');
    }
}

// PHK - Push Program Bank Register
class InstructionPHK extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PHK');
    }
}

// PHP - Push Processor Status Register
class InstructionPHP extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PHP');
    }
}

// PHX - Push X Register
class InstructionPHX extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PHX');
    }
}

// PHY - Push Y Register
class InstructionPHY extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PHY');
    }
}

// PLA - Pull Accumulator
class InstructionPLA extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PLA');
    }
}

// PLB - Pull Data Bank Register
class InstructionPLB extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PLB');
    }
}

// PLD - Pull Direct Page Register
class InstructionPLD extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PLD');
    }
}

// PLP - Pull Processor Status Register
class InstructionPLP extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PLP');
    }
}

// PLX - Pull X Register
class InstructionPLX extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PLX');
    }
}

// PLY - Pull Y Register
class InstructionPLY extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'PLY');
    }
}

// REP - Reset Processor Status Bits
class InstructionREP extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'REP', addressingMode);
    }
}

// ROL - Rotate Left
class InstructionROL extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'ROL', addressingMode);
    }
}

// ROR - Rotate Right
class InstructionROR extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'ROR', addressingMode);
    }
}

// RTI - Return from Interrupt
class InstructionRTI extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'RTI');
    }
}

// RTL - Return from Subroutine Long
class InstructionRTL extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'RTL');
    }
}

// RTS - Return from Subroutine
class InstructionRTS extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'RTS');
    }
}

// SBC - Subtract with Carry
class InstructionSBC extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'SBC', addressingMode);
    }
}

// SEC - Set Carry Flag
class InstructionSEC extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'SEC');
    }
}

// SED - Set Decimal Flag
class InstructionSED extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'SED');
    }
}

// SEP - Set Processor Status Bits
class InstructionSEP extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'SEP', addressingMode);
    }
}

// STA - Store Accumulator
class InstructionSTA extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'STA', addressingMode);
    }
}

// STP - Stop the Clock
class InstructionSTP extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'STP');
    }
}

// STX - Store X Register
class InstructionSTX extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'STX', addressingMode);
    }
}

// STY - Store Y Register
class InstructionSTY extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'STY', addressingMode);
    }
}

// TAX - Transfer Accumulator to X
class InstructionTAX extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TAX');
    }
}

// TAY - Transfer Accumulator to Y
class InstructionTAY extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TAY');
    }
}

// TCD - Transfer 16-bit Accumulator to Direct Page Register
class InstructionTCD extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TCD');
    }
}

// TCS - Transfer 16-bit Accumulator to Stack Pointer
class InstructionTCS extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TCS');
    }
}

// TDC - Transfer Direct Page Register to 16-bit Accumulator
class InstructionTDC extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TDC');
    }
}

// TRB - Test and Reset Bits
class InstructionTRB extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'TRB', addressingMode);
    }
}

// TSB - Test and Set Bits
class InstructionTSB extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'TSB', addressingMode);
    }
}

// TSC - Transfer Stack Pointer to 16-bit Accumulator
class InstructionTSC extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TSC');
    }
}

// TSX - Transfer Stack Pointer to X
class InstructionTSX extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TSX');
    }
}

// TXA - Transfer X to Accumulator
class InstructionTXA extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TXA');
    }
}

// TXS - Transfer X to Stack Pointer
class InstructionTXS extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TXS');
    }
}

// TXY - Transfer X to Y
class InstructionTXY extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TXY');
    }
}

// TYA - Transfer Y to Accumulator
class InstructionTYA extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TYA');
    }
}

// TYX - Transfer Y to X
class InstructionTYX extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'TYX');
    }
}

// WAI - Wait for Interrupt
class InstructionWAI extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'WAI');
    }
}

// WDM - Reserved for Future Expansion
class InstructionWDM extends InstructionWithAddressingMode {
    constructor(opcode: number, addressingMode: AddressingMode) {
        super(opcode, 'WDM', addressingMode);
    }
}

// XBA - Exchange B and A Accumulators
class InstructionXBA extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'XBA');
    }
}

// XCE - Exchange Carry and Emulation Flags
class InstructionXCE extends InstructionImplied {
    constructor(opcode: number) {
        super(opcode, 'XCE');
    }
}

export function registerInstructions(): void {
    // Initialize all opcodes with base instruction
    for (let i = 0; i < 0x100; i++) {
        registerInstruction(i & 0xff, new InstructionBase(i));
    }

    // Row 0
    registerInstruction(0x00, new InstructionBRK(0x00, AddressingMode.implied));
    registerInstruction(0x01, new InstructionORA(0x01, AddressingMode.direct_x_16));
    registerInstruction(0x02, new InstructionCOP(0x02, AddressingMode.imm));
    registerInstruction(0x03, new InstructionORA(0x03, AddressingMode.stack));
    registerInstruction(0x04, new InstructionTSB(0x04, AddressingMode.direct));
    registerInstruction(0x05, new InstructionORA(0x05, AddressingMode.direct));
    registerInstruction(0x06, new InstructionASL(0x06, AddressingMode.direct));
    registerInstruction(0x07, new InstructionORA(0x07, AddressingMode.direct_16));
    registerInstruction(0x08, new InstructionPHP(0x08));
    registerInstruction(0x09, new InstructionORA(0x09, AddressingMode.imm));
    registerInstruction(0x0a, new InstructionASL(0x0a, AddressingMode.implied));
    registerInstruction(0x0b, new InstructionPHD(0x0b));
    registerInstruction(0x0c, new InstructionTSB(0x0c, AddressingMode.abs));
    registerInstruction(0x0d, new InstructionORA(0x0d, AddressingMode.abs));
    registerInstruction(0x0e, new InstructionASL(0x0e, AddressingMode.abs));
    registerInstruction(0x0f, new InstructionORA(0x0f, AddressingMode.long));

    // Row 1
    registerInstruction(0x10, new InstructionBPL(0x10, AddressingMode.rel8));
    registerInstruction(0x11, new InstructionORA(0x11, AddressingMode.direct_y_16));
    registerInstruction(0x12, new InstructionORA(0x12, AddressingMode.direct_16));
    registerInstruction(0x13, new InstructionORA(0x13, AddressingMode.stack_y));
    registerInstruction(0x14, new InstructionTRB(0x14, AddressingMode.direct));
    registerInstruction(0x15, new InstructionORA(0x15, AddressingMode.direct_x));
    registerInstruction(0x16, new InstructionASL(0x16, AddressingMode.direct_x));
    registerInstruction(0x17, new InstructionORA(0x17, AddressingMode.direct_y_16));
    registerInstruction(0x18, new InstructionCLC(0x18));
    registerInstruction(0x19, new InstructionORA(0x19, AddressingMode.abs_y));
    registerInstruction(0x1a, new InstructionINC(0x1a, AddressingMode.implied));
    registerInstruction(0x1b, new InstructionTCS(0x1b));
    registerInstruction(0x1c, new InstructionTRB(0x1c, AddressingMode.abs));
    registerInstruction(0x1d, new InstructionORA(0x1d, AddressingMode.abs_x));
    registerInstruction(0x1e, new InstructionASL(0x1e, AddressingMode.abs_x));
    registerInstruction(0x1f, new InstructionORA(0x1f, AddressingMode.long_x));

    // Row 2
    registerInstruction(0x20, new InstructionJSR(0x20, AddressingMode.abs));
    registerInstruction(0x21, new InstructionAND(0x21, AddressingMode.direct_x_16));
    registerInstruction(0x22, new InstructionJSR(0x22, AddressingMode.long));
    registerInstruction(0x23, new InstructionAND(0x23, AddressingMode.stack));
    registerInstruction(0x24, new InstructionBIT(0x24, AddressingMode.direct));
    registerInstruction(0x25, new InstructionAND(0x25, AddressingMode.direct));
    registerInstruction(0x26, new InstructionROL(0x26, AddressingMode.direct));
    registerInstruction(0x27, new InstructionAND(0x27, AddressingMode.direct_16));
    registerInstruction(0x28, new InstructionPLP(0x28));
    registerInstruction(0x29, new InstructionAND(0x29, AddressingMode.imm));
    registerInstruction(0x2a, new InstructionROL(0x2a, AddressingMode.implied));
    registerInstruction(0x2b, new InstructionPLD(0x2b));
    registerInstruction(0x2c, new InstructionBIT(0x2c, AddressingMode.abs));
    registerInstruction(0x2d, new InstructionAND(0x2d, AddressingMode.abs));
    registerInstruction(0x2e, new InstructionROL(0x2e, AddressingMode.abs));
    registerInstruction(0x2f, new InstructionAND(0x2f, AddressingMode.long));

    // Row 3
    registerInstruction(0x30, new InstructionBMI(0x30, AddressingMode.rel8));
    registerInstruction(0x31, new InstructionAND(0x31, AddressingMode.direct_y_16));
    registerInstruction(0x32, new InstructionAND(0x32, AddressingMode.direct_16));
    registerInstruction(0x33, new InstructionAND(0x33, AddressingMode.stack_y));
    registerInstruction(0x34, new InstructionBIT(0x34, AddressingMode.direct_x));
    registerInstruction(0x35, new InstructionAND(0x35, AddressingMode.direct_x));
    registerInstruction(0x36, new InstructionROL(0x36, AddressingMode.direct_x));
    registerInstruction(0x37, new InstructionAND(0x37, AddressingMode.direct_y_16));
    registerInstruction(0x38, new InstructionSEC(0x38));
    registerInstruction(0x39, new InstructionAND(0x39, AddressingMode.abs_y));
    registerInstruction(0x3a, new InstructionDEC(0x3a, AddressingMode.implied));
    registerInstruction(0x3b, new InstructionTSC(0x3b));
    registerInstruction(0x3c, new InstructionBIT(0x3c, AddressingMode.abs_x));
    registerInstruction(0x3d, new InstructionAND(0x3d, AddressingMode.abs_x));
    registerInstruction(0x3e, new InstructionROL(0x3e, AddressingMode.abs_x));
    registerInstruction(0x3f, new InstructionAND(0x3f, AddressingMode.long_x));

    // Row 4
    registerInstruction(0x40, new InstructionRTI(0x40));
    registerInstruction(0x41, new InstructionEOR(0x41, AddressingMode.direct_x_16));
    registerInstruction(0x42, new InstructionWDM(0x42, AddressingMode.implied));
    registerInstruction(0x43, new InstructionEOR(0x43, AddressingMode.stack));
    registerInstruction(0x44, new InstructionMVP(0x44, AddressingMode.src_dest));
    registerInstruction(0x45, new InstructionEOR(0x45, AddressingMode.direct));
    registerInstruction(0x46, new InstructionLSR(0x46, AddressingMode.direct));
    registerInstruction(0x47, new InstructionEOR(0x47, AddressingMode.direct_16));
    registerInstruction(0x48, new InstructionPHA(0x48));
    registerInstruction(0x49, new InstructionEOR(0x49, AddressingMode.imm));
    registerInstruction(0x4a, new InstructionLSR(0x4a, AddressingMode.implied));
    registerInstruction(0x4b, new InstructionPHK(0x4b));
    registerInstruction(0x4c, new InstructionJMP(0x4c, AddressingMode.abs));
    registerInstruction(0x4d, new InstructionEOR(0x4d, AddressingMode.abs));
    registerInstruction(0x4e, new InstructionLSR(0x4e, AddressingMode.abs));
    registerInstruction(0x4f, new InstructionEOR(0x4f, AddressingMode.long));

    // Row 5
    registerInstruction(0x50, new InstructionBVC(0x50, AddressingMode.rel8));
    registerInstruction(0x51, new InstructionEOR(0x51, AddressingMode.direct_y_16));
    registerInstruction(0x52, new InstructionEOR(0x52, AddressingMode.direct_16));
    registerInstruction(0x53, new InstructionEOR(0x53, AddressingMode.stack_y));
    registerInstruction(0x54, new InstructionMVN(0x54, AddressingMode.src_dest));
    registerInstruction(0x55, new InstructionEOR(0x55, AddressingMode.direct_x));
    registerInstruction(0x56, new InstructionLSR(0x56, AddressingMode.direct_x));
    registerInstruction(0x57, new InstructionEOR(0x57, AddressingMode.direct_y_16));
    registerInstruction(0x58, new InstructionCLI(0x58));
    registerInstruction(0x59, new InstructionEOR(0x59, AddressingMode.abs_y));
    registerInstruction(0x5a, new InstructionPHY(0x5a));
    registerInstruction(0x5b, new InstructionTCD(0x5b));
    registerInstruction(0x5c, new InstructionJMP(0x5c, AddressingMode.long));
    registerInstruction(0x5d, new InstructionEOR(0x5d, AddressingMode.abs_x));
    registerInstruction(0x5e, new InstructionLSR(0x5e, AddressingMode.abs_x));
    registerInstruction(0x5f, new InstructionEOR(0x5f, AddressingMode.long_x));

    // Row 6
    registerInstruction(0x60, new InstructionRTS(0x60));
    registerInstruction(0x61, new InstructionADC(0x61, AddressingMode.direct_x_16));
    registerInstruction(0x62, new InstructionPER(0x62, AddressingMode.rel16));
    registerInstruction(0x63, new InstructionADC(0x63, AddressingMode.stack));
    registerInstruction(0x64, new InstructionSTZ(0x64, AddressingMode.direct));
    registerInstruction(0x65, new InstructionADC(0x65, AddressingMode.direct));
    registerInstruction(0x66, new InstructionROR(0x66, AddressingMode.direct));
    registerInstruction(0x67, new InstructionADC(0x67, AddressingMode.direct_16));
    registerInstruction(0x68, new InstructionPLA(0x68));
    registerInstruction(0x69, new InstructionADC(0x69, AddressingMode.imm));
    registerInstruction(0x6a, new InstructionROR(0x6a, AddressingMode.implied));
    registerInstruction(0x6b, new InstructionRTL(0x6b));
    registerInstruction(0x6c, new InstructionJMP(0x6c, AddressingMode.abs_16));
    registerInstruction(0x6d, new InstructionADC(0x6d, AddressingMode.abs));
    registerInstruction(0x6e, new InstructionROR(0x6e, AddressingMode.abs));
    registerInstruction(0x6f, new InstructionADC(0x6f, AddressingMode.long));

    // Row 7
    registerInstruction(0x70, new InstructionBVS(0x70, AddressingMode.rel8));
    registerInstruction(0x71, new InstructionADC(0x71, AddressingMode.direct_y_16));
    registerInstruction(0x72, new InstructionADC(0x72, AddressingMode.direct_16));
    registerInstruction(0x73, new InstructionADC(0x73, AddressingMode.stack_y));
    registerInstruction(0x74, new InstructionSTZ(0x74, AddressingMode.direct_x));
    registerInstruction(0x75, new InstructionADC(0x75, AddressingMode.direct_x));
    registerInstruction(0x76, new InstructionROR(0x76, AddressingMode.direct_x));
    registerInstruction(0x77, new InstructionADC(0x77, AddressingMode.direct_y_16));
    registerInstruction(0x78, new InstructionSEI(0x78));
    registerInstruction(0x79, new InstructionADC(0x79, AddressingMode.abs_y));
    registerInstruction(0x7a, new InstructionPLY(0x7a));
    registerInstruction(0x7b, new InstructionTDC(0x7b));
    registerInstruction(0x7c, new InstructionJMP(0x7c, AddressingMode.abs_x_16));
    registerInstruction(0x7d, new InstructionADC(0x7d, AddressingMode.abs_x));
    registerInstruction(0x7e, new InstructionROR(0x7e, AddressingMode.abs_x));
    registerInstruction(0x7f, new InstructionADC(0x7f, AddressingMode.long_x));

    // Row 8
    registerInstruction(0x80, new InstructionBRA(0x80, AddressingMode.rel8));
    registerInstruction(0x81, new InstructionSTA(0x81, AddressingMode.direct_x_16));
    registerInstruction(0x82, new InstructionBRL(0x82, AddressingMode.rel16));
    registerInstruction(0x83, new InstructionSTA(0x83, AddressingMode.stack));
    registerInstruction(0x84, new InstructionSTY(0x84, AddressingMode.direct));
    registerInstruction(0x85, new InstructionSTA(0x85, AddressingMode.direct));
    registerInstruction(0x86, new InstructionSTX(0x86, AddressingMode.direct));
    registerInstruction(0x87, new InstructionSTA(0x87, AddressingMode.direct_16));
    registerInstruction(0x88, new InstructionDEY(0x88));
    registerInstruction(0x89, new InstructionBIT(0x89, AddressingMode.imm));
    registerInstruction(0x8a, new InstructionTXA(0x8a));
    registerInstruction(0x8b, new InstructionPHB(0x8b));
    registerInstruction(0x8c, new InstructionSTY(0x8c, AddressingMode.abs));
    registerInstruction(0x8d, new InstructionSTA(0x8d, AddressingMode.abs));
    registerInstruction(0x8e, new InstructionSTX(0x8e, AddressingMode.abs));
    registerInstruction(0x8f, new InstructionSTA(0x8f, AddressingMode.long));

    // Row 9
    registerInstruction(0x90, new InstructionBCC(0x90, AddressingMode.rel8));
    registerInstruction(0x91, new InstructionSTA(0x91, AddressingMode.direct_y_16));
    registerInstruction(0x92, new InstructionSTA(0x92, AddressingMode.direct_16));
    registerInstruction(0x93, new InstructionSTA(0x93, AddressingMode.stack_y));
    registerInstruction(0x94, new InstructionSTY(0x94, AddressingMode.direct_x));
    registerInstruction(0x95, new InstructionSTA(0x95, AddressingMode.direct_x));
    registerInstruction(0x96, new InstructionSTX(0x96, AddressingMode.direct_y));
    registerInstruction(0x97, new InstructionSTA(0x97, AddressingMode.direct_y_16));
    registerInstruction(0x98, new InstructionTYA(0x98));
    registerInstruction(0x99, new InstructionSTA(0x99, AddressingMode.abs_y));
    registerInstruction(0x9a, new InstructionTXS(0x9a));
    registerInstruction(0x9b, new InstructionTXY(0x9b));
    registerInstruction(0x9c, new InstructionSTZ(0x9c, AddressingMode.abs));
    registerInstruction(0x9d, new InstructionSTA(0x9d, AddressingMode.abs_x));
    registerInstruction(0x9e, new InstructionSTZ(0x9e, AddressingMode.abs_x));
    registerInstruction(0x9f, new InstructionSTA(0x9f, AddressingMode.long_x));

    // Row A
    registerInstruction(0xa0, new InstructionLDY(0xa0, AddressingMode.imm));
    registerInstruction(0xa1, new InstructionLDA(0xa1, AddressingMode.direct_x_16));
    registerInstruction(0xa2, new InstructionLDX(0xa2, AddressingMode.imm));
    registerInstruction(0xa3, new InstructionLDA(0xa3, AddressingMode.stack));
    registerInstruction(0xa4, new InstructionLDY(0xa4, AddressingMode.direct));
    registerInstruction(0xa5, new InstructionLDA(0xa5, AddressingMode.direct));
    registerInstruction(0xa6, new InstructionLDX(0xa6, AddressingMode.direct));
    registerInstruction(0xa7, new InstructionLDA(0xa7, AddressingMode.direct_16));
    registerInstruction(0xa8, new InstructionTAY(0xa8));
    registerInstruction(0xa9, new InstructionLDA(0xa9, AddressingMode.imm));
    registerInstruction(0xaa, new InstructionTAX(0xaa));
    registerInstruction(0xab, new InstructionPLB(0xab));
    registerInstruction(0xac, new InstructionLDY(0xac, AddressingMode.abs));
    registerInstruction(0xad, new InstructionLDA(0xad, AddressingMode.abs));
    registerInstruction(0xae, new InstructionLDX(0xae, AddressingMode.abs));
    registerInstruction(0xaf, new InstructionLDA(0xaf, AddressingMode.long));

    // Row B
    registerInstruction(0xb0, new InstructionBCS(0xb0, AddressingMode.rel8));
    registerInstruction(0xb1, new InstructionLDA(0xb1, AddressingMode.direct_y_16));
    registerInstruction(0xb2, new InstructionLDA(0xb2, AddressingMode.direct_16));
    registerInstruction(0xb3, new InstructionLDA(0xb3, AddressingMode.stack_y));
    registerInstruction(0xb4, new InstructionLDY(0xb4, AddressingMode.direct_x));
    registerInstruction(0xb5, new InstructionLDA(0xb5, AddressingMode.direct_x));
    registerInstruction(0xb6, new InstructionLDX(0xb6, AddressingMode.direct_y));
    registerInstruction(0xb7, new InstructionLDA(0xb7, AddressingMode.direct_y_16));
    registerInstruction(0xb8, new InstructionCLV(0xb8));
    registerInstruction(0xb9, new InstructionLDA(0xb9, AddressingMode.abs_y));
    registerInstruction(0xba, new InstructionTSX(0xba));
    registerInstruction(0xbb, new InstructionTYX(0xbb));
    registerInstruction(0xbc, new InstructionLDY(0xbc, AddressingMode.abs_x));
    registerInstruction(0xbd, new InstructionLDA(0xbd, AddressingMode.abs_x));
    registerInstruction(0xbe, new InstructionLDX(0xbe, AddressingMode.abs_y));
    registerInstruction(0xbf, new InstructionLDA(0xbf, AddressingMode.long_x));

    // Row C
    registerInstruction(0xc0, new InstructionCPY(0xc0, AddressingMode.imm));
    registerInstruction(0xc1, new InstructionCMP(0xc1, AddressingMode.direct_x_16));
    registerInstruction(0xc2, new InstructionREP(0xc2, AddressingMode.imm));
    registerInstruction(0xc3, new InstructionCMP(0xc3, AddressingMode.stack));
    registerInstruction(0xc4, new InstructionCPY(0xc4, AddressingMode.direct));
    registerInstruction(0xc5, new InstructionCMP(0xc5, AddressingMode.direct));
    registerInstruction(0xc6, new InstructionDEC(0xc6, AddressingMode.direct));
    registerInstruction(0xc7, new InstructionCMP(0xc7, AddressingMode.direct_16));
    registerInstruction(0xc8, new InstructionINY(0xc8));
    registerInstruction(0xc9, new InstructionCMP(0xc9, AddressingMode.imm));
    registerInstruction(0xca, new InstructionDEX(0xca));
    registerInstruction(0xcb, new InstructionWAI(0xcb));
    registerInstruction(0xcc, new InstructionCPY(0xcc, AddressingMode.abs));
    registerInstruction(0xcd, new InstructionCMP(0xcd, AddressingMode.abs));
    registerInstruction(0xce, new InstructionDEC(0xce, AddressingMode.abs));
    registerInstruction(0xcf, new InstructionCMP(0xcf, AddressingMode.long));

    // Row D
    registerInstruction(0xd0, new InstructionBNE(0xd0, AddressingMode.rel8));
    registerInstruction(0xd1, new InstructionCMP(0xd1, AddressingMode.direct_y_16));
    registerInstruction(0xd2, new InstructionCMP(0xd2, AddressingMode.direct_16));
    registerInstruction(0xd3, new InstructionCMP(0xd3, AddressingMode.stack_y));
    registerInstruction(0xd4, new InstructionPEI(0xd4, AddressingMode.direct_16));
    registerInstruction(0xd5, new InstructionCMP(0xd5, AddressingMode.direct_x));
    registerInstruction(0xd6, new InstructionDEC(0xd6, AddressingMode.direct_x));
    registerInstruction(0xd7, new InstructionCMP(0xd7, AddressingMode.direct_y_16));
    registerInstruction(0xd8, new InstructionCLD(0xd8));
    registerInstruction(0xd9, new InstructionCMP(0xd9, AddressingMode.abs_y));
    registerInstruction(0xda, new InstructionPHX(0xda));
    registerInstruction(0xdb, new InstructionSTP(0xdb));
    registerInstruction(0xdc, new InstructionJMP(0xdc, AddressingMode.abs_16));
    registerInstruction(0xdd, new InstructionCMP(0xdd, AddressingMode.abs_x));
    registerInstruction(0xde, new InstructionDEC(0xde, AddressingMode.abs_x));
    registerInstruction(0xdf, new InstructionCMP(0xdf, AddressingMode.long_x));

    // Row E
    registerInstruction(0xe0, new InstructionCPX(0xe0, AddressingMode.imm));
    registerInstruction(0xe1, new InstructionSBC(0xe1, AddressingMode.direct_x_16));
    registerInstruction(0xe2, new InstructionSEP(0xe2, AddressingMode.imm));
    registerInstruction(0xe3, new InstructionSBC(0xe3, AddressingMode.stack));
    registerInstruction(0xe4, new InstructionCPX(0xe4, AddressingMode.direct));
    registerInstruction(0xe5, new InstructionSBC(0xe5, AddressingMode.direct));
    registerInstruction(0xe6, new InstructionINC(0xe6, AddressingMode.direct));
    registerInstruction(0xe7, new InstructionSBC(0xe7, AddressingMode.direct_16));
    registerInstruction(0xe8, new InstructionINX(0xe8));
    registerInstruction(0xe9, new InstructionSBC(0xe9, AddressingMode.imm));
    registerInstruction(0xea, new InstructionNOP(0xea));
    registerInstruction(0xeb, new InstructionXBA(0xeb));
    registerInstruction(0xec, new InstructionCPX(0xec, AddressingMode.abs));
    registerInstruction(0xed, new InstructionSBC(0xed, AddressingMode.abs));
    registerInstruction(0xee, new InstructionINC(0xee, AddressingMode.abs));
    registerInstruction(0xef, new InstructionSBC(0xef, AddressingMode.long));

    // Row F
    registerInstruction(0xf0, new InstructionBEQ(0xf0, AddressingMode.rel8));
    registerInstruction(0xf1, new InstructionSBC(0xf1, AddressingMode.direct_y_16));
    registerInstruction(0xf2, new InstructionSBC(0xf2, AddressingMode.direct_16));
    registerInstruction(0xf3, new InstructionSBC(0xf3, AddressingMode.stack_y));
    registerInstruction(0xf4, new InstructionPEA(0xf4, AddressingMode.abs));
    registerInstruction(0xf5, new InstructionSBC(0xf5, AddressingMode.direct_x));
    registerInstruction(0xf6, new InstructionINC(0xf6, AddressingMode.direct_x));
    registerInstruction(0xf7, new InstructionSBC(0xf7, AddressingMode.direct_y_16));
    registerInstruction(0xf8, new InstructionSED(0xf8));
    registerInstruction(0xf9, new InstructionSBC(0xf9, AddressingMode.abs_y));
    registerInstruction(0xfa, new InstructionPLX(0xfa));
    registerInstruction(0xfb, new InstructionXCE(0xfb));
    registerInstruction(0xfc, new InstructionJSR(0xfc, AddressingMode.abs_x_16));
    registerInstruction(0xfd, new InstructionSBC(0xfd, AddressingMode.abs_x));
    registerInstruction(0xfe, new InstructionINC(0xfe, AddressingMode.abs_x));
    registerInstruction(0xff, new InstructionSBC(0xff, AddressingMode.long_x));
}
