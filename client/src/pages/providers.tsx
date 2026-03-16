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
  Plus, Trash2, RefreshCw, Key, ExternalLink,
  MessageSquare, Brain, Globe, Shield, Bot,
  Unlock, Sparkles, CheckCircle2, Zap,
  Loader2, PlayCircle, ArrowRight, AlertCircle,
} from "lucide-react";
import type { Provider } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface KeyRecipe {
  providerId: string;
  providerName: string;
  method: string;
  signupUrl: string;
  keyPageUrl: string;
  instructions: string[];
  hasKey: boolean;
  isOnline: boolean;
  internalId: string | null;
}

interface AutoKeyStatus {
  providerId: string;
  providerName: string;
  method: string;
  canAutoProvision: boolean;
  difficulty: string;
  reason: string;
  hasKey: boolean;
  isOnline: boolean;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "online" ? "bg-emerald-400" :
    status === "degraded" ? "bg-amber-400" :
    status === "offline" ? "bg-red-400" : "bg-zinc-500";
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} shrink-0`} />
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

function isKeyFree(p: Provider): boolean {
  if (!p.config) return false;
  try { return JSON.parse(p.config).keyFree === true; } catch { return false; }
}

export default function Providers() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardProvider, setWizardProvider] = useState<KeyRecipe | null>(null);
  const [wizardKey, setWizardKey] = useState("");

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("chat");
  const [newEndpoint, setNewEndpoint] = useState("");
  const [newModel, setNewModel] = useState("");

  const { toast } = useToast();

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ["/api/providers"],
    queryFn: () => apiRequest("GET", "/api/providers").then(r => r.json()),
  });

  const { data: recipes = [] } = useQuery<KeyRecipe[]>({
    queryKey: ["/api/keys/recipes"],
    queryFn: () => apiRequest("GET", "/api/keys/recipes").then(r => r.json()),
  });

  const { data: autoKeyStatus = [] } = useQuery<AutoKeyStatus[]>({
    queryKey: ["/api/auto-keys/status"],
    queryFn: () => apiRequest("GET", "/api/auto-keys/status").then(r => r.json()),
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
      queryClient.invalidateQueries({ queryKey: ["/api/keys/recipes"] });
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

  const submitKey = useMutation({
    mutationFn: async ({ providerId, apiKey }: { providerId: string; apiKey: string }) => {
      const res = await apiRequest("POST", "/api/keys/submit", { providerId, apiKey });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Key opgeslagen", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keys/recipes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auto-keys/status"] });
      setWizardOpen(false);
      setWizardKey("");
    },
    onError: (err: any) => {
      toast({ title: "Key ongeldig", description: err.message, variant: "destructive" });
    },
  });

  const autoProvisionOne = useMutation({
    mutationFn: async (providerId: string) => {
      const res = await apiRequest("POST", `/api/auto-keys/provision/${providerId}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Key automatisch opgehaald", description: `${data.providerName} is geconfigureerd` });
      } else {
        toast({ title: "Auto-provisioning", description: data.error || "Niet gelukt", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keys/recipes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auto-keys/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  const autoProvisionAll = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auto-keys/provision-all").then(r => r.json()),
    onSuccess: (data) => {
      const succeeded = data.filter((r: any) => r.success).length;
      toast({ title: "Auto-provisioning klaar", description: `${succeeded} van ${data.length} providers geconfigureerd` });
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keys/recipes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auto-keys/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
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

  const openWizard = (recipe: KeyRecipe) => {
    setWizardProvider(recipe);
    setWizardKey("");
    setWizardOpen(true);
  };

  const handleWizardSubmit = () => {
    if (!wizardProvider || !wizardKey.trim()) return;
    submitKey.mutate({ providerId: wizardProvider.providerId, apiKey: wizardKey.trim() });
  };

  const recipesNeedingKey = recipes.filter(r => r.method !== "key_free" && !r.hasKey);

  return (
    <div className="space-y-6" data-testid="providers-page">
      {/* Auto Key Provisioning Hero */}
      <Card className="border-primary/30 bg-primary/5" data-testid="auto-key-hero">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Automatisch API Keys Ophalen
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            De app haalt automatisch keys op bij providers. Key-vrije providers werken direct.
            Voor providers met OAuth (Google/GitHub login) kun je handmatig een key plakken.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {autoKeyStatus.map((s: AutoKeyStatus) => (
              <div key={s.providerId} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  {s.hasKey ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : s.canAutoProvision ? (
                    <PlayCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-zinc-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{s.providerName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{s.reason}</p>
                  </div>
                </div>
                <div className="shrink-0 ml-2">
                  {s.hasKey ? (
                    <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 px-1.5 py-0">
                      KLAAR
                    </Badge>
                  ) : s.canAutoProvision ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] border-amber-500/30 hover:bg-amber-500/10"
                      onClick={() => autoProvisionOne.mutate(s.providerId)}
                      disabled={autoProvisionOne.isPending}
                      data-testid={`button-auto-${s.providerId}`}
                    >
                      {autoProvisionOne.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <Zap className="w-3 h-3 mr-1" />
                          Auto
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => {
                        const recipe = recipes.find(r => r.providerId === s.providerId);
                        if (recipe) openWizard(recipe);
                      }}
                      data-testid={`button-manual-${s.providerId}`}
                    >
                      <Key className="w-3 h-3 mr-1" />
                      Handmatig
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {autoKeyStatus.some((s: AutoKeyStatus) => s.canAutoProvision && !s.hasKey) && (
            <Button
              onClick={() => autoProvisionAll.mutate()}
              disabled={autoProvisionAll.isPending}
              className="w-full mt-3"
              data-testid="button-auto-all"
            >
              {autoProvisionAll.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Alle Keys Automatisch Ophalen
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Handmatige Key Wizard voor OAuth providers */}
      {recipesNeedingKey.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="key-wizard-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              Handmatige Keys ({recipesNeedingKey.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Deze providers vereisen OAuth login. Haal je key op en plak hem hier.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {recipesNeedingKey.map((recipe) => (
                <button
                  key={recipe.providerId}
                  onClick={() => openWizard(recipe)}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-all text-left group"
                  data-testid={`wizard-${recipe.providerId}`}
                >
                  <div className="p-1.5 rounded bg-amber-500/10 group-hover:bg-primary/10 transition-colors shrink-0">
                    <Key className="w-3.5 h-3.5 text-amber-400 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{recipe.providerName}</p>
                    <p className="text-[10px] text-muted-foreground">Key plakken</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {wizardProvider?.providerName} — API Key
            </DialogTitle>
          </DialogHeader>
          {wizardProvider && (
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                {wizardProvider.instructions.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-primary font-bold mt-0.5">{i + 1}.</span>
                    <span className="text-muted-foreground">{step.replace(/^\d+\.\s*/, "")}</span>
                  </div>
                ))}
              </div>

              {wizardProvider.keyPageUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => window.open(wizardProvider.keyPageUrl, "_blank")}
                  data-testid="button-open-provider"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  Open Key Pagina
                </Button>
              )}

              <div>
                <Label className="text-xs font-medium">Plak je API Key</Label>
                <Input
                  value={wizardKey}
                  onChange={(e) => setWizardKey(e.target.value)}
                  type="password"
                  placeholder="Plak je API key..."
                  className="text-sm mt-1 font-mono"
                  data-testid="input-wizard-key"
                />
              </div>

              <Button
                onClick={handleWizardSubmit}
                disabled={!wizardKey.trim() || submitKey.isPending}
                className="w-full"
                data-testid="button-wizard-submit"
              >
                {submitKey.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Valideren...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                    Valideer & Opslaan
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Provider configuratie */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Alle Providers</h2>
          <p className="text-xs text-muted-foreground">
            Beheer providers, API-keys en status
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-provider">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Toevoegen
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
          <Card key={p.id} className={`border-border/50 ${isKeyFree(p) ? "border-emerald-500/20" : ""}`} data-testid={`provider-card-${p.id}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted/50 shrink-0">
                  <TypeIcon type={p.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusDot status={p.status} />
                    <span className="text-sm font-semibold truncate max-w-[280px]">{p.name}</span>
                    <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                    {isKeyFree(p) && (
                      <Badge className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                        <Unlock className="w-2.5 h-2.5 mr-0.5" />
                        GRATIS
                      </Badge>
                    )}
                    {p.latencyMs && (
                      <span className="text-[10px] text-muted-foreground font-mono">{p.latencyMs}ms</span>
                    )}
                  </div>
                  {p.model && (
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{p.model}</p>
                  )}

                  {/* API Key inline edit */}
                  {p.apiKeyRequired && !isKeyFree(p) && (
                    <div className="mt-1.5 flex items-center gap-2">
                      {editingKey === p.id ? (
                        <>
                          <Input
                            value={keyValue}
                            onChange={(e) => setKeyValue(e.target.value)}
                            type="password"
                            placeholder="API key..."
                            className="text-xs h-7 font-mono max-w-[240px]"
                            data-testid={`input-key-${p.id}`}
                          />
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleSaveKey(p.id)} data-testid={`button-save-key-${p.id}`}>
                            Opslaan
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setEditingKey(null); setKeyValue(""); }}>
                            X
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-muted-foreground px-2"
                          onClick={() => { setEditingKey(p.id); setKeyValue(p.apiKey || ""); }}
                          data-testid={`button-edit-key-${p.id}`}
                        >
                          <Key className="w-3 h-3 mr-1" />
                          {p.apiKey ? "Key wijzigen" : "Key instellen"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => healthCheck.mutate(p.id)} disabled={healthCheck.isPending} data-testid={`button-check-${p.id}`}>
                    <RefreshCw className={`w-3.5 h-3.5 ${healthCheck.isPending ? "animate-spin" : ""}`} />
                  </Button>
                  {!isKeyFree(p) && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteProvider.mutate(p.id)} data-testid={`button-delete-${p.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
