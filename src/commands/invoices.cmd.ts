import type { Command } from '@commander-js/extra-typings';
import { PaginationQueryBuilder } from '@freshbooks/api/dist/models/builders/PaginationQueryBuilder.js';
import { withErrorHandling } from '../utils/errors.js';
import { getAuthenticatedClient } from '../auth/client-factory.js';

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function registerInvoicesCommand(program: Command) {
  const invoices = program.command('invoices').description('Manage FreshBooks invoices');

  // ── list ──────────────────────────────────────────────────────────────
  invoices
    .command('list')
    .description('List invoices')
    .option('-p, --page <number>', 'Page number', '1')
    .option('--per-page <number>', 'Results per page', '25')
    .action(
      withErrorHandling(async (opts) => {
        const { client, accountId } = await getAuthenticatedClient();

        const paginator = new PaginationQueryBuilder();
        paginator.page(parseInt(opts.page, 10));
        paginator.perPage(parseInt(opts.perPage, 10));

        const response = await client.invoices.list(accountId, [paginator]);

        if (!response.data) {
          console.error('No data returned');
          process.exit(1);
        }

        output({
          invoices: response.data.invoices,
          pages: response.data.pages,
        });
      })
    );

  // ── get ───────────────────────────────────────────────────────────────
  invoices
    .command('get')
    .description('Get a single invoice')
    .argument('<id>', 'Invoice ID')
    .action(
      withErrorHandling(async (id) => {
        const { client, accountId } = await getAuthenticatedClient();
        const response = await client.invoices.single(accountId, id);

        if (!response.data) {
          console.error('Invoice not found');
          process.exit(1);
        }

        output(response.data);
      })
    );

  // ── create ────────────────────────────────────────────────────────────
  invoices
    .command('create')
    .description('Create a new invoice')
    .requiredOption('--client-id <id>', 'FreshBooks client (customer) ID')
    .option('--lines <json>', 'Invoice line items as JSON array')
    .option('--data <json>', 'Full invoice payload as JSON (overrides other flags)')
    .action(
      withErrorHandling(async (opts) => {
        const { client, accountId } = await getAuthenticatedClient();

        let invoicePayload: any;

        if (opts.data) {
          invoicePayload = JSON.parse(opts.data);
        } else {
          invoicePayload = {
            customerId: parseInt(opts.clientId, 10),
            createDate: new Date(),
          };

          if (opts.lines) {
            invoicePayload.lines = JSON.parse(opts.lines);
          }
        }

        const response = await client.invoices.create(invoicePayload, accountId);

        if (!response.data) {
          console.error('Failed to create invoice');
          process.exit(1);
        }

        output(response.data);
      })
    );

  // ── update ────────────────────────────────────────────────────────────
  invoices
    .command('update')
    .description('Update an existing invoice')
    .argument('<id>', 'Invoice ID')
    .requiredOption('--data <json>', 'Update payload as JSON')
    .action(
      withErrorHandling(async (id, opts) => {
        const { client, accountId } = await getAuthenticatedClient();
        const payload = JSON.parse(opts.data);

        const response = await client.invoices.update(accountId, id, payload);

        if (!response.data) {
          console.error('Failed to update invoice');
          process.exit(1);
        }

        output(response.data);
      })
    );

  // ── archive ───────────────────────────────────────────────────────────
  invoices
    .command('archive')
    .description('Archive an invoice (FreshBooks does not support permanent deletion)')
    .argument('<id>', 'Invoice ID')
    .action(
      withErrorHandling(async (id) => {
        const { client, accountId } = await getAuthenticatedClient();

        const response = await client.invoices.delete(accountId, id);

        if (!response.data) {
          console.error('Failed to archive invoice');
          process.exit(1);
        }

        console.log(`Invoice #${id} archived.`);
      })
    );

  // ── share-link ────────────────────────────────────────────────────────
  invoices
    .command('share-link')
    .description('Get a share link for an invoice')
    .argument('<id>', 'Invoice ID')
    .action(
      withErrorHandling(async (id) => {
        const { client, accountId } = await getAuthenticatedClient();
        const response = await client.invoices.shareLink(accountId, id);

        if (!response.data) {
          console.error('Failed to get share link');
          process.exit(1);
        }

        output(response.data);
      })
    );
}
