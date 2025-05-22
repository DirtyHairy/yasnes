export const enum AddressingMode {
    abs = 'absolute', // $0000
    abs_x = 'absolute,x', // $0000,X
    abs_y = 'absolute,y', // $0000,Y
    abs_16 = '(absolute)', // ($0000)
    abs_24 = '[absolute]', // [$0000]
    abs_x_16 = '(absolute,x)', //  ($0000,X)
    direct = 'direct', // $00
    direct_x = 'direct,x', // $00,X
    direct_y = 'direct,y', // $00,Y
    direct_16 = '(direct)', // ($00)
    direct_24 = '[direct]', // [$00]
    direct_x_16 = '(direct,x)', // ($00,X)
    direct_y_16 = '(direct),y', // ($00),Y
    direct_y_24 = '[direct],y', // [$00],Y
    imm = 'immediate', // #$00
    implied = 'implied',
    long = 'long', // $000000
    long_x = 'long,x', // $000000,X
    rel8 = 'rel8', // $00 (8 bit PC-relative)
    rel16 = 'rel16', // $0000 (16 bit PC-relative)
    src_dest = 'src,dest', // $00,$00
    stack = 'stack', // $00,S
    stack_y_16 = '(stack),y', // ($00,S),Y
}
