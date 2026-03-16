import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot, Globe, Shield, Brain, Activity, Zap, CheckCircle, AlertTriangle,
  RefreshCw, MessageSquare, Cpu, MousePointer,
} from "lucide-react";
import type { Provider } from "@shared/schema";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" ? "bg-emerald-400" :
    status === "degraded" ? "bg-amber-400" :
    status === "offline" ? "bg-red-400" : "bg-gray-400";
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${color} ${status === "online" ? "animate-pulse-glow" : ""}`} />
  );
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "chat": return <MessageSquare className="w-4 h-4" />;
    case "reasoning": return <Brain className="w-4 h-4" />;
    case "browser": return <Globe className="w-4 h-4" />;
    case "captcha": return <Shield className="w-4 h-4" />;
    default: return <Bot className="w-4 h-4" />;
  }
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

  const healthCheck = useMutation({
    mutationFn: () => apiRequest("POST", "/api/providers/health-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const onlineProviders = providers.filter(p => p.status === "online");
  const chatProviders = providers.filter(p => p.type === "chat" || p.type === "reasoning");
  const browserProviders = providers.filter(p => p.type === "browser");
  const captchaProviders = providers.filter(p => p.type === "captcha");

  return (
    <div className="space-y-6" data-testid="dashboard-page">
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

        <Card className="border-border/50" data-testid="stat-tasks">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Taken</p>
                <p className="text-xl font-bold tabular-nums">{stats?.totalTasks || 0}</p>
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
                <p className="text-xs text-muted-foreground font-medium">Voltooid</p>
                <p className="text-xl font-bold tabular-nums">{stats?.completedTasks || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Health check button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI Providers</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => healthCheck.mutate()}
          disabled={healthCheck.isPending}
          data-testid="button-health-check"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${healthCheck.isPending ? "animate-spin" : ""}`} />
          {healthCheck.isPending ? "Checking..." : "Health Check"}
        </Button>
      </div>

      {/* Provider capability groups */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Chat & Reasoning */}
        <Card className="border-border/50">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              Chat & Redeneren
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {chatProviders.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors" data-testid={`provider-${p.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={p.status} />
                  <span className="text-xs font-medium truncate">{p.name}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {p.rateLimit || "N/A"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Browser */}
        <Card className="border-border/50">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              Browser Automatisering
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {browserProviders.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors" data-testid={`provider-${p.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={p.status} />
                  <span className="text-xs font-medium truncate">{p.name}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {p.rateLimit || "N/A"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Captcha */}
        <Card className="border-border/50">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              CAPTCHA Oplossers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {captchaProviders.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors" data-testid={`provider-${p.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <StatusDot status={p.status} />
                  <span className="text-xs font-medium truncate">{p.name}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {p.rateLimit || "N/A"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Full provider table */}
      <Card className="border-border/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Alle Providers</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Naam</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Model</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Latency</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Limiet</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors" data-testid={`row-provider-${p.id}`}>
                    <td className="px-4 py-2.5">
                      <StatusDot status={p.status} />
                    </td>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <TypeIcon type={p.type} />
                        {p.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{p.model || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono">
                      {p.latencyMs ? `${p.latencyMs}ms` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.rateLimit || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
