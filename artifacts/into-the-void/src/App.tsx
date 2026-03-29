import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedBackground } from "@/components/animated-background";
import { Navigation } from "@/components/navigation";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Orbit from "@/pages/orbit";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/orbit" component={Orbit} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <div className="relative min-h-screen w-full flex flex-col selection:bg-primary/30">
            <AnimatedBackground />
            <main className="flex-1 w-full h-full relative z-10">
              <Router />
            </main>
            <Navigation />
          </div>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
