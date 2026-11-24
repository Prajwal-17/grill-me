import { Link, useRouteError } from "react-router";
import { buttonStyles, Button } from "@/shared/components/ui/button";

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-8 md:py-10">
      <h1 className="text-section font-semibold">Page not found</h1>
      <p className="mt-2 mb-4 text-ui text-muted">This page does not exist.</p>
      <Link to="/" className={buttonStyles("primary")}>
        Back to home
      </Link>
    </main>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <main className="mx-auto max-w-md px-5 py-8 md:py-10" role="alert">
      <h1 className="text-section font-semibold">Could not open this page</h1>
      <p className="mt-2 mb-4 text-ui text-muted">
        {error instanceof Error
          ? error.message
          : "Please reload and try again."}
      </p>
      <Button onClick={() => window.location.reload()}>Reload page</Button>
      <a href="/" className={buttonStyles("secondary") + " ml-3"}>
        Back to home
      </a>
    </main>
  );
}
