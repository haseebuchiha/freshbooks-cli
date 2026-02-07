import { program } from '@commander-js/extra-typings';
import { registerAuthCommand } from './commands/auth.cmd.js';
import { registerClientsCommand } from './commands/clients.cmd.js';
import { registerInvoicesCommand } from './commands/invoices.cmd.js';

program
  .name('freshbooks')
  .description('FreshBooks CLI tool')
  .version('0.1.0');

registerAuthCommand(program);
registerClientsCommand(program);
registerInvoicesCommand(program);

program.parse();
