import type { Command } from '@commander-js/extra-typings';
import { PaginationQueryBuilder } from '@freshbooks/api/dist/models/builders/PaginationQueryBuilder.js';
import { SearchQueryBuilder } from '@freshbooks/api/dist/models/builders/SearchQueryBuilder.js';
import { withErrorHandling } from '../utils/errors.js';
import { getAuthenticatedClient } from '../auth/client-factory.js';

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function registerClientsCommand(program: Command) {
  const clients = program.command('clients').description('Manage FreshBooks clients');

  // ── list ──────────────────────────────────────────────────────────────
  clients
    .command('list')
    .description('List clients')
    .option('-p, --page <number>', 'Page number', '1')
    .option('--per-page <number>', 'Results per page', '25')
    .option('-s, --search <term>', 'Search by name or email')
    .action(
      withErrorHandling(async (opts) => {
        const { client, accountId } = await getAuthenticatedClient();

        const builders: any[] = [];

        const paginator = new PaginationQueryBuilder();
        paginator.page(parseInt(opts.page, 10));
        paginator.perPage(parseInt(opts.perPage, 10));
        builders.push(paginator);

        if (opts.search) {
          const search = new SearchQueryBuilder();
          search.like('organization_like', opts.search);
          builders.push(search);
        }

        const response = await client.clients.list(accountId, builders);

        if (!response.data) {
          console.error('No data returned');
          process.exit(1);
        }

        output({
          clients: response.data.clients,
          pages: response.data.pages,
        });
      })
    );

  // ── get ───────────────────────────────────────────────────────────────
  clients
    .command('get')
    .description('Get a single client')
    .argument('<id>', 'Client ID')
    .action(
      withErrorHandling(async (id) => {
        const { client, accountId } = await getAuthenticatedClient();
        const response = await client.clients.single(accountId, id);

        if (!response.data) {
          console.error('Client not found');
          process.exit(1);
        }

        output(response.data);
      })
    );

  // ── create ────────────────────────────────────────────────────────────
  clients
    .command('create')
    .description('Create a new client')
    .option('--fname <name>', 'First name')
    .option('--lname <name>', 'Last name')
    .option('--email <email>', 'Email address')
    .option('--organization <org>', 'Organization / company name')
    .option('--data <json>', 'Full client payload as JSON (overrides other flags)')
    .action(
      withErrorHandling(async (opts) => {
        const { client, accountId } = await getAuthenticatedClient();

        let payload: any;

        if (opts.data) {
          payload = JSON.parse(opts.data);
        } else {
          payload = {};
          if (opts.fname) payload.fName = opts.fname;
          if (opts.lname) payload.lName = opts.lname;
          if (opts.email) payload.email = opts.email;
          if (opts.organization) payload.organization = opts.organization;
        }

        const response = await client.clients.create(payload, accountId);

        if (!response.data) {
          console.error('Failed to create client');
          process.exit(1);
        }

        output(response.data);
      })
    );

  // ── update ────────────────────────────────────────────────────────────
  clients
    .command('update')
    .description('Update an existing client')
    .argument('<id>', 'Client ID')
    .requiredOption('--data <json>', 'Update payload as JSON')
    .action(
      withErrorHandling(async (id, opts) => {
        const { client, accountId } = await getAuthenticatedClient();
        const payload = JSON.parse(opts.data);

        const response = await client.clients.update(payload, accountId, id);

        if (!response.data) {
          console.error('Failed to update client');
          process.exit(1);
        }

        output(response.data);
      })
    );
}
