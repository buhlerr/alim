"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckboxRow } from "@/components/npm/shared";
import { ZonePicker } from "./zone-picker";
import { SSL_MODES } from "@/lib/cloudflare-validation";
import type { CfSslMode, CfZone } from "@/services/cloudflare/types";
import {
  getTlsSettingsAction,
  updateTlsSettingsAction,
} from "@/app/actions/cloudflare";

const SSL_HELP: Record<CfSslMode, string> = {
  off: "No encryption between visitors and Cloudflare.",
  flexible: "Encrypts visitor↔Cloudflare; Cloudflare↔origin is HTTP.",
  full: "Encrypts end-to-end; origin cert not validated.",
  strict: "Encrypts end-to-end; origin cert must be valid.",
};

export function TlsTab({ zones }: { zones: CfZone[] }) {
  const [zoneId, setZoneId] = React.useState(zones[0]?.id ?? "");
  const [ssl, setSsl] = React.useState<CfSslMode>("full");
  const [alwaysHttps, setAlwaysHttps] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    const res = await getTlsSettingsAction(id);
    if (res.ok && res.data) {
      setSsl(res.data.ssl);
      setAlwaysHttps(res.data.always_use_https);
    } else if (!res.ok) {
      toast.error(res.error ?? "Could not load TLS settings.");
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(zoneId);
  }, [zoneId, load]);

  async function save() {
    setSaving(true);
    try {
      const res = await updateTlsSettingsAction(zoneId, {
        ssl,
        always_use_https: alwaysHttps,
      });
      if (res.ok) toast.success("TLS settings updated.");
      else toast.error(res.error ?? "Could not update.");
    } finally {
      setSaving(false);
    }
  }

  if (zones.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No zones available for this API token.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ZonePicker zones={zones} value={zoneId} onChange={setZoneId} />

      <Card>
        <CardContent className="space-y-5 py-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>SSL/TLS encryption mode</Label>
                <Select value={ssl} onValueChange={(v) => setSsl(v as CfSslMode)}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SSL_MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{SSL_HELP[ssl]}</p>
              </div>

              <CheckboxRow
                checked={alwaysHttps}
                onChange={setAlwaysHttps}
                label="Always use HTTPS (redirect HTTP → HTTPS)"
              />

              <div>
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  Save TLS settings
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
