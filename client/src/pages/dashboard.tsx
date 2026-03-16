import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot, Globe, Shield, Brain, Activity, CheckCircle,
  RefreshCw, MessageSquare, Cpu, Sparkles, Unlock, Zap,
  Loader2, PlayCircle, ArrowRight,
} from "lucide-react";
import type { Provider } from "@shared/schema";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" ? "bg-emerald-400" :
    status === "degraded" ? "bg-amber-400" :
    status === "offline" ? "bg-red-400" : "bg-zinc-500";
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />
  );
}

function isKeyFree(provider: Provider): boolean {
  if (!provider.config) return false;
  try { return JSON.parse(provider.config).keyFree === true; } catch { return false; }
}

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    queryFn: () => apiRequest("GET", "/api/stats").then(r => r.json()),
    refetchInterval: 5000,
  });

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ["/api/providers"],
    queryFn: () => apiRequest("GET", "/api/providers").then(r => r.json()),
  });

  const { data: autoKeyStatus = [] } = useQuery<any[]>({
    queryKey: ["/api/auto-keys/status"],
    queryFn: () => apiRequest("GET", "/api/auto-keys/status").then(r => r.json()),
  });

  const healthCheck = useMutation({
    mutationFn: () => apiRequest("POST", "/api/providers/health-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const provision = useMutation({
    mutationFn: () => apiRequest("POST", "/api/provision").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const autoProvisionAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auto-keys/provision-all").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auto-keys/status"] });
    },
  });

  const keyFreeProviders = providers.filter(isKeyFree);
  const keyFreeOnline = keyFreeProviders.filter(p => p.status === "online");
  const withKey = providers.filter(p => p.apiKey && p.apiKey.length > 0 && !isKeyFree(p));
  const needsKey = providers.filter(p => p.apiKeyRequired && !isKeyFree(p) && (!p.apiKey || p.apiKey.length === 0));
  const autoable = autoKeyStatus.filter((s: any) => s.canAutoProvision && !s.hasKey);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Auto-provisioning status banner */}
      <Card className="border-emerald-500/30 bg-emerald-500/5" data-testid="auto-provision-banner">
        <CardContent className="pt-4 pb-3 px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-emerald-500/15 shrink-0">
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-400">Automatische Configuratie</p>
                <p className="text-xs text-muted-foreground truncate">
                  {keyFreeOnline.length} key-vrije providers actief
                  {withKey.length > 0 && ` · ${withKey.length} met API key`}
                  {needsKey.length > 0 && ` · ${needsKey.length} wachten op key`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {autoable.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => autoProvisionAll.mutate()}
                  disabled={autoProvisionAll.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-auto-provision-all"
                >
                  {autoProvisionAll.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Auto Keys
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => provision.mutate()}
                disabled={provision.isPending}
                className="border-emerald-500/30 hover:bg-emerald-500/10"
                data-testid="button-provision"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${provision.isPending ? "animate-spin" : ""}`} />
                Scan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50" data-testid="stat-providers">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Cpu className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Providers</p>
                <p className="text-xl font-bold tabular-nums">{stats?.totalProviders || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50" data-testid="stat-online">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Online</p>
                <p className="text-xl font-bold tabular-nums">{stats?.onlineProviders || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50" data-testid="stat-keyfree">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Unlock className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Key-vrij</p>
                <p className="text-xl font-bold tabular-nums">{keyFreeProviders.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50" data-testid="stat-completed">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CheckCircle className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Taken</p>
                <p className="text-xl font-bold tabular-nums">{stats?.completedTasks || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider overzicht */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Providers</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => healthCheck.mutate()}
          disabled={healthCheck.isPending}
          data-testid="button-health-check"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${healthCheck.isPending ? "animate-spin" : ""}`} />
          Health Check
        </Button>
      </div>

      {/* Provider tabel — compacte weergave */}
      <Card className="border-border/50">
        <CardContent className="px-0 py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-8"></th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Provider</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Latency</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-provider-${p.id}`}>
                    <td className="px-4 py-2">
                      <StatusDot status={p.status} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium max-w-[220px] truncate block">{p.name}</span>
                        {isKeyFree(p) && (
                          <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shrink-0 px-1.5 py-0">
                            GRATIS
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {p.type === "chat" ? <MessageSquare className="w-3 h-3" /> :
                         p.type === "reasoning" ? <Brain className="w-3 h-3" /> :
                         p.type === "browser" ? <Globe className="w-3 h-3" /> :
                         p.type === "captcha" ? <Shield className="w-3 h-3" /> :
                         <Bot className="w-3 h-3" />}
                        {p.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isKeyFree(p) ? (
                        <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 px-1.5 py-0">
                          ACTIEF
                        </Badge>
                      ) : p.apiKey && p.apiKey.length > 0 ? (
                        <Badge className="text-[9px] bg-blue-500/15 text-blue-400 border-blue-500/30 px-1.5 py-0">
                          KEY OK
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30 px-1.5 py-0">
                          NODIG
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-mono text-muted-foreground">
                      {p.latencyMs ? `${p.latencyMs}ms` : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Auto-key provisioning status */}
      {autoKeyStatus.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Automatische Key Provisioning
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              De app probeert automatisch API keys te verkrijgen bij providers
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {autoKeyStatus.map((s: any) => (
                <div key={s.providerId} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{s.providerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.hasKey ? (
                      <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 px-1.5 py-0">
                        <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                        KEY OK
                      </Badge>
                    ) : s.canAutoProvision ? (
                      <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30 px-1.5 py-0">
                        <PlayCircle className="w-2.5 h-2.5 mr-0.5" />
                        AUTO
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground px-1.5 py-0">
                        OAUTH
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
