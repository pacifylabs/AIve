import { lookup } from 'node:dns/promises';
import { CompanyFact, CompanyProfile, type DataSource } from '@ai-staff/db';
import { FakeModelProvider } from '@ai-staff/llm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebsitePrefill } from '../src/index.js';
import { connect, inWorkspace, seedWorkspace } from './helpers.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);

let db: DataSource;
beforeAll(async () => {
  db = await connect().initialize();
});
afterAll(async () => {
  await db.destroy();
});

const page = (title: string, body: string) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;
const site = (async (input: string | URL) => {
  const pages: Record<string, string> = {
    'https://northfield.studio/': page('Northfield', '<a href="/pricing">Pricing</a> We run client onboarding.'),
    'https://northfield.studio/pricing': page('Pricing', 'Starter: $1,200 a year.'),
  };
  const body = pages[new URL(String(input)).toString()];
  return body
    ? new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
    : new Response('', { status: 404, headers: { 'content-type': 'text/html' } });
}) as typeof fetch;

async function workspaceWithWebsite(summary: string | null = null) {
  const ws = await seedWorkspace(db);
  await inWorkspace(db, ws.workspaceId, (m) =>
    m.save(m.create(CompanyProfile, { workspaceId: ws.workspaceId, website: 'https://northfield.studio/', summary })),
  );
  return ws;
}

describe('website prefill', () => {
  it('saves suggested facts unconfirmed, drops facts citing pages it never read, and keeps owner text', async () => {
    const model = new FakeModelProvider(() => ({
      output: {
        summary: 'Northfield runs client onboarding.',
        voice: 'Plain and friendly.',
        audience: 'Agencies.',
        facts: [
          { kind: 'price', text: 'Starter: $1,200 a year.', sourceUrl: 'https://northfield.studio/pricing' },
          { kind: 'claim', text: 'Rated number one.', sourceUrl: 'https://elsewhere.example/' },
        ],
      },
    }));
    const { workspaceId } = await workspaceWithWebsite('Written by the owner.');
    const result = await new WebsitePrefill(db, model, { model: 'fake', fetcher: site }).run(workspaceId);
    expect(result).toEqual({ state: 'done', suggestions: 1 });

    const facts = await inWorkspace(db, workspaceId, (m) => m.find(CompanyFact, { where: { workspaceId } }));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ source: 'website', confirmedAt: null, kind: 'price' });

    const profile = await inWorkspace(db, workspaceId, (m) => m.findOneByOrFail(CompanyProfile, { workspaceId }));
    expect(profile).toMatchObject({
      summary: 'Written by the owner.',
      voice: 'Plain and friendly.',
      prefillState: 'done',
    });
    // The page text reached the model as tagged data, never as instructions.
    expect(model.calls[0]!.user).toContain('<website_page>');
  });

  it('records a failure when the website cannot be read', async () => {
    const { workspaceId } = await workspaceWithWebsite();
    const failing = (async () =>
      new Response('', { status: 500, headers: { 'content-type': 'text/html' } })) as typeof fetch;
    const result = await new WebsitePrefill(db, new FakeModelProvider(() => ({ output: {} })), {
      model: 'fake',
      fetcher: failing,
    }).run(workspaceId);
    expect(result.state).toBe('failed');
    const profile = await inWorkspace(db, workspaceId, (m) => m.findOneByOrFail(CompanyProfile, { workspaceId }));
    expect(profile.prefillState).toBe('failed');
  });
});
