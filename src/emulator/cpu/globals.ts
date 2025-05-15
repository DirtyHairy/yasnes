import { compileDispatcher } from './dispatcher';
import { registerInstructions } from './instruction';

registerInstructions();

export const dispatcher = compileDispatcher();
