"use client";

import * as React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * App-wide error boundary. Catches uncaught errors thrown while rendering a
 * route (e.g. an integration or the metadata DB being unreachable) and offers a
 * retry instead of white-screening.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="max-w-md border-destructive/40">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              This page hit an unexpected error. It&apos;s usually transient; try
              again, or check that the relevant service is reachable.
            </p>
          </div>
          <Button onClick={reset}>
            <RotateCw /> Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
