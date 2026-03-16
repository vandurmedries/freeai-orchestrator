import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Globe, Play, Loader2, Monitor, MousePointer, Type, Eye,
  Shield, RotateCcw, ChevronRight,
} from "lucide-react";

interface BrowserAction {
  type: "navigate" | "click" | "type" | "screenshot" | "wait" | "captcha" | "extract";
  target?: string;
  value?: string;
}

export default function BrowserPage() {
  const [url, setUrl] = useState("https://");
  const [actions, setActions] = useState<BrowserAction[]>([]);
  const [currentAction, setCurrentAction] = useState<BrowserAction["type"]>("navigate");
  const [actionTarget, setActionTarget] = useState("");
  const [actionValue, setActionValue] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addAction = () => {
    const action: BrowserAction = { type: currentAction };
    if (actionTarget) action.target = actionTarget;
    if (actionValue) action.value = actionValue;
    setActions([...actions, action]);
    setActionTarget("");
    setActionValue("");
  };

  const removeAction = (idx: number) => {
    setActions(actions.filter((_, i) => i !== idx));
  };

  const executeBrowser = useMutation({
    mutationFn: async () => {
      setIsRunning(true);
      setLog([]);

      // Create and execute a multi-step browser task
      const res = await apiRequest("POST", "/api/tasks", {
        name: `Browser: ${url}`,
        type: "browse",
        status: "pending",
        input: JSON.stringify({ url, actions }),
        output: null,
        providerId: null,
        steps: null,
      });

      const task = await res.json();

      // Execute it
      const execRes = await apiRequest("POST", `/api/tasks/${task.id}/execute`);
      const result = await execRes.json();

      const steps = result.steps ? JSON.parse(result.steps) : [];
      setLog(steps);
      setIsRunning(false);
      return result;
    },
    onError: () => {
      setIsRunning(false);
      setLog(["Error: Browser sessie mislukt"]);
    },
  });

  const actionIcons: Record<string, any> = {
    navigate: Globe,
    click: MousePointer,
    type: Type,
    screenshot: Eye,
    wait: RotateCcw,
    captcha: Shield,
    extract: Monitor,
  };

  const actionLabels: Record<string, string> = {
    navigate: "Navigeer",
    click: "Klik",
    type: "Typ",
    screenshot: "Screenshot",
    wait: "Wacht",
    captcha: "CAPTCHA",
    extract: "Extraheer",
  };

  return (
    <div className="space-y-6" data-testid="browser-page">
      <div>
        <h2 className="text-lg font-semibold">Headless Browser</h2>
        <p className="text-xs text-muted-foreground">
          Automatiseer browser-acties: navigeren, klikken, typen, screenshots, CAPTCHA oplossen.
        </p>
      </div>

      {/* URL + Quick launch */}
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-9 font-mono text-sm"
                placeholder="https://example.com"
                data-testid="input-url"
              />
            </div>
            <Button
              onClick={() => executeBrowser.mutate()}
              disabled={isRunning || !url || url === "https://"}
              data-testid="button-launch"
            >
              {isRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
              {isRunning ? "Bezig..." : "Uitvoeren"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Action builder */}
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4 px-4 space-y-3">
            <p className="text-sm font-semibold">Acties Toevoegen</p>

            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(actionLabels) as BrowserAction["type"][]).map((type) => {
                const Icon = actionIcons[type];
                return (
                  <button
                    key={type}
                    onClick={() => setCurrentAction(type)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      currentAction === type
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border/50 hover:bg-muted/50"
                    }`}
                    data-testid={`action-type-${type}`}
                  >
                    <Icon className="w-3 h-3" />
                    {actionLabels[type]}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              {currentAction !== "screenshot" && currentAction !== "wait" && (
                <Input
                  value={actionTarget}
                  onChange={(e) => setActionTarget(e.target.value)}
                  placeholder={
                    currentAction === "navigate" ? "URL" :
                    currentAction === "click" ? "CSS selector (bijv. #submit-btn)" :
                    currentAction === "type" ? "CSS selector" :
                    currentAction === "captcha" ? "CAPTCHA type (reCAPTCHA, hCaptcha)" :
                    "CSS selector"
                  }
                  className="text-xs font-mono"
                  data-testid="input-action-target"
                />
              )}
              {(currentAction === "type" || currentAction === "wait") && (
                <Input
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  placeholder={currentAction === "type" ? "Tekst om te typen" : "Milliseconden (bijv. 2000)"}
                  className="text-xs font-mono"
                  data-testid="input-action-value"
                />
              )}
              <Button variant="outline" size="sm" onClick={addAction} className="text-xs" data-testid="button-add-action">
                Actie Toevoegen
              </Button>
            </div>

            {/* Action queue */}
            {actions.length > 0 && (
              <div className="space-y-1.5 mt-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Actielijst</p>
                {actions.map((action, i) => {
                  const Icon = actionIcons[action.type];
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-xs" data-testid={`queued-action-${i}`}>
                      <span className="text-primary font-mono text-[10px] w-5">{String(i + 1).padStart(2, "0")}</span>
                      <Icon className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{actionLabels[action.type]}</span>
                      {action.target && <span className="font-mono text-muted-foreground truncate">{action.target}</span>}
                      {action.value && <span className="text-muted-foreground">→ {action.value}</span>}
                      <button
                        onClick={() => removeAction(i)}
                        className="ml-auto text-muted-foreground hover:text-destructive text-[10px]"
                        data-testid={`button-remove-action-${i}`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Browser output / terminal */}
        <Card className="border-border/50 bg-card">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">browser://headless</span>
            </div>

            <div className="bg-background rounded-md p-3 min-h-[300px] font-mono text-xs space-y-1 overflow-y-auto max-h-[400px]" data-testid="browser-terminal">
              {log.length === 0 && !isRunning && (
                <div className="text-muted-foreground">
                  <p>$ freeai-browser --headless</p>
                  <p className="text-primary mt-1">Klaar om te starten. Configureer acties en klik op "Uitvoeren".</p>
                  <p className="mt-2 text-muted-foreground/60">Beschikbare capabilities:</p>
                  <p className="text-muted-foreground/60">&nbsp; • Navigeren naar URL's</p>
                  <p className="text-muted-foreground/60">&nbsp; • Elementen klikken</p>
                  <p className="text-muted-foreground/60">&nbsp; • Formulieren invullen</p>
                  <p className="text-muted-foreground/60">&nbsp; • Screenshots nemen</p>
                  <p className="text-muted-foreground/60">&nbsp; • CAPTCHA's oplossen</p>
                  <p className="text-muted-foreground/60">&nbsp; • Data extraheren</p>
                </div>
              )}

              {isRunning && (
                <div className="flex items-center gap-2 text-primary">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Browser sessie actief...</span>
                </div>
              )}

              {log.map((entry, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{entry}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
