import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Chat from "@/pages/chat";
import Tasks from "@/pages/tasks";
import Providers from "@/pages/providers";
import BrowserPage from "@/pages/browser";
import {
  LayoutDashboard, MessageSquare, ListTodo, Settings, Globe,
  Sun, Moon, Bot, Zap,
} from "lucide-react";

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="FreeAI Orchestrator">
      <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" className="text-primary" />
      <circle cx="16" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      <path d="M8 24c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-primary" opacity="0.5" />
      <path d="M10 16l6-4 6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" className="text-primary" />
    </svg>
  );
}

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/chat", label: "AI Chat", icon: MessageSquare },
  { path: "/tasks", label: "Taken", icon: ListTodo },
  { path: "/browser", label: "Browser", icon: Globe },
  { path: "/providers", label: "Providers", icon: Settings },
];

function Sidebar() {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r border-border/50 bg-sidebar" data-testid="sidebar">
      {/* Brand */}
      <div className="px-4 py-5 flex items-center gap-2.5">
        <Logo />
        <div>
          <span className="text-sm font-bold block leading-tight">FreeAI</span>
          <span className="text-[10px] text-muted-foreground font-medium">Orchestrator</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 mt-2">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location === path || (path !== "/" && location.startsWith(path));
          return (
            <Link key={path} href={path}>
              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-3 border-t border-border/30 space-y-2">
        <button
          onClick={toggle}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full"
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
        <PerplexityAttribution />
      </div>
    </aside>
  );
}

function MobileNav() {
  const [location] = useLocation();
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-border/50 px-2 py-1.5 flex justify-around" data-testid="mobile-nav">
      {navItems.map(({ path, label, icon: Icon }) => {
        const isActive = location === path || (path !== "/" && location.startsWith(path));
        return (
          <Link key={path} href={path}>
            <div className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] ${
              isActive ? "text-primary" : "text-muted-foreground"
            }`}>
              <Icon className="w-4 h-4" />
              {label}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/chat" component={Chat} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/browser" component={BrowserPage} />
      <Route path="/providers" component={Providers} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <div className="flex min-h-screen">
            <div className="hidden md:block">
              <Sidebar />
            </div>
            <main className="flex-1 p-6 pb-20 md:pb-6 overflow-auto">
              <AppRouter />
            </main>
            <MobileNav />
          </div>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
