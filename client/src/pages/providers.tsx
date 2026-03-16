import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, RefreshCw, Key, ExternalLink, Settings,
  MessageSquare, Brain, Globe, Shield, Bot, Activity,
} from "lucide-react";
import type { Provider } from "@shared/schema";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" ? "bg-emerald-400" :
    status === "degraded" ? "bg-amber-400" :
    status === "offline" ? "bg-red-400" : "bg-gray-400";
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} ${status === "online" ? "animate-pulse-glow" : ""}`} />
  );
}

function TypeIcon({ type }: { type: string }) {
  const cls = "w-4 h-4";
  switch (type) {
    case "chat": return <MessageSquare className={cls} />;
    case "reasoning": return <Brain className={cls} />;
    case "browser": return <Globe className={cls} />;
    case "captcha": return <Shield className={cls} />;
    default: return <Bot className={cls} />;
  }
}

export default function Providers() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");

  // New provider form
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("chat");
  const [newEndpoint, setNewEndpoint] = useState("");
  const [newModel, setNewModel] = useState("");

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ["/api/providers"],
    queryFn: () => apiRequest("GET", "/api/providers").then(r => r.json()),
  });

  const healthCheck = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/providers/${id}/health`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
    },
  });

  const updateProvider = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Provider> }) =>
      apiRequest("PATCH", `/api/providers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      setEditingKey(null);
      setKeyValue("");
    },
  });

  const deleteProvider = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const addProvider = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/providers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowAddDialog(false);
      setNewName("");
      setNewEndpoint("");
      setNewModel("");
    },
  });

  const handleSaveKey = (id: string) => {
    updateProvider.mutate({ id, data: { apiKey: keyValue } });
  };

  const handleAdd = () => {
    if (!newName.trim() || !newEndpoint.trim()) return;
    addProvider.mutate({
      name: newName.trim(),
      type: newType,
      endpoint: newEndpoint.trim(),
      model: newModel.trim() || null,
      apiKeyRequired: true,
      apiKey: "",
      status: "unknown",
      latencyMs: null,
      rateLimit: null,
      description: null,
      config: null,
    });
  };

  return (
    <div className="space-y-6" data-testid="providers-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Provider Configuratie</h2>
          <p className="text-xs text-muted-foreground">
            Beheer AI-services, stel API-keys in, en monitor de status.
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-provider">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Provider Toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe Provider</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label className="text-xs">Naam</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="bijv. Groq Free Tier" className="text-sm mt-1" data-testid="input-new-name" />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="text-sm mt-1" data-testid="select-new-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="reasoning">Redeneren</SelectItem>
                    <SelectItem value="browser">Browser</SelectItem>
                    <SelectItem value="captcha">CAPTCHA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">API Endpoint</Label>
                <Input value={newEndpoint} onChange={(e) => setNewEndpoint(e.target.value)} placeholder="https://api.example.com/v1/chat" className="text-sm mt-1 font-mono" data-testid="input-new-endpoint" />
              </div>
              <div>
                <Label className="text-xs">Model (optioneel)</Label>
                <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="bijv. llama-3.3-70b" className="text-sm mt-1 font-mono" data-testid="input-new-model" />
              </div>
              <Button onClick={handleAdd} disabled={!newName.trim() || !newEndpoint.trim()} className="w-full" data-testid="button-confirm-add">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Toevoegen
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Provider cards */}
      <div className="grid gap-3">
        {providers.map((p) => (
          <Card key={p.id} className="border-border/50" data-testid={`provider-card-${p.id}`}>
            <CardContent className="py-4 px-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted/50 shrink-0">
                  <TypeIcon type={p.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusDot status={p.status} />
                    <span className="text-sm font-semibold">{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                    {p.latencyMs && (
                      <span className="text-[10px] text-muted-foreground font-mono">{p.latencyMs}ms</span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground mb-2">{p.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="font-mono truncate max-w-[300px]">{p.endpoint}</span>
                    {p.model && <span>Model: <span className="font-mono text-foreground">{p.model}</span></span>}
                    {p.rateLimit && <span>Limiet: {p.rateLimit}</span>}
                  </div>

                  {/* API Key section */}
                  {p.apiKeyRequired && (
                    <div className="mt-2 flex items-center gap-2">
                      {editingKey === p.id ? (
                        <>
                          <Input
                            value={keyValue}
                            onChange={(e) => setKeyValue(e.target.value)}
                            type="password"
                            placeholder="Voer API key in..."
                            className="text-xs h-7 font-mono max-w-[260px]"
                            data-testid={`input-key-${p.id}`}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleSaveKey(p.id)}
                            data-testid={`button-save-key-${p.id}`}
                          >
                            Opslaan
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => { setEditingKey(null); setKeyValue(""); }}
                          >
                            Annuleren
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => { setEditingKey(p.id); setKeyValue(p.apiKey || ""); }}
                          data-testid={`button-edit-key-${p.id}`}
                        >
                          <Key className="w-3 h-3 mr-1" />
                          {p.apiKey ? "Key ingesteld ✓" : "API Key instellen"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => healthCheck.mutate(p.id)}
                    disabled={healthCheck.isPending}
                    data-testid={`button-check-${p.id}`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${healthCheck.isPending ? "animate-spin" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteProvider.mutate(p.id)}
                    data-testid={`button-delete-${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
