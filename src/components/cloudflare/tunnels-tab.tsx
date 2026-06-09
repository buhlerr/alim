"use client";

import * as React from "react";
import { Loader2, Plus, Route, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CfIngressRule, CfTunnel } from "@/services/cloudflare/types";
import {
  createTunnelAction,
  deleteTunnelAction,
  deleteTunnelRouteAction,
  getTunnelRoutesAction,
  saveTunnelRouteAction,
} from "@/app/actions/cloudflare";

export function TunnelsTab({ tunnels }: { tunnels: CfTunnel[] }) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [routesFor, setRoutesFor] = React.useState<CfTunnel | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New tunnel
        </Button>
      </div>

      {tunnels.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No tunnels yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tunnels.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.id}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === "healthy" ? "success" : "secondary"}>
                        {t.status ?? "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRoutesFor(t)}
                          aria-label="Manage routes"
                          title="Routes"
                        >
                          <Route className="h-4 w-4" />
                        </Button>
                        <DeleteTunnelButton tunnel={t} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New tunnel</DialogTitle>
          </DialogHeader>
          <CreateTunnelForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(routesFor)} onOpenChange={(o) => !o && setRoutesFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Routes: {routesFor?.name}</DialogTitle>
          </DialogHeader>
          {routesFor ? <TunnelRoutes tunnel={routesFor} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeleteTunnelButton({ tunnel }: { tunnel: CfTunnel }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-label="Delete tunnel"
      onClick={async () => {
        if (!window.confirm(`Delete tunnel ${tunnel.name}?`)) return;
        setBusy(true);
        try {
          const res = await deleteTunnelAction(tunnel.id);
          if (res.ok) toast.success("Tunnel deleted.");
          else toast.error(res.error ?? "Could not delete.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

function CreateTunnelForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errs, setErrs] = React.useState<Record<string, string[]>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrs({});
    try {
      const res = await createTunnelAction({ name });
      if (res.ok) {
        toast.success("Tunnel created.");
        onDone();
      } else if (res.fieldErrors) {
        setErrs(res.fieldErrors);
      } else {
        toast.error(res.error ?? "Could not create the tunnel.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="prod-web"
          autoFocus
        />
        {errs.name ? <p className="text-xs text-destructive">{errs.name[0]}</p> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Creates a cloud-managed tunnel. Run a <code className="font-mono">cloudflared</code>{" "}
        connector with this tunnel&apos;s token to bring it online.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Create
        </Button>
      </div>
    </form>
  );
}

function TunnelRoutes({ tunnel }: { tunnel: CfTunnel }) {
  const [routes, setRoutes] = React.useState<CfIngressRule[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [hostname, setHostname] = React.useState("");
  const [service, setService] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await getTunnelRoutesAction(tunnel.id);
    if (res.ok) setRoutes(res.data ?? []);
    else toast.error(res.error ?? "Could not load routes.");
    setLoading(false);
  }, [tunnel.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await saveTunnelRouteAction(tunnel.id, { hostname, service });
      if (res.ok) {
        toast.success("Route saved.");
        setHostname("");
        setService("");
        await load();
      } else {
        toast.error(res.error ?? "Could not save the route.");
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(h: string) {
    const res = await deleteTunnelRouteAction(tunnel.id, h);
    if (res.ok) {
      toast.success("Route removed.");
      await load();
    } else {
      toast.error(res.error ?? "Could not remove the route.");
    }
  }

  const publicRoutes = (routes ?? []).filter((r) => r.hostname);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading routes…
        </div>
      ) : publicRoutes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No public hostnames routed yet.</p>
      ) : (
        <div className="space-y-1">
          {publicRoutes.map((r) => (
            <div
              key={r.hostname}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-mono">{r.hostname}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  → {r.service}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${r.hostname}`}
                onClick={() => remove(r.hostname as string)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={add} className="space-y-3 border-t pt-4">
        <div className="space-y-1.5">
          <Label>Public hostname</Label>
          <Input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="app.example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Service</Label>
          <Input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="http://localhost:3000"
            className="font-mono"
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !hostname || !service}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            Add route
          </Button>
        </div>
      </form>
    </div>
  );
}
