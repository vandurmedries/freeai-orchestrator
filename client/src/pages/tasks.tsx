import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Play, Plus, Loader2, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  MessageSquare, Globe, MousePointer, UserPlus, ListTodo,
} from "lucide-react";
import type { Task } from "@shared/schema";

function TaskTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "chat": return <MessageSquare className="w-3.5 h-3.5" />;
    case "scrape": return <Globe className="w-3.5 h-3.5" />;
    case "browse": return <MousePointer className="w-3.5 h-3.5" />;
    case "register": return <UserPlus className="w-3.5 h-3.5" />;
    case "plan": return <ListTodo className="w-3.5 h-3.5" />;
    default: return <Play className="w-3.5 h-3.5" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "completed" ? "default" : status === "running" ? "secondary" : status === "failed" ? "destructive" : "outline";
  const Icon = status === "completed" ? CheckCircle : status === "running" ? Loader2 : status === "failed" ? XCircle : Clock;
  return (
    <Badge variant={variant} className="text-[10px] gap-1">
      <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
      {status}
    </Badge>
  );
}

export default function Tasks() {
  const [taskName, setTaskName] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [taskType, setTaskType] = useState("chat");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: () => apiRequest("GET", "/api/tasks").then(r => r.json()),
    refetchInterval: 2000,
  });

  const createTask = useMutation({
    mutationFn: (data: { name: string; type: string; input: string }) =>
      apiRequest("POST", "/api/tasks", {
        ...data,
        status: "pending",
        output: null,
        providerId: null,
        steps: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setTaskName("");
      setTaskInput("");
    },
  });

  const executeTask = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/tasks/${id}/execute`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  const handleCreate = () => {
    if (!taskName.trim() || !taskInput.trim()) return;
    createTask.mutate({ name: taskName.trim(), type: taskType, input: taskInput.trim() });
  };

  return (
    <div className="space-y-6" data-testid="tasks-page">
      <div>
        <h2 className="text-lg font-semibold">Taken Orchestrator</h2>
        <p className="text-xs text-muted-foreground">
          Maak taken aan en voer ze uit met automatische provider selectie en orchestratie.
        </p>
      </div>

      {/* Create task form */}
      <Card className="border-border/50 border-dashed">
        <CardContent className="pt-4 pb-4 px-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
            <Input
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Taaknaam..."
              className="text-sm"
              data-testid="input-task-name"
            />
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger className="w-[140px] text-xs" data-testid="select-task-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="scrape">Scrape</SelectItem>
                <SelectItem value="browse">Browse</SelectItem>
                <SelectItem value="register">Registreer</SelectItem>
                <SelectItem value="plan">Plan</SelectItem>
                <SelectItem value="multi">Multi-stap</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Input (URL, vraag, instructie)..."
              className="text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              data-testid="input-task-input"
            />
            <Button
              onClick={handleCreate}
              disabled={!taskName.trim() || !taskInput.trim() || createTask.isPending}
              size="sm"
              data-testid="button-create-task"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Aanmaken
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.length === 0 && (
          <Card className="border-border/50">
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nog geen taken. Maak je eerste taak hierboven aan.
              </p>
            </CardContent>
          </Card>
        )}

        {tasks.map((task) => {
          const isExpanded = expandedTask === task.id;
          const steps = task.steps ? JSON.parse(task.steps) : [];

          return (
            <Card key={task.id} className="border-border/50" data-testid={`task-${task.id}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded bg-muted/50">
                    <TaskTypeIcon type={task.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{task.name}</span>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{task.input}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {task.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => executeTask.mutate(task.id)}
                        disabled={executeTask.isPending}
                        className="text-xs"
                        data-testid={`button-execute-${task.id}`}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Uitvoeren
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                      data-testid={`button-expand-${task.id}`}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
                    {steps.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Stappen</p>
                        <div className="space-y-1">
                          {steps.map((step: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-primary font-mono text-[10px]">{String(i + 1).padStart(2, "0")}</span>
                              <span className="text-muted-foreground">{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {task.output && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Output</p>
                        <div className="bg-muted/30 rounded-md p-3 text-xs font-mono whitespace-pre-wrap">
                          {task.output}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
