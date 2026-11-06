export const metadata = { title: 'Data deletion' };

/** Where Threads sends a person after a data deletion request. Public, and says only what the platform really did. */
export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
      <h1 className="page-title">Your data deletion request</h1>
      <p className="text-muted">
        We received your request and removed the connection to your Threads account. The access we held was deleted, and
        nothing waiting to be posted to it will go out.
      </p>
      <p className="text-muted">
        Posts that were already published, and the history of them, belong to the company workspace that connected your
        account. Ask that company to delete them if you want them gone.
      </p>
      {code ? (
        <p className="text-sm text-muted">
          Your confirmation code: <span className="kbd">{code.slice(0, 40)}</span>
        </p>
      ) : null}
    </main>
  );
}
